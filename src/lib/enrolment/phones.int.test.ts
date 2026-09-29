import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { addOrg, addUser } from '../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice } from '../../../tests/helpers/verify';
import { publicMembers } from '../crypto';
import { assignPlot } from './assign';
import { issueCode } from './codes';
import { enrolDevice, revokeDevice } from './enrol';
import { formatIst, listPhones } from './phones';

// TSK-05.7: the admin Phones view is org-scoped (EVAL-080): agents, their phones, their live plot
// assignments and the org's plots — nothing of another org.
let t: TempDb;
let world: TracerWorld;

beforeEach(async () => {
  t = await tempDb();
  world = await seedTracerWorld(t.db, { publicJwk: (await makeDevice()).publicJwk, now: new Date('2026-10-01T03:00:00.000Z') });
  await addUser(t.db, { id: 'U-ADMIN', email: 'admin@x.test', password: 'admin password!!', role: 'admin', orgId: world.orgId });
  await addUser(t.db, { id: 'U-AGENT-2', email: 'b@x.test', password: 'agent two password', role: 'agent', orgId: world.orgId });
  await addOrg(t.db, 'ORG-OTHER', 'fpo');
  await addUser(t.db, { id: 'U-OTHER-AGENT', email: 'o@x.test', password: 'other agent password', role: 'agent', orgId: 'ORG-OTHER' });
  await addUser(t.db, { id: 'U-OTHER-ADMIN', email: 'oa@x.test', password: 'other admin password', role: 'admin', orgId: 'ORG-OTHER' });
  const { code } = await issueCode(t.db, { agentId: 'U-OTHER-AGENT', adminId: 'U-OTHER-ADMIN', orgId: 'ORG-OTHER' });
  const other = await enrolDevice(t.db, { code, publicJwk: publicMembers((await makeDevice()).publicJwk), ip: 'x', sessionAgentId: 'U-OTHER-AGENT' });
  expect(other.ok).toBe(true);
});
afterEach(async () => {
  await t.cleanup();
});

describe('listPhones', () => {
  it("lists only the org's agents, phones, assignments and plots", async () => {
    await revokeDevice(t.db, { deviceId: world.deviceId, adminOrgId: world.orgId }, new Date('2026-10-02T04:30:00.000Z'));
    await assignPlot(t.db, { agentId: 'U-AGENT-2', plotId: world.plotId, orgId: world.orgId }, new Date('2026-10-03T00:00:00.000Z'));
    const v = await listPhones(t.db, world.orgId);
    expect(v.agents.map((a) => a.id).sort()).toEqual([world.agentId, 'U-AGENT-2'].sort());
    const a = v.agents.find((x) => x.id === world.agentId)!;
    expect(a.devices).toEqual([{ id: world.deviceId, enrolledAt: '2026-10-01T03:00:00.000Z', revokedAt: '2026-10-02T04:30:00.000Z', lastCaptureAt: null }]);
    expect(a.plots.map((p) => p.id)).toEqual([world.plotId]);
    expect(v.agents.find((x) => x.id === 'U-AGENT-2')!.plots.map((p) => p.id)).toEqual([world.plotId]);
    expect(v.plots).toEqual([{ id: world.plotId, crop: 'arabica', areaHa: expect.any(Number), farmerName: 'Tracer farmer' }]);
    expect(JSON.stringify(v)).not.toContain('U-OTHER');
  });

  it('an org without agents is empty', async () => {
    await addOrg(t.db, 'ORG-EMPTY', 'fpo');
    expect(await listPhones(t.db, 'ORG-EMPTY')).toEqual({ agents: [], plots: [] });
  });
});

describe('formatIst', () => {
  it('shows a UTC instant in IST by explicit offset, whatever the host zone', () => {
    expect(formatIst('2026-10-14T20:15:00.000Z')).toBe('15 Oct 2026, 01:45 IST');
    expect(formatIst('2026-01-01T00:00:00.000Z')).toBe('1 Jan 2026, 05:30 IST');
  });
});
