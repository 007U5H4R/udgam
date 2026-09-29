// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { cookieHeader } from '../../../tests/helpers/auth';
import { fakeJpeg, multipartRequest } from '../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../crypto';
import { consume, DEVICE_LIMIT, deviceKey, IP_LIMIT, ipKey } from './rate-limit';

// TSK-19.3 · TC-074: 30 captures per phone and 60 per address per 10 minutes, on the rate_limits
// table; the route answers 429 with Retry-After.

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
    for (let i = 0; i < 30; i++) expect(await consume(t.db, deviceKey('DV-7K2M9Q4D'), 30, 600, at(i))).toEqual({ ok: true, retryAfterSec: 0 });
    const r = await consume(t.db, deviceKey('DV-7K2M9Q4D'), 30, 600, at(30));
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBe(570); // until the window ends at T0 + 600 s
    expect(await consume(t.db, deviceKey('DV-OTHER000'), 30, 600, at(31))).toMatchObject({ ok: true }); // per phone
  });

  it('60 per address per 10 minutes', async () => {
    expect(IP_LIMIT).toEqual({ limit: 60, windowSec: 600 });
    for (let i = 0; i < 60; i++) expect((await consume(t.db, ipKey('203.0.113.9'), 60, 600, at(1))).ok).toBe(true);
    expect(await consume(t.db, ipKey('203.0.113.9'), 60, 600, at(599.5))).toEqual({ ok: false, retryAfterSec: 1 });
  });

  it('the window rolls over', async () => {
    for (let i = 0; i < 31; i++) await consume(t.db, deviceKey('DV-7K2M9Q4D'), 30, 600, at(10));
    expect((await consume(t.db, deviceKey('DV-7K2M9Q4D'), 30, 600, at(599))).ok).toBe(false);
    expect(await consume(t.db, deviceKey('DV-7K2M9Q4D'), 30, 600, at(600))).toEqual({ ok: true, retryAfterSec: 0 });
  });
});

describe('POST /api/capture rate limits (TC-074)', () => {
  let dev: TestDevice;
  let world: TracerWorld;
  let cookie: string;
  const PASSWORD = 'tracer agent password';

  beforeEach(async () => {
    dev = await makeDevice();
    world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk, agentPassword: PASSWORD });
    vi.resetModules();
    vi.stubEnv('DATABASE_URL', t.url);
    vi.stubEnv('DATA_DIR', t.dir);
    vi.stubEnv('LOG_LEVEL', 'silent');
    const { appAuth } = await import('../../app/_auth/auth');
    cookie = cookieHeader(await appAuth().api.signInEmail({ body: { email: world.agentEmail, password: PASSWORD }, asResponse: true }));
  });
  afterEach(async () => {
    (await import('../db/client')).closeDb();
    vi.unstubAllEnvs();
  });

  async function request(seq: number, ip: string) {
    const photo = fakeJpeg(`rl-${seq}`);
    const s = jcs({
      v: 1,
      plotId: world.plotId,
      deviceId: world.deviceId,
      seq,
      prevEventHash: 'genesis',
      capturedAt: new Date().toISOString(),
      gps: { ...P01_INSIDE, accuracyM: 8 },
      cherryKg: 10,
      media: [{ sha256: await sha256Hex(photo), size: photo.length, mime: 'image/jpeg' }],
    });
    const fd = new FormData();
    fd.set('payload', s);
    fd.set('signature', await sign(dev.pair.privateKey, s));
    fd.set('photo0', new File([photo], 'p.jpg', { type: 'image/jpeg' }));
    return multipartRequest('http://localhost/api/capture', fd, { cookie, 'x-forwarded-for': ip });
  }

  it('the 31st capture from one phone in 10 minutes → 429 rate_limited with Retry-After; nothing anchored', async () => {
    // 30 earlier attempts already counted in this window
    const now = new Date();
    for (let i = 0; i < 30; i++) await consume(t.db, deviceKey(world.deviceId), 30, 600, now);
    const entries = Number((await t.client.execute('SELECT COUNT(*) AS n FROM ledger_entries')).rows[0]?.n);
    const { POST } = await import('../../app/api/capture/route');
    const res = await POST(await request(1, '203.0.113.20'));
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get('retry-after'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(600);
    expect(JSON.parse((await res.text()).trim())).toEqual({ t: 'rejected', reason: 'rate_limited', status: 429, retryAfterSec: retryAfter });
    expect(Number((await t.client.execute('SELECT COUNT(*) AS n FROM ledger_entries')).rows[0]?.n)).toBe(entries);
    expect((await t.client.execute('SELECT COUNT(*) AS n FROM harvest_events')).rows[0]?.n).toBe(0);
  });

  it('the 61st request from one address in 10 minutes → 429 before the body is read', async () => {
    const now = new Date();
    for (let i = 0; i < 60; i++) await consume(t.db, ipKey('203.0.113.30'), 60, 600, now);
    const { POST } = await import('../../app/api/capture/route');
    const res = await POST(await request(1, '203.0.113.30'));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    // another address is unaffected
    const ok = await POST(await request(1, '203.0.113.31'));
    expect(ok.status).toBe(200);
    await ok.text();
  });
});
