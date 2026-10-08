// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { fakeJpeg, multipartRequest } from '../../../tests/helpers/capture';
import { addUser, cookieHeader as cookieOf } from '../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../crypto';
import { consume } from '../rate-limit';
import { DEVICE_LIMIT, deviceKey, IP_LIMIT, ipKey } from './rate-limit';

// TSK-19.3 · TC-074: 30 captures per phone and 60 per address per 10 minutes, on the rate_limits
// table; the route answers 429 with Retry-After. The phone bucket belongs to the signed-in agent too
// (fix round 1, review major 2): another agent naming the same phone fills only their own bucket.

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
});
afterEach(async () => {
  await t.cleanup();
});

const T0 = new Date('2026-10-14T04:00:00.000Z'); // a 10-minute window boundary
const at = (sec: number) => new Date(T0.getTime() + sec * 1000);

describe('consume', () => {
  it('30 per device per 10 minutes: the 31st → ok:false with retryAfterSec > 0', async () => {
    expect(DEVICE_LIMIT).toEqual({ limit: 30, windowSec: 600 });
    for (let i = 0; i < 30; i++) expect(await consume(t.db, deviceKey('AG-A', 'DV-7K2M9Q4D'), 30, 600, at(i))).toEqual({ ok: true, retryAfterSec: 0 });
    const r = await consume(t.db, deviceKey('AG-A', 'DV-7K2M9Q4D'), 30, 600, at(30));
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBe(570); // until the window ends at T0 + 600 s
    expect(await consume(t.db, deviceKey('AG-A', 'DV-OTHER000'), 30, 600, at(31))).toMatchObject({ ok: true }); // per phone
  });

  it("the phone bucket is per signed-in agent: agent B filling DV-X leaves agent A's DV-X bucket untouched", async () => {
    expect(deviceKey('AG-A', 'DV-7K2M9Q4D')).toBe('capture:device:AG-A:DV-7K2M9Q4D');
    for (let i = 0; i < 31; i++) await consume(t.db, deviceKey('AG-B', 'DV-7K2M9Q4D'), 30, 600, at(1));
    expect((await consume(t.db, deviceKey('AG-B', 'DV-7K2M9Q4D'), 30, 600, at(2))).ok).toBe(false);
    expect(await consume(t.db, deviceKey('AG-A', 'DV-7K2M9Q4D'), 30, 600, at(3))).toEqual({ ok: true, retryAfterSec: 0 });
  });

  it('60 per address per 10 minutes', async () => {
    expect(IP_LIMIT).toEqual({ limit: 60, windowSec: 600 });
    for (let i = 0; i < 60; i++) expect((await consume(t.db, ipKey('203.0.113.9'), 60, 600, at(1))).ok).toBe(true);
    expect(await consume(t.db, ipKey('203.0.113.9'), 60, 600, at(599.5))).toEqual({ ok: false, retryAfterSec: 1 });
  });

  it('the window rolls over', async () => {
    for (let i = 0; i < 31; i++) await consume(t.db, deviceKey('AG-A', 'DV-7K2M9Q4D'), 30, 600, at(10));
    expect((await consume(t.db, deviceKey('AG-A', 'DV-7K2M9Q4D'), 30, 600, at(599))).ok).toBe(false);
    expect(await consume(t.db, deviceKey('AG-A', 'DV-7K2M9Q4D'), 30, 600, at(600))).toEqual({ ok: true, retryAfterSec: 0 });
  });
});

describe('POST /api/capture rate limits (TC-074)', () => {
  let dev: TestDevice;
  let world: TracerWorld;
  let cookie: string;
  const PASSWORD = 'tracer agent password';
  // The route reads the clock: pin Date (only Date, so libSQL and timers run normally) 30 s into a
  // 10-minute window, so Retry-After is a fixed 570.
  const NOW = new Date('2026-10-14T04:00:30.000Z');

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    dev = await makeDevice();
    world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk, agentPassword: PASSWORD, now: NOW });
    vi.resetModules();
    vi.stubEnv('DATABASE_URL', t.url);
    vi.stubEnv('DATA_DIR', t.dir);
    vi.stubEnv('LOG_LEVEL', 'silent');
    const { appAuth } = await import('../../app/_auth/auth');
    cookie = cookieOf(await appAuth().api.signInEmail({ body: { email: world.agentEmail, password: PASSWORD }, asResponse: true }));
  });
  afterEach(async () => {
    (await import('../db/client')).closeDb();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  async function request(seq: number, ip: string, as: { cookie: string; deviceId?: string; key?: CryptoKey } = { cookie }) {
    const photo = fakeJpeg(`rl-${seq}`);
    const s = jcs({
      v: 1,
      plotId: world.plotId,
      deviceId: as.deviceId ?? world.deviceId,
      seq,
      prevEventHash: 'genesis',
      capturedAt: NOW.toISOString(),
      gps: { ...P01_INSIDE, accuracyM: 8 },
      cherryKg: 10,
      media: [{ sha256: await sha256Hex(photo), size: photo.length, mime: 'image/jpeg' }],
    });
    const fd = new FormData();
    fd.set('payload', s);
    fd.set('signature', await sign(as.key ?? dev.pair.privateKey, s));
    fd.set('photo0', new File([photo], 'p.jpg', { type: 'image/jpeg' }));
    return multipartRequest('http://localhost/api/capture', fd, { cookie: as.cookie, 'x-forwarded-for': ip });
  }

  it('the 31st capture from one phone in 10 minutes → 429 rate_limited with Retry-After; nothing anchored', async () => {
    // 30 earlier attempts already counted in this window
    for (let i = 0; i < 30; i++) await consume(t.db, deviceKey(world.agentId, world.deviceId), 30, 600, NOW);
    const entries = Number((await t.client.execute('SELECT COUNT(*) AS n FROM ledger_entries')).rows[0]?.n);
    const { POST } = await import('../../app/api/capture/route');
    const res = await POST(await request(1, '203.0.113.20'));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('570');
    expect(JSON.parse((await res.text()).trim())).toEqual({ t: 'rejected', reason: 'rate_limited', status: 429, retryAfterSec: 570 });
    expect(Number((await t.client.execute('SELECT COUNT(*) AS n FROM ledger_entries')).rows[0]?.n)).toBe(entries);
    expect((await t.client.execute('SELECT COUNT(*) AS n FROM harvest_events')).rows[0]?.n).toBe(0);
  });

  it('the 61st request from one address in 10 minutes → 429 before the body is read', async () => {
    for (let i = 0; i < 60; i++) await consume(t.db, ipKey('203.0.113.30'), 60, 600, NOW);
    const { POST } = await import('../../app/api/capture/route');
    const res = await POST(await request(1, '203.0.113.30'));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('570');
    // another address is unaffected
    const ok = await POST(await request(1, '203.0.113.31'));
    expect(ok.status).toBe(200);
    await ok.text();
  });

  it("another agent flooding this phone's id cannot lock it out: B's 31st forged claim → 429, A's upload from the phone → 200 (fix round 1)", async () => {
    await addUser(t.db, { id: 'AG-FLOODER', email: 'flooder@tracer.udgam.test', password: PASSWORD, role: 'agent', orgId: world.orgId });
    const { appAuth } = await import('../../app/_auth/auth');
    const flooder = cookieOf(await appAuth().api.signInEmail({ body: { email: 'flooder@tracer.udgam.test', password: PASSWORD }, asResponse: true }));
    // B cannot sign as A's phone; the claim alone names it. B's payloads differ from A's (seq 100+):
    // a byte-identical one would be anchored as bad_signature first (the TKT-09 sticky-replay item).
    const forger = await makeDevice();
    const { POST } = await import('../../app/api/capture/route');
    for (let i = 0; i < 30; i++) {
      const r = await POST(await request(100 + i, '203.0.113.40', { cookie: flooder, key: forger.pair.privateKey }));
      expect(r.status, `flood ${i}`).not.toBe(429);
      await r.text();
    }
    const blocked = await POST(await request(130, '203.0.113.40', { cookie: flooder, key: forger.pair.privateKey }));
    expect(blocked.status).toBe(429); // B used up B's own bucket for the phone
    await blocked.text();
    const own = await POST(await request(1, '203.0.113.41'));
    expect(own.status).toBe(200);
    await own.text();
  });
});
