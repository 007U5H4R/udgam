import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addOrg } from '../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { jcs, sha256Hex } from '../crypto';
import { writeTx } from '../db/client';
import { farmers, ledgerEntries, plots } from '../db/schema';
import type { PlotPolygon } from '../geo/types';
import { maybeCheckpoint } from '../ledger/checkpoint';
import { setOnAppended, verifyChain } from '../ledger/hashchain';
import { createFarmer } from './farmers';
import { editPlot, getPlot, listPlots, PlotsError, registerPlot, setOnPlotGeometrySaved } from './plots';

// TSK-06.3: farmers and plots persist with their anchors in one transaction (§8.1, TP14). TC-027 (area
// on save), TC-028 (edit half: plot_edited anchored, registration_stale=1), TC-010 pattern (a failing
// ledger append leaves no plot row), TC-019 (another org's plot is not found).

vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
});

const P01 = (JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'evals', 'fixtures', 'plots', 'P01.geojson'), 'utf8')) as { geometry: PlotPolygon }).geometry;
const SQUARE: PlotPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [75.74, 12.42],
      [75.741, 12.42],
      [75.741, 12.421],
      [75.74, 12.421],
      [75.74, 12.42],
    ],
  ],
};
const geomHash = (g: PlotPolygon) => sha256Hex(jcs({ type: g.type, coordinates: g.coordinates }));

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
  await addOrg(t.db, 'ORG-A', 'fpo');
  await addOrg(t.db, 'ORG-B', 'fpo');
});
afterEach(async () => {
  setOnAppended(maybeCheckpoint);
  setOnPlotGeometrySaved(undefined);
  await t.cleanup();
});

const ledger = async () => (await t.db.select().from(ledgerEntries)).map((e) => ({ seq: e.seq, kind: e.kind, payload: JSON.parse(e.payload) as Record<string, unknown> }));

async function farmerIn(orgId: string, name = 'Kaveri Appaiah') {
  return writeTx(t.db, (tx) => createFarmer(tx, { orgId, name, identifier: 'KGU-0042' }));
}

describe('createFarmer', () => {
  it('gives a public producer ID PR- + 8 Crockford base32 and keeps name and identifier private to the org', async () => {
    const f = await farmerIn('ORG-A');
    expect(f.producerId).toMatch(/^PR-[0-9A-HJKMNP-TV-Z]{8}$/);
    const [row] = await t.db.select().from(farmers);
    expect(row).toMatchObject({ id: f.id, orgId: 'ORG-A', name: 'Kaveri Appaiah', identifier: 'KGU-0042', producerId: f.producerId });
    expect(await ledger()).toEqual([]); // a farmer is not anchored on its own; its plot is
  });
});

describe('registerPlot', () => {
  it('writes the plot and a public-safe plot_registered entry in one transaction; area computed on the server', async () => {
    const f = await farmerIn('ORG-A');
    const { plotId, anchorSeq } = await registerPlot(t.db, 'ORG-A', { farmerId: f.id, crop: 'arabica', geometry: P01 });
    expect(plotId).toMatch(/^PL-[0-9A-HJKMNP-TV-Z]{8}$/);

    const [row] = await t.db.select().from(plots);
    expect(row!.anchorSeq).toBe(anchorSeq);
    expect(Math.abs(row!.areaHa - 2.0) / 2.0).toBeLessThan(0.005); // TC-027
    expect(row!.registrationStale).toBe(0);
    expect(row!.registrationChecks).toBeNull(); // TKT-07 runs the registration checks
    expect(JSON.parse(row!.geojson)).toEqual(P01);

    const entries = await ledger();
    expect(entries).toEqual([
      {
        seq: anchorSeq,
        kind: 'plot_registered',
        payload: { plotId, producerId: f.producerId, crop: 'arabica', areaHa: row!.areaHa, geometryHash: await geomHash(P01), polygon: P01 },
      },
    ]);
    const text = JSON.stringify(entries);
    expect(text).not.toContain('Kaveri');
    expect(text).not.toContain('KGU-0042');
    expect(await verifyChain(t.db)).toEqual({ ok: true });
  });

  it('can create the farmer in the same transaction', async () => {
    const { plotId } = await registerPlot(t.db, 'ORG-A', { newFarmer: { name: 'Bopanna M.', identifier: null }, crop: 'robusta', geometry: SQUARE });
    const plot = await getPlot(t.db, 'ORG-A', plotId);
    expect(plot).toMatchObject({ farmerName: 'Bopanna M.', crop: 'robusta' });
    expect(plot!.producerId).toMatch(/^PR-/);
  });

  it('a failure injected into the ledger append leaves no plot row and no entry (TC-010 pattern)', async () => {
    const f = await farmerIn('ORG-A');
    setOnAppended(async () => {
      throw new Error('injected');
    });
    await expect(registerPlot(t.db, 'ORG-A', { farmerId: f.id, crop: 'arabica', geometry: P01 })).rejects.toThrow('injected');
    expect(await t.db.select().from(plots)).toEqual([]);
    expect(await ledger()).toEqual([]);
  });

  it('a new farmer is rolled back with a failed registration', async () => {
    setOnAppended(async () => {
      throw new Error('injected');
    });
    await expect(registerPlot(t.db, 'ORG-A', { newFarmer: { name: 'Rolled back', identifier: null }, crop: 'arabica', geometry: P01 })).rejects.toThrow('injected');
    expect(await t.db.select().from(farmers)).toEqual([]);
  });

  it("refuses another org's farmer as not found, and an invalid geometry with its reason", async () => {
    const other = await farmerIn('ORG-B');
    await expect(registerPlot(t.db, 'ORG-A', { farmerId: other.id, crop: 'arabica', geometry: P01 })).rejects.toEqual(new PlotsError('farmer_not_found'));
    const f = await farmerIn('ORG-A');
    const open: PlotPolygon = { type: 'Polygon', coordinates: [(SQUARE.coordinates[0] as number[][]).slice(0, 4)] };
    await expect(registerPlot(t.db, 'ORG-A', { farmerId: f.id, crop: 'arabica', geometry: open })).rejects.toMatchObject({ code: 'invalid_geometry', reason: 'open_ring' });
    expect(await ledger()).toEqual([]);
  });

  it('calls onPlotGeometrySaved after the commit with the saved geometry', async () => {
    const f = await farmerIn('ORG-A');
    const calls: [string, PlotPolygon, number][] = [];
    setOnPlotGeometrySaved(async (plotId, geometry) => {
      calls.push([plotId, geometry, (await t.db.select().from(plots)).length]);
    });
    const { plotId } = await registerPlot(t.db, 'ORG-A', { farmerId: f.id, crop: 'arabica', geometry: P01 });
    expect(calls).toEqual([[plotId, P01, 1]]);
  });

  it('a failing onPlotGeometrySaved hook does not undo the saved plot', async () => {
    const f = await farmerIn('ORG-A');
    setOnPlotGeometrySaved(async () => {
      throw new Error('provider down');
    });
    const { plotId } = await registerPlot(t.db, 'ORG-A', { farmerId: f.id, crop: 'arabica', geometry: P01 });
    expect(await getPlot(t.db, 'ORG-A', plotId)).not.toBeNull();
  });
});

describe('editPlot (TC-028 edit half, EVAL-044)', () => {
  it('anchors plot_edited as a new fact, sets registration_stale=1 and never rewrites the old entry', async () => {
    const f = await farmerIn('ORG-A');
    const reg = await registerPlot(t.db, 'ORG-A', { farmerId: f.id, crop: 'arabica', geometry: P01 });
    const before = await t.db.select().from(ledgerEntries);

    const { anchorSeq } = await editPlot(t.db, 'ORG-A', reg.plotId, SQUARE);
    expect(anchorSeq).toBe(reg.anchorSeq + 1);

    const after = await t.db.select().from(ledgerEntries);
    expect(after.slice(0, before.length)).toEqual(before); // history untouched
    const [row] = await t.db.select().from(plots);
    expect(row).toMatchObject({ registrationStale: 1, anchorSeq });
    expect(JSON.parse(row!.geojson)).toEqual(SQUARE);
    expect(row!.updatedAt >= row!.createdAt).toBe(true);

    const edited = (await ledger()).at(-1)!;
    expect(edited).toEqual({
      seq: anchorSeq,
      kind: 'plot_edited',
      payload: {
        plotId: reg.plotId,
        producerId: f.producerId,
        crop: 'arabica',
        areaHa: row!.areaHa,
        previousGeometryHash: await geomHash(P01),
        geometryHash: await geomHash(SQUARE),
        polygon: SQUARE,
      },
    });
    expect(await verifyChain(t.db)).toEqual({ ok: true });
    expect((await getPlot(t.db, 'ORG-A', reg.plotId))!.status).toBe('stale');
  });

  it('an unchanged geometry anchors nothing', async () => {
    const f = await farmerIn('ORG-A');
    const reg = await registerPlot(t.db, 'ORG-A', { farmerId: f.id, crop: 'arabica', geometry: P01 });
    expect(await editPlot(t.db, 'ORG-A', reg.plotId, structuredClone(P01))).toEqual({ anchorSeq: reg.anchorSeq, unchanged: true });
    expect(await ledger()).toHaveLength(1);
    expect((await t.db.select().from(plots))[0]!.registrationStale).toBe(0);
  });

  it("another org's plot is not found and stays untouched (TC-019)", async () => {
    const f = await farmerIn('ORG-B');
    const reg = await registerPlot(t.db, 'ORG-B', { farmerId: f.id, crop: 'arabica', geometry: P01 });
    await expect(editPlot(t.db, 'ORG-A', reg.plotId, SQUARE)).rejects.toEqual(new PlotsError('plot_not_found'));
    expect(await ledger()).toHaveLength(1);
  });

  it('a failure injected into the ledger append leaves the plot as it was', async () => {
    const f = await farmerIn('ORG-A');
    const reg = await registerPlot(t.db, 'ORG-A', { farmerId: f.id, crop: 'arabica', geometry: P01 });
    const [before] = await t.db.select().from(plots);
    setOnAppended(async () => {
      throw new Error('injected');
    });
    await expect(editPlot(t.db, 'ORG-A', reg.plotId, SQUARE)).rejects.toThrow('injected');
    expect((await t.db.select().from(plots))[0]).toEqual(before);
  });
});

describe('listPlots and getPlot', () => {
  it("list only the org's plots with farmer, producer ID, crop, area and registration status", async () => {
    const a = await farmerIn('ORG-A', 'Farmer A');
    const b = await farmerIn('ORG-B', 'Farmer B');
    const p1 = await registerPlot(t.db, 'ORG-A', { farmerId: a.id, crop: 'arabica', geometry: P01 });
    const p2 = await registerPlot(t.db, 'ORG-A', { farmerId: a.id, crop: 'robusta', geometry: SQUARE });
    await registerPlot(t.db, 'ORG-B', { farmerId: b.id, crop: 'arabica', geometry: SQUARE });
    await editPlot(t.db, 'ORG-A', p2.plotId, P01);
    await writeTx(t.db, (tx) => tx.update(plots).set({ registrationChecks: '{"deforestation":"ok"}' }).where(eqId(p1.plotId)));

    const list = await listPlots(t.db, 'ORG-A');
    expect(list.map((p) => p.id).sort()).toEqual([p1.plotId, p2.plotId].sort());
    const byId = Object.fromEntries(list.map((p) => [p.id, p]));
    expect(byId[p1.plotId]).toMatchObject({ farmerName: 'Farmer A', producerId: a.producerId, crop: 'arabica', status: 'fresh' });
    expect(byId[p2.plotId]).toMatchObject({ crop: 'robusta', status: 'stale' });
    expect(Math.abs(byId[p1.plotId]!.areaHa - 2)).toBeLessThan(0.01);
  });

  it("getPlot returns the geometry for the org and null for another org's ID or an unknown one (TC-019)", async () => {
    const b = await farmerIn('ORG-B');
    const reg = await registerPlot(t.db, 'ORG-B', { farmerId: b.id, crop: 'arabica', geometry: P01 });
    expect(await getPlot(t.db, 'ORG-A', reg.plotId)).toBeNull();
    expect(await getPlot(t.db, 'ORG-A', 'PL-NOPE0000')).toBeNull();
    expect(await getPlot(t.db, 'ORG-B', reg.plotId)).toMatchObject({ id: reg.plotId, geometry: P01, status: 'pending', registrationStale: false });
  });
});

const eqId = (id: string) => eq(plots.id, id);
