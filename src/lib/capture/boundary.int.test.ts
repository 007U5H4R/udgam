import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { addUser } from '../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../crypto';
import { assignPlot, unassignPlot } from '../enrolment/assign';
import { issueCode } from '../enrolment/codes';
import { enrolDevice, revokeDevice } from '../enrolment/enrol';
import { t as tr } from '../i18n';
import { verifyChain } from '../ledger/hashchain';
import { localMediaStore } from '../media/store';
import type { CapturePayloadV1 } from '../verification/types';
import { runCapture, type CaptureEvent } from './pipeline';

// TSK-05.6 · TC-023 (EVAL-051, EVAL-052) and TC-024 (EVAL-054, TP5): unknown keys, revoked phones and
// captures for a plot not assigned to the phone's agent are refused at the boundary, anchored as
// rejected harvest_events, and never verified.
let t: TempDb;
let world: TracerWorld; // agent A, plot P01 assigned to A, A's phone
let devA: TestDevice;
let devB: TestDevice;
let deviceB: string;
const AGENT_B = 'U-AGENT-B';
const ADMIN = 'U-ADMIN';

beforeEach(async () => {
  t = await tempDb();
  devA = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: devA.publicJwk });
  await addUser(t.db, { id: AGENT_B, email: 'agent-b@x.test', password: 'agent b password', role: 'agent', orgId: world.orgId });
  await addUser(t.db, { id: ADMIN, email: 'admin@x.test', password: 'admin password!', role: 'admin', orgId: world.orgId });
  devB = await makeDevice('unused');
  const { code } = await issueCode(t.db, { agentId: AGENT_B, adminId: ADMIN, orgId: world.orgId });
  const r = await enrolDevice(t.db, { code, publicJwk: devB.publicJwk, ip: '203.0.113.1', sessionAgentId: AGENT_B });
  if (!r.ok) throw new Error(`enrol failed: ${r.reason}`);
  deviceB = r.deviceId;
});
afterEach(async () => {
  await t.cleanup();
});

let n = 0;
async function capture(o: { key: TestDevice; deviceId: string; plotId?: string; seq?: number }) {
  const bytes = new TextEncoder().encode(`photo-${n++}`);
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: o.plotId ?? world.plotId,
    deviceId: o.deviceId,
    seq: o.seq ?? 1,
    prevEventHash: 'genesis',
    capturedAt: new Date(Date.UTC(2026, 9, 14, 4, 12, n)).toISOString(),
    gps: { ...P01_INSIDE, accuracyM: 8 },
    cherryKg: 42.5,
    media: [{ sha256: await sha256Hex(bytes), size: bytes.length, mime: 'image/jpeg' }],
  };
  const signed = jcs(payload);
  const fd = new FormData();
  fd.set('payload', signed);
  fd.set('signature', await sign(o.key.pair.privateKey, signed));
  fd.set('photo0', new File([bytes], 'p.jpg', { type: 'image/jpeg' }));
  return { fd, signed };
}

async function run(fd: FormData, agentId: string) {
  const events: CaptureEvent[] = [];
  await runCapture(fd, { db: t.db, media: localMediaStore(t.dir), agentId }, (e) => events.push(e));
  return events;
}

const rows = async (sql: string, args: (string | number)[] = []) => (await t.client.execute({ sql, args })).rows.map((r) => ({ ...r }));

/** The single rejected event for `signed`, with its anchoring ledger entry. */
async function rejectedRow(signed: string) {
  const [ev] = await rows('SELECT * FROM harvest_events WHERE payload_hash = ?', [await sha256Hex(signed)]);
  expect(ev).toBeDefined();
  const [entry] = await rows('SELECT kind, payload FROM ledger_entries WHERE seq = ?', [Number(ev!.anchor_seq)]);
  return { ev: ev!, entry: { kind: entry!.kind, payload: JSON.parse(String(entry!.payload)) as Record<string, unknown> } };
}

const runsFor = async (eventId: unknown) => rows('SELECT id FROM verification_runs WHERE event_id = ?', [String(eventId)]);

describe('TC-023 unknown and revoked keys', () => {
  it('EVAL-051 a key the server never enrolled → 401 unknown_device; anchored with device_id NULL and the claimed ID kept in the payload', async () => {
    const kx = await makeDevice('K-X');
    const { fd, signed } = await capture({ key: kx, deviceId: 'DV-NEVER000' });
    expect(await run(fd, world.agentId)).toEqual([{ t: 'rejected', reason: 'unknown_device', status: 401 }]);
    const { ev, entry } = await rejectedRow(signed);
    expect(ev).toMatchObject({ boundary_status: 'rejected', boundary_reason: 'unknown_device', device_id: null, agent_id: null, final_verdict: null });
    expect(JSON.parse(String(ev.payload)).deviceId).toBe('DV-NEVER000');
    expect(entry).toEqual({ kind: 'harvest_event', payload: expect.objectContaining({ boundaryStatus: 'rejected', boundaryReason: 'unknown_device', deviceId: null }) });
    expect(await runsFor(ev.id)).toEqual([]);
    expect(await rows('SELECT id FROM media')).toEqual([]);
  });

  it("EVAL-051 an unenrolled key claiming an enrolled phone's ID → 401 bad_signature, anchored, not attributed to that phone", async () => {
    const kx = await makeDevice('K-X');
    const { fd, signed } = await capture({ key: kx, deviceId: world.deviceId });
    expect(await run(fd, world.agentId)).toEqual([{ t: 'rejected', reason: 'bad_signature', status: 401 }]);
    const { ev } = await rejectedRow(signed);
    expect(ev).toMatchObject({ boundary_status: 'rejected', boundary_reason: 'bad_signature', device_id: null });
    expect(await runsFor(ev.id)).toEqual([]);
  });

  it('EVAL-052 a revoked phone → 403 device_revoked ("revoked" in the reason), anchored; the revocation itself is anchored', async () => {
    await revokeDevice(t.db, { deviceId: world.deviceId, adminOrgId: world.orgId });
    const [revocation] = await rows(`SELECT payload FROM ledger_entries WHERE kind = 'device_revoked'`);
    expect(JSON.parse(String(revocation!.payload))).toMatchObject({ deviceId: world.deviceId });

    const { fd, signed } = await capture({ key: devA, deviceId: world.deviceId });
    const events = await run(fd, world.agentId);
    expect(events).toEqual([{ t: 'rejected', reason: 'device_revoked', status: 403 }]);
    const { ev, entry } = await rejectedRow(signed);
    expect(String(ev.boundary_reason)).toContain('revoked');
    expect(ev).toMatchObject({ boundary_status: 'rejected', device_id: world.deviceId, agent_id: world.agentId });
    expect(entry.payload).toMatchObject({ boundaryStatus: 'rejected', boundaryReason: 'device_revoked', deviceId: world.deviceId });
    expect(await runsFor(ev.id)).toEqual([]);
    expect(await rows(`SELECT id FROM harvest_events WHERE boundary_status = 'accepted'`)).toEqual([]);
    expect(await verifyChain(t.db)).toEqual({ ok: true });
  });
});

describe('TC-024 plot assignment is a boundary rule (TP5)', () => {
  it("EVAL-054 agent B's phone capturing on agent A's plot → 403 plot_not_assigned, anchored; after assignment the same capture shape is accepted", async () => {
    const refused = await capture({ key: devB, deviceId: deviceB });
    expect(await run(refused.fd, AGENT_B)).toEqual([{ t: 'rejected', reason: 'plot_not_assigned', status: 403 }]);
    const { ev, entry } = await rejectedRow(refused.signed);
    expect(ev).toMatchObject({ boundary_status: 'rejected', boundary_reason: 'plot_not_assigned', device_id: deviceB, agent_id: AGENT_B, plot_id: world.plotId });
    expect(entry.payload).toMatchObject({ boundaryReason: 'plot_not_assigned', plotId: world.plotId });
    expect(await runsFor(ev.id)).toEqual([]);
    // the Not-accepted message names the plot assignment
    expect(tr('capture.rejected.plot_not_assigned')).toMatch(/not assigned to you/);

    await assignPlot(t.db, { agentId: AGENT_B, plotId: world.plotId, orgId: world.orgId });
    const accepted = await capture({ key: devB, deviceId: deviceB });
    expect((await run(accepted.fd, AGENT_B)).at(-1)).toMatchObject({ t: 'verdict' });
    const [ok] = await rows('SELECT boundary_status FROM harvest_events WHERE payload_hash = ?', [await sha256Hex(accepted.signed)]);
    expect(ok).toEqual({ boundary_status: 'accepted' });
  });

  it('an unassigned plot (revoked_at set) is refused again; the owner of a live assignment is unaffected', async () => {
    await assignPlot(t.db, { agentId: AGENT_B, plotId: world.plotId, orgId: world.orgId });
    await unassignPlot(t.db, { agentId: AGENT_B, plotId: world.plotId, orgId: world.orgId });
    const b = await capture({ key: devB, deviceId: deviceB });
    expect(await run(b.fd, AGENT_B)).toEqual([{ t: 'rejected', reason: 'plot_not_assigned', status: 403 }]);
    const a = await capture({ key: devA, deviceId: world.deviceId });
    expect((await run(a.fd, world.agentId)).at(-1)).toMatchObject({ t: 'verdict', verdict: 'Verified' });
  });

  it('a plot that does not exist is refused the same way', async () => {
    const { fd } = await capture({ key: devA, deviceId: world.deviceId, plotId: 'PL-NOPE0000' });
    expect(await run(fd, world.agentId)).toEqual([{ t: 'rejected', reason: 'plot_not_assigned', status: 403 }]);
  });
});
