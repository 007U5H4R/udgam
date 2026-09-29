import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { addOrg, addUser } from '../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice } from '../../../tests/helpers/verify';
import { assignPlot, isPlotAssigned, unassignPlot } from './assign';
import { NotFoundError } from './errors';

// TSK-05.7: org-scoped plot assignment (GAP-2, TP5, EVAL-080).
let t: TempDb;
let world: TracerWorld;
const B = 'U-AGENT-B';

beforeEach(async () => {
  t = await tempDb();
  world = await seedTracerWorld(t.db, { publicJwk: (await makeDevice()).publicJwk });
  await addUser(t.db, { id: B, email: 'b@x.test', password: 'agent b password', role: 'agent', orgId: world.orgId });
  await addOrg(t.db, 'ORG-OTHER', 'fpo');
  await addUser(t.db, { id: 'U-OTHER-AGENT', email: 'o@x.test', password: 'other agent password', role: 'agent', orgId: 'ORG-OTHER' });
  await addUser(t.db, { id: 'U-ADMIN', email: 'admin@x.test', password: 'admin password!!', role: 'admin', orgId: world.orgId });
});
afterEach(async () => {
  await t.cleanup();
});

const row = async () =>
  (await t.client.execute({ sql: 'SELECT assigned_at, revoked_at FROM agent_plots WHERE agent_id = ? AND plot_id = ?', args: [B, world.plotId] })).rows.map((r) => ({ ...r }));

describe('assignPlot / unassignPlot', () => {
  it('assigns, removes (revoked_at) and re-assigns; a live assignment keeps its date', async () => {
    const t1 = new Date('2026-10-01T00:00:00.000Z');
    expect(await isPlotAssigned(t.db, B, world.plotId)).toBe(false);
    await assignPlot(t.db, { agentId: B, plotId: world.plotId, orgId: world.orgId }, t1);
    await assignPlot(t.db, { agentId: B, plotId: world.plotId, orgId: world.orgId }, new Date('2026-10-02T00:00:00.000Z'));
    expect(await row()).toEqual([{ assigned_at: t1.toISOString(), revoked_at: null }]);
    expect(await isPlotAssigned(t.db, B, world.plotId)).toBe(true);

    await unassignPlot(t.db, { agentId: B, plotId: world.plotId, orgId: world.orgId }, new Date('2026-10-03T00:00:00.000Z'));
    expect(await row()).toEqual([{ assigned_at: t1.toISOString(), revoked_at: '2026-10-03T00:00:00.000Z' }]);
    expect(await isPlotAssigned(t.db, B, world.plotId)).toBe(false);

    await assignPlot(t.db, { agentId: B, plotId: world.plotId, orgId: world.orgId }, new Date('2026-10-04T00:00:00.000Z'));
    expect(await row()).toEqual([{ assigned_at: '2026-10-04T00:00:00.000Z', revoked_at: null }]);
  });

  it('an agent or plot of another org, a non-agent user or an unknown plot is NotFoundError; nothing is written', async () => {
    await expect(assignPlot(t.db, { agentId: 'U-OTHER-AGENT', plotId: world.plotId, orgId: world.orgId })).rejects.toBeInstanceOf(NotFoundError);
    await expect(assignPlot(t.db, { agentId: B, plotId: world.plotId, orgId: 'ORG-OTHER' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(assignPlot(t.db, { agentId: 'U-ADMIN', plotId: world.plotId, orgId: world.orgId })).rejects.toBeInstanceOf(NotFoundError);
    await expect(assignPlot(t.db, { agentId: B, plotId: 'PL-NOPE0000', orgId: world.orgId })).rejects.toBeInstanceOf(NotFoundError);
    await expect(unassignPlot(t.db, { agentId: world.agentId, plotId: world.plotId, orgId: 'ORG-OTHER' })).rejects.toBeInstanceOf(NotFoundError);
    expect(await row()).toEqual([]);
    expect(await isPlotAssigned(t.db, world.agentId, world.plotId)).toBe(true);
  });
});
