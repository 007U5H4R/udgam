import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, and } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedCapture, seedFpo, type FpoWorld } from '../../../../tests/helpers/batch-fixtures';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { writeTx } from '../client';
import { agentPlots } from '../schema';
import { getFieldHome, recentKgRange } from './field-home';

// TSK-10.5 / TSK-10.8: what the capture Home shows — the agent's assigned, unrevoked plots in their own
// organisation (most recently picked first) and their last three pickings — and the farmer's own
// recent kg range for the weight hint (never the yield threshold, D6).

const dataDir = mkdtempSync(join(tmpdir(), 'udgam-field-home-'));
vi.stubEnv('DATA_DIR', dataDir);
vi.stubEnv('LOG_LEVEL', 'silent');
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

let t: TempDb;
let w: FpoWorld;
beforeEach(async () => {
  t = await tempDb();
  w = await seedFpo(t.db);
});
afterEach(async () => {
  await t.cleanup();
});

const assign = (agentId: string, plotId: string, at = new Date().toISOString()) =>
  writeTx(t.db, (tx) => tx.insert(agentPlots).values({ agentId, plotId, assignedAt: at }));

describe('getFieldHome', () => {
  it("returns only this agent's unrevoked agent_plots rows in this org", async () => {
    await assign(w.agentId, w.plots.arabica.plotId);
    await assign(w.agentId, w.plots.robusta.plotId);
    await writeTx(t.db, (tx) =>
      tx
        .update(agentPlots)
        .set({ revokedAt: new Date().toISOString() })
        .where(and(eq(agentPlots.agentId, w.agentId), eq(agentPlots.plotId, w.plots.robusta.plotId))),
    );
    // Another agent's assignment in another org is never listed.
    const other = await seedFpo(t.db);
    await assign(other.agentId, other.plots.arabica.plotId);

    const home = await getFieldHome(t.db, w.agentId, w.orgId);
    expect(home.plots.map((p) => p.id)).toEqual([w.plots.arabica.plotId]);
    expect(home.plots[0]).toMatchObject({ crop: 'arabica', areaHa: 2, ordinal: 1, farmerName: 'Test farmer', lastPickedAt: null });
    expect(home.plots[0]!.geojson).toMatchObject({ type: 'Polygon' });

    // The org comes from the session: the same agent under another org id sees nothing.
    expect((await getFieldHome(t.db, w.agentId, other.orgId)).plots).toEqual([]);
  });

  it('lists the most recently picked plot first, and the last three pickings newest first', async () => {
    await assign(w.agentId, w.plots.arabica.plotId);
    await assign(w.agentId, w.plots.robusta.plotId);
    const a1 = await seedCapture(t.db, w, { crop: 'arabica', kg: 40 });
    const a2 = await seedCapture(t.db, w, { crop: 'arabica', kg: 42.5, verdict: 'Needs Review', score: 70 });
    const r1 = await seedCapture(t.db, w, { crop: 'robusta', kg: 30 });
    const a3 = await seedCapture(t.db, w, { crop: 'arabica', kg: 46, verdict: 'Rejected', score: 20 });

    const home = await getFieldHome(t.db, w.agentId, w.orgId);
    expect(home.plots.map((p) => p.id)).toEqual([w.plots.arabica.plotId, w.plots.robusta.plotId]);
    expect(home.plots[0]!.lastPickedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(home.recent.map((r) => [r.eventId, r.cherryKg, r.verdict])).toEqual([
      [a3.eventId, 46, 'Rejected'],
      [r1.eventId, 30, 'Verified'],
      [a2.eventId, 42.5, 'Needs Review'],
    ]);
    expect(home.recent.map((r) => r.eventId)).not.toContain(a1.eventId);
  });
});

describe('getFieldHome: the order is this agent\'s own pickings (TASK-11 fix round 1)', () => {
  it("another agent's later picking on a plot does not move it up, nor give it a last-picked date", async () => {
    await assign(w.agentId, w.plots.arabica.plotId);
    await assign(w.agentId, w.plots.robusta.plotId);
    await seedCapture(t.db, w, { crop: 'arabica', kg: 40 });
    const other = await seedFpo(t.db);
    await seedCapture(t.db, { ...w, agentId: other.agentId, device: other.device }, { crop: 'robusta', kg: 30 });

    const home = await getFieldHome(t.db, w.agentId, w.orgId);
    expect(home.plots.map((p) => p.id)).toEqual([w.plots.arabica.plotId, w.plots.robusta.plotId]);
    expect(home.plots[1]!.lastPickedAt).toBeNull();
    const [row] = (await t.client.execute({ sql: 'SELECT server_received_at FROM harvest_events WHERE plot_id = ? AND agent_id = ?', args: [w.plots.arabica.plotId, w.agentId] })).rows;
    expect(home.plots[0]!.lastPickedAt).toBe(row!.server_received_at); // the server's clock, not the phone's
  });
});

describe('recentKgRange', () => {
  it('leaves Rejected pickings out of the usual range (D6)', async () => {
    for (const kg of [38.5, 44]) await seedCapture(t.db, w, { crop: 'arabica', kg });
    await seedCapture(t.db, w, { crop: 'arabica', kg: 51, verdict: 'Needs Review', score: 70 });
    await seedCapture(t.db, w, { crop: 'arabica', kg: 480, verdict: 'Rejected', score: 10 });
    expect(await recentKgRange(t.db, w.agentId, w.plots.arabica.plotId)).toEqual({ min: 38.5, max: 51 });
  });

  it('is the min and max of the last 10 accepted pickings on the plot: 38.5, 44, 51 → 38.5–51', async () => {
    for (const kg of [38.5, 44, 51]) await seedCapture(t.db, w, { crop: 'arabica', kg });
    await seedCapture(t.db, w, { crop: 'robusta', kg: 300 }); // another plot: not counted
    expect(await recentKgRange(t.db, w.agentId, w.plots.arabica.plotId)).toEqual({ min: 38.5, max: 51 });
  });

  it('only the last 10 count, and no pickings → null', async () => {
    expect(await recentKgRange(t.db, w.agentId, w.plots.arabica.plotId)).toBeNull();
    await seedCapture(t.db, w, { crop: 'arabica', kg: 5 });
    for (let i = 0; i < 10; i++) await seedCapture(t.db, w, { crop: 'arabica', kg: 20 + i });
    expect(await recentKgRange(t.db, w.agentId, w.plots.arabica.plotId)).toEqual({ min: 20, max: 29 });
  });
});
