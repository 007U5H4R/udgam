// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DEMO_ACCOUNTS, DEMO_ORGS, seedAccounts } from '../../../scripts/seed-accounts';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { cookieHeader } from '../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { outcome } from '../../../tests/helpers/next';
import { makeDevice, type TestDevice } from '../../../tests/helpers/verify';
import { runCapture, type CaptureEvent } from '../capture/pipeline';
import { jcs, sha256Hex, sign } from '../crypto';
import { localMediaStore } from '../media/store';
import { createAuth } from './auth';
import { deviceInOrg, listBuyerBatches, plotInOrg, runInOrg } from './org-scope';
import { readSession } from './session';

// TSK-04.5 / TC-019 / EVAL-080: seeded demo accounts per role and org, and org-scoped lookups — an ID
// from another organisation is indistinguishable from an unknown one (404), and the org always comes
// from the session.

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock('next/headers', () => ({ headers: async () => request.headers, cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

let t: TempDb;
let a: TracerWorld;
let b: TracerWorld;
/** A verification run of world B's first capture. */
let runB: string;
const PASSWORD = 'org scope password';

/** One signed capture on `world`'s plot by its agent; returns the run ID. */
async function captureRun(world: TracerWorld, dev: TestDevice): Promise<string> {
  const bytes = new TextEncoder().encode(`photo-${world.plotId}`);
  const payload = jcs({
    v: 1,
    plotId: world.plotId,
    deviceId: world.deviceId,
    seq: 1,
    prevEventHash: 'genesis',
    capturedAt: '2026-10-14T04:12:33.120Z',
    gps: { ...P01_INSIDE, accuracyM: 8 },
    cherryKg: 40,
    media: [{ sha256: await sha256Hex(bytes), size: bytes.length, mime: 'image/jpeg' }],
  });
  const fd = new FormData();
  fd.set('payload', payload);
  fd.set('signature', await sign(dev.pair.privateKey, payload));
  fd.set('photo0', new File([bytes], 'p.jpg', { type: 'image/jpeg' }));
  const out: CaptureEvent[] = [];
  await runCapture(fd, { db: t.db, media: localMediaStore(t.dir), agentId: world.agentId }, (e) => out.push(e));
  const last = out.at(-1);
  if (last?.t !== 'verdict') throw new Error(`capture failed: ${JSON.stringify(last)}`);
  const [run] = (await t.client.execute({ sql: 'SELECT id FROM verification_runs WHERE event_id = ?', args: [last.eventId] })).rows;
  return String(run!.id);
}

beforeAll(async () => {
  t = await tempDb();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  await seedAccounts(t.db, PASSWORD);
  a = await seedTracerWorld(t.db, { publicJwk: (await makeDevice()).publicJwk });
  const devB = await makeDevice();
  b = await seedTracerWorld(t.db, { publicJwk: devB.publicJwk });
  runB = await captureRun(b, devB);
});
afterAll(async () => {
  (await import('../db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

describe('seed-accounts', () => {
  it('seeds two FPOs, two buyers and one account per role and org; each signs in with its role and org', async () => {
    const auth = createAuth(t.db);
    expect(Object.values(DEMO_ORGS).map((o) => o.type)).toEqual(['fpo', 'fpo', 'buyer', 'buyer']);
    for (const acc of Object.values(DEMO_ACCOUNTS)) {
      const res = await auth.api.signInEmail({ body: { email: acc.email, password: PASSWORD }, asResponse: true });
      expect(res.status, acc.email).toBe(200);
      expect(await readSession(auth, new Headers({ cookie: cookieHeader(res) }))).toEqual({ userId: acc.id, orgId: acc.orgId, role: acc.role });
    }
  });

  it('is idempotent and re-running resets the password', async () => {
    await seedAccounts(t.db, 'a different password');
    await seedAccounts(t.db, PASSWORD);
    const n = (await t.client.execute("SELECT COUNT(*) AS n FROM user WHERE id LIKE 'USR-%'")).rows[0]?.n;
    expect(n).toBe(6);
    const res = await createAuth(t.db).api.signInEmail({ body: { email: DEMO_ACCOUNTS.adminA.email, password: PASSWORD }, asResponse: true });
    expect(res.status).toBe(200);
  });
});

describe('TC-019 cross-org lookups return 404', () => {
  it("plots: own org finds it; another org's ID reads as not found", async () => {
    expect((await plotInOrg(t.db, a.orgId, a.plotId))?.id).toBe(a.plotId);
    expect(await plotInOrg(t.db, a.orgId, b.plotId)).toBeUndefined();
    expect(await plotInOrg(t.db, a.orgId, 'PL-NOPE0000')).toBeUndefined();
  });

  it("devices: own org finds it; another org's ID reads as not found", async () => {
    expect((await deviceInOrg(t.db, a.orgId, a.deviceId))?.id).toBe(a.deviceId);
    expect(await deviceInOrg(t.db, a.orgId, b.deviceId)).toBeUndefined();
  });

  it("runs: own org finds it; another org's run ID reads as not found", async () => {
    expect((await runInOrg(t.db, b.orgId, runB))?.id).toBe(runB);
    expect(await runInOrg(t.db, a.orgId, runB)).toBeUndefined();
    expect(await runInOrg(t.db, a.orgId, 'VR-NOPE')).toBeUndefined();
  });

  it("an FPO-A admin reading FPO-B's plot or device through the guard and scopedById → 404, no data", async () => {
    // FPO A's admin for world A (the tracer world has its own org; the admin joins it here)
    const { addUser } = await import('../../../tests/helpers/auth');
    await addUser(t.db, { id: 'U-ADMIN-WA', email: 'admin@world-a.test', password: PASSWORD, role: 'admin', orgId: a.orgId });
    const { appAuth } = await import('../../app/_auth/auth');
    const cookie = cookieHeader(await appAuth().api.signInEmail({ body: { email: 'admin@world-a.test', password: PASSWORD }, asResponse: true }));
    request.headers = new Headers({ cookie });
    const { requireSession, scopedById } = await import('../../app/_auth/require');
    const { orgId } = await requireSession('admin');
    expect(orgId).toBe(a.orgId);
    expect(scopedById(await plotInOrg(t.db, orgId, a.plotId)).id).toBe(a.plotId);
    expect(await outcome(async () => scopedById(await plotInOrg(t.db, orgId, b.plotId)))).toEqual({ notFound: true });
    expect(await outcome(async () => scopedById(await deviceInOrg(t.db, orgId, b.deviceId)))).toEqual({ notFound: true });
  });

  it('a buyer lists only its own batches (none exist yet; asserted again with data in TKT-14)', async () => {
    expect(await listBuyerBatches(t.db, DEMO_ORGS.buyerA.id)).toEqual([]);
    expect(await listBuyerBatches(t.db, DEMO_ORGS.buyerB.id)).toEqual([]);
  });
});
