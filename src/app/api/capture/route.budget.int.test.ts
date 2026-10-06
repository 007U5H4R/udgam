// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../../scripts/tracer-world';
import { cookieHeader } from '../../../../tests/helpers/auth';
import { fakeJpeg, multipartRequest } from '../../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../../../lib/crypto';

// SEC-003 (TKT-28): a per-agent daily budget on accepted captures and their photo bytes, enforced at
// the route with the existing refusal: 429 `rate_limited` with Retry-After, before the body is read and
// before a slot is taken. The phone keeps the picking in its outbox and sends it again later (TKT-11).

let t: TempDb;
let dev: TestDevice;
let world: TracerWorld;
let cookie: string;
const PASSWORD = 'tracer agent password';

beforeEach(async () => {
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk, agentPassword: PASSWORD });
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  const { appAuth } = await import('../../_auth/auth');
  cookie = cookieHeader(await appAuth().api.signInEmail({ body: { email: world.agentEmail, password: PASSWORD }, asResponse: true }));
});
afterEach(async () => {
  (await import('../../../lib/db/client')).closeDb();
  vi.doUnmock('../../../lib/log');
  vi.unstubAllEnvs();
  await t.cleanup();
});

let seq = 0;
let prev = 'genesis';
async function capture(label: string): Promise<Request> {
  const bytes = fakeJpeg(label);
  seq += 1;
  const payload = {
    v: 1 as const,
    plotId: world.plotId,
    deviceId: world.deviceId,
    seq,
    prevEventHash: prev,
    capturedAt: new Date().toISOString(),
    gps: { ...P01_INSIDE, accuracyM: 8 },
    cherryKg: 40 + seq,
    media: [{ sha256: await sha256Hex(bytes), size: bytes.length, mime: 'image/jpeg' }],
  };
  const signed = jcs(payload);
  prev = await sha256Hex(new TextEncoder().encode(signed));
  const fd = new FormData();
  fd.set('payload', signed);
  fd.set('signature', await sign(dev.pair.privateKey, signed));
  fd.set('photo0', new File([bytes], 'p.jpg', { type: 'image/jpeg' }));
  return multipartRequest('http://localhost/api/capture', fd, { cookie });
}

/** The route on fresh modules with these variables (env.ts parses once per module instance). */
async function routeWith(vars: Record<string, string>) {
  (await import('../../../lib/db/client')).closeDb(); // the handle the sign-in opened
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  vi.resetModules();
  return import('./route');
}

const lastLine = async (res: Response) => JSON.parse((await res.text()).trim().split('\n').at(-1)!) as Record<string, unknown>;

describe('POST /api/capture daily budget (SEC-003)', () => {
  beforeEach(() => {
    seq = 0;
    prev = 'genesis';
  });

  it('past CAPTURE_DAILY_MAX_CAPTURES: 429 rate_limited with Retry-After until India midnight, body unread, no slot held, logged', async () => {
    const warn = vi.fn();
    vi.doMock('../../../lib/log', async (importOriginal) => {
      const real = await importOriginal<typeof import('../../../lib/log')>();
      return { ...real, log: new Proxy(real.log, { get: (l, p) => (p === 'warn' ? warn : Reflect.get(l, p)) }) };
    });
    const { POST } = await routeWith({ CAPTURE_DAILY_MAX_CAPTURES: '1' });
    const first = await POST(await capture('one'));
    expect(first.status).toBe(200);
    expect(await lastLine(first)).toMatchObject({ t: 'verdict' });

    const req = await capture('two');
    const refused = await POST(req);
    expect(refused.status).toBe(429);
    const line = await lastLine(refused);
    expect(line).toMatchObject({ t: 'rejected', reason: 'rate_limited', status: 429 });
    const after = Number(refused.headers.get('retry-after'));
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(24 * 3600);
    expect(line.retryAfterSec).toBe(after);
    expect(req.bodyUsed).toBe(false);
    const { capturesInFlight } = await import('../../../lib/capture/in-flight'); // the route's module instance
    expect(capturesInFlight().total).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ budget: 'captures', captures: 1, maxCaptures: 1 }), 'capture.budget_exhausted');
    const n = (await t.client.execute("SELECT count(*) AS n FROM harvest_events WHERE boundary_status = 'accepted'")).rows[0]!.n;
    expect(Number(n)).toBe(1);
  });

  it('past CAPTURE_DAILY_MAX_BYTES: the next capture is refused the same way', async () => {
    const { POST } = await routeWith({ CAPTURE_DAILY_MAX_BYTES: '10' }); // the first photo alone is more than 10 bytes
    const first = await POST(await capture('big'));
    expect(first.status).toBe(200);
    expect(await lastLine(first)).toMatchObject({ t: 'verdict' }); // read to the end: committed, slot released
    const refused = await POST(await capture('next'));
    expect(refused.status).toBe(429);
    expect(await lastLine(refused)).toMatchObject({ reason: 'rate_limited' });
  });

  it('under the defaults, captures go through', async () => {
    const { POST } = await import('./route');
    for (const l of ['a', 'b', 'c']) {
      const res = await POST(await capture(l));
      expect(res.status).toBe(200);
      expect(await lastLine(res)).toMatchObject({ t: 'verdict' });
    }
  });
});
