import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addOrg } from '../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, makeSubmission } from '../../../tests/helpers/verify';
import { buildContext } from '../capture/context';
import { jcs, sha256Hex } from '../crypto';
import { writeTx } from '../db/client';
import { ledgerEntries, plots, remoteSensingCache } from '../db/schema';
import type { PlotPolygon } from '../geo/types';
import { createFixtureProvider, loadFixtureSet, type FaultMode, type FixtureSet } from '../remote-sensing/fixture';
import { withCache, withTimeouts } from '../remote-sensing';
import type { ProviderName, RemoteSensingProvider } from '../remote-sensing/types';
import { verify } from '../verification/verify';
import { createFarmer } from './farmers';
import { editPlot, getPlot, registerPlot, setOnPlotGeometrySaved } from './plots';
import { needsRerun, parseRegistrationChecks, runRegistrationChecks } from './registration';

// TSK-07.6 · TC-034 (registration runs forest loss and the 12-month NDVI history and anchors them),
// TC-028 cache half and EVAL-044 (an edit to cleared land re-queries, the card shows 18.0 %, the next
// capture is Rejected by deforestation_overlap), and a provider failure at registration (the plot is
// saved, the check is unavailable, a re-run is offered).

vi.hoisted(() => {
  process.env.LOG_LEVEL = 'silent';
});

const FIXTURES = join(__dirname, '..', '..', '..', 'evals', 'fixtures');
const doc = (p: string) => JSON.parse(readFileSync(join(FIXTURES, p), 'utf8')) as { geometry?: PlotPolygon; features?: { geometry: PlotPolygon }[] };
const P01 = doc('plots/P01.geojson').geometry!;
const P01_EDITED_18PCT = doc('geometry/P01-edited-18pct.geojson').features![0]!.geometry;
const NOW = () => new Date('2026-12-08T05:30:00.000Z'); // 11:00 IST: registration month 2026-12

let t: TempDb;
let fixtureSet: FixtureSet;
let calls: { forestLoss: number; ndviHistory: number };
let faults: { provider: ProviderName; mode: FaultMode }[];

/** The app's stack (fixture → 8 s timeouts → cache) over a counting fixture provider. */
function provider(): RemoteSensingProvider {
  const fx = createFixtureProvider({ ...fixtureSet, faults, fallback: fixtureSet.profiles.P01 });
  const counting: RemoteSensingProvider = {
    name: 'fixture',
    forestLoss: (p, o) => (calls.forestLoss++, fx.forestLoss(p, o)),
    ndviHistory: (p, m, o) => (calls.ndviHistory++, fx.ndviHistory(p, m, o)),
    ndviWindow: (p, d, n, o) => fx.ndviWindow(p, d, n, o),
  };
  return withCache(withTimeouts(counting), t.db, { now: NOW });
}

beforeEach(async () => {
  t = await tempDb();
  fixtureSet ??= await loadFixtureSet(FIXTURES);
  calls = { forestLoss: 0, ndviHistory: 0 };
  faults = [];
  await addOrg(t.db, 'ORG-A', 'fpo');
  setOnPlotGeometrySaved((plotId, _g, { db, orgId }) => runRegistrationChecks(db, orgId, plotId, { remoteSensing: provider(), now: NOW }).then(() => undefined));
});
afterEach(async () => {
  setOnPlotGeometrySaved(undefined);
  await t.cleanup();
});

const ledger = async () => (await t.db.select().from(ledgerEntries)).map((e) => ({ seq: e.seq, kind: e.kind, payload: JSON.parse(e.payload) as Record<string, unknown> }));
const farmer = () => writeTx(t.db, (tx) => createFarmer(tx, { orgId: 'ORG-A', name: 'Kaveri Appaiah', identifier: 'KGU-0042' }));
const plotRow = async (plotId: string) => (await t.db.select().from(plots).where(eq(plots.id, plotId)))[0]!;

describe('registration checks on save (TC-034)', () => {
  it('saving P01 stores forest loss and the NDVI history with their evidence, clears stale and anchors the results’ hash', async () => {
    const f = await farmer();
    const { plotId, anchorSeq } = await registerPlot(t.db, 'ORG-A', { farmerId: f.id, crop: 'arabica', geometry: P01 }, NOW);
    const row = await plotRow(plotId);
    const checks = parseRegistrationChecks(row.registrationChecks)!;
    expect(checks.forestLoss).toMatchObject({
      status: 'ok',
      lossPct: 0,
      lossHa: 0,
      yearsFrom: 2021,
      dataYear: 2025,
      evidence: '0.0% of plot area lost since 2021 (hard fail at 10.0%)',
    });
    expect(checks.ndviHistory).toMatchObject({
      status: 'ok',
      endMonth: '2026-12',
      min: 0.62,
      max: 0.81,
      clearMonths: 11,
      evidence: 'Canopy all year: monthly NDVI 0.62–0.81 over 11 clear months (needs ≥ 0.50, swing ≤ 0.35)',
    });
    expect(row.registrationStale).toBe(0);

    const entries = await ledger();
    expect(entries.map((e) => e.kind)).toEqual(['plot_registered', 'plot_edited']);
    const anchor = entries[1]!;
    expect(anchor.seq).toBe(anchorSeq + 1);
    expect(row.anchorSeq).toBe(anchor.seq);
    expect(anchor.payload.registrationChecksHash).toBe(await sha256Hex(row.registrationChecks!));
    expect(await sha256Hex(jcs(checks))).toBe(anchor.payload.registrationChecksHash);
    // The anchor carries the unchanged current geometry: it may be read as the plot's latest polygon.
    expect(anchor.payload).toMatchObject({ plotId, crop: 'arabica', polygon: P01, geometryHash: entries[0]!.payload.geometryHash, areaHa: entries[0]!.payload.areaHa });
    expect((await getPlot(t.db, 'ORG-A', plotId))!.status).toBe('fresh');
  });

  it('the answers are cached under the geometry: re-running on the same polygon asks nothing again', async () => {
    const f = await farmer();
    const { plotId } = await registerPlot(t.db, 'ORG-A', { farmerId: f.id, crop: 'arabica', geometry: P01 }, NOW);
    expect(calls).toEqual({ forestLoss: 1, ndviHistory: 1 });
    await runRegistrationChecks(t.db, 'ORG-A', plotId, { remoteSensing: provider(), now: NOW });
    expect(calls).toEqual({ forestLoss: 1, ndviHistory: 1 });
    const kinds = (await t.db.select().from(remoteSensingCache)).map((r) => [r.kind, r.monthBucket]).sort();
    expect(kinds).toEqual([
      ['loss', 'static'],
      ['ndvi_history', '2026-12'],
    ]);
  });
});

describe('an edit to cleared land (TC-028 cache half, EVAL-044)', () => {
  it('re-queries because the geometry hash changed, records 18.0 %, and the next capture is Rejected by deforestation_overlap', async () => {
    const f = await farmer();
    const { plotId } = await registerPlot(t.db, 'ORG-A', { farmerId: f.id, crop: 'arabica', geometry: P01 }, NOW);
    expect(calls.forestLoss).toBe(1);

    await editPlot(t.db, 'ORG-A', plotId, P01_EDITED_18PCT, NOW);
    expect(calls.forestLoss).toBe(2); // the stale 0.0 % answer was not reused
    const row = await plotRow(plotId);
    const checks = parseRegistrationChecks(row.registrationChecks)!;
    expect(checks.forestLoss).toMatchObject({ status: 'fail', hardFail: true, lossPct: 18 });
    expect(checks.forestLoss.evidence).toBe('18.0% of plot area lost since 2021 (hard fail at 10.0%)');
    expect(row.registrationStale).toBe(0);
    expect((await ledger()).map((e) => e.kind)).toEqual(['plot_registered', 'plot_edited', 'plot_edited', 'plot_edited']);

    // The next capture on the plot: the capture check reads the registration answer from the cache.
    const device = await makeDevice();
    const sub = { ...(await makeSubmission({ device, plotId })), serverReceivedAt: NOW().toISOString() };
    const ctx = await buildContext(
      t.db,
      {
        payload: sub.payload,
        device: { id: device.id, agentId: 'AG-NOBODY', publicJwk: device.publicJwk, revokedAt: null, lastSeq: 0, lastEventHash: null },
        plot: row,
      },
      { remoteSensing: provider() },
    );
    const res = await verify(sub, ctx);
    expect(calls.forestLoss).toBe(2);
    expect(res.verdict).toBe('Rejected');
    expect(res.checks.find((c) => c.id === 'deforestation_overlap')).toMatchObject({ status: 'fail', hardFail: true, evidence: expect.stringContaining('18.0%') });
    expect(ctx.plot.historyEndMonth).toBe('2026-12');
  });
});

describe('a provider failure at registration', () => {
  it('saves the plot, marks the forest-loss check unavailable naming GFW, and a re-run fills it', async () => {
    faults = [{ provider: 'gfw', mode: 'http_500' }];
    const f = await farmer();
    const { plotId } = await registerPlot(t.db, 'ORG-A', { farmerId: f.id, crop: 'arabica', geometry: P01 }, NOW);
    const detail = (await getPlot(t.db, 'ORG-A', plotId))!;
    const checks = parseRegistrationChecks((await plotRow(plotId)).registrationChecks)!;
    expect(checks.forestLoss).toMatchObject({
      status: 'unavailable',
      provider: 'gfw',
      lossPct: null,
      evidence: 'Forest-loss data unavailable: HTTP 500; an admin re-run will retry',
    });
    expect(checks.ndviHistory.status).toBe('ok');
    expect(needsRerun(checks)).toBe(true);
    expect(detail.registrationChecks).toEqual(checks);
    expect(await t.db.select().from(remoteSensingCache).where(eq(remoteSensingCache.kind, 'loss'))).toEqual([]); // never cache an error

    faults = [];
    const again = (await runRegistrationChecks(t.db, 'ORG-A', plotId, { remoteSensing: provider(), now: NOW }))!;
    expect(again.forestLoss).toMatchObject({ status: 'ok', lossPct: 0 });
    expect(needsRerun(parseRegistrationChecks((await plotRow(plotId)).registrationChecks))).toBe(false);
    expect((await ledger()).map((e) => e.kind)).toEqual(['plot_registered', 'plot_edited', 'plot_edited']);
  });

  it('a hook that throws still leaves the plot saved (registration is best effort after the commit)', async () => {
    setOnPlotGeometrySaved(async () => {
      throw new Error('provider down');
    });
    const f = await farmer();
    const { plotId } = await registerPlot(t.db, 'ORG-A', { farmerId: f.id, crop: 'arabica', geometry: P01 }, NOW);
    expect((await getPlot(t.db, 'ORG-A', plotId))!.status).toBe('pending');
  });

  it('another org’s plot is not found', async () => {
    const f = await farmer();
    const { plotId } = await registerPlot(t.db, 'ORG-A', { farmerId: f.id, crop: 'arabica', geometry: P01 }, NOW);
    await expect(runRegistrationChecks(t.db, 'ORG-B', plotId, { remoteSensing: provider(), now: NOW })).rejects.toMatchObject({ code: 'plot_not_found' });
  });
});
