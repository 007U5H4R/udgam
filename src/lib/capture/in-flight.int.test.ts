// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { cookieHeader } from '../../../tests/helpers/auth';
import { fakeJpeg, multipartRequest } from '../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../crypto';

// TASK-20 fix round 1 (review minor 10): at most MAX_CAPTURES_IN_FLIGHT (4) capture bodies are buffered
// and processed per process. Past that, POST /api/capture answers 503 {t:"error", retryable:true} with
// Retry-After, before its body is read.

let t: TempDb;
let dev: TestDevice;
let world: TracerWorld;
let cookie: string;
const PASSWORD = 'tracer agent password';
const URL_ = 'http://localhost/api/capture';
/** Resolves every verify() that is being held. */
let releaseVerify: () => void = () => undefined;
let held = false;
/** How many verify() calls are waiting at the gate, and a hook fired on each arrival. */
let waiting = 0;
let onArrive: () => void = () => undefined;
/** From now on, every verify() waits until releaseVerify(). */
let holdVerify: () => void = () => undefined;

beforeEach(async () => {
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk, agentPassword: PASSWORD });
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  held = false;
  waiting = 0;
  let gate = Promise.resolve();
  vi.doMock('../verification/verify', async (importOriginal) => {
    const real = await importOriginal<typeof import('../verification/verify')>();
    return {
      ...real,
      verify: async (...args: Parameters<typeof real.verify>) => {
        if (held) {
          waiting++;
          onArrive();
          await gate;
        }
        return real.verify(...args);
      },
    };
  });
  holdVerify = () => {
    held = true;
    gate = new Promise<void>((r) => {
      releaseVerify = () => {
        held = false;
        r();
      };
    });
  };
  const { appAuth } = await import('../../app/_auth/auth');
  cookie = cookieHeader(await appAuth().api.signInEmail({ body: { email: world.agentEmail, password: PASSWORD }, asResponse: true }));
});
afterEach(async () => {
  releaseVerify();
  vi.doUnmock('../verification/verify');
  (await import('../db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

let seq = 0;
async function capture(ip = '203.0.113.60'): Promise<Request> {
  const photo = fakeJpeg(`in-flight-${seq}`);
  const s = jcs({
    v: 1,
    plotId: world.plotId,
    deviceId: world.deviceId,
    seq: ++seq,
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
  return multipartRequest(URL_, fd, { cookie, 'x-forwarded-for': ip });
}

/** A request whose body records whether anyone read it. */
function untouchedBody(): { req: Request; pulled: () => boolean } {
  let pulled = false;
  const body = new ReadableStream({ pull: (c) => ((pulled = true), c.close()) }, { highWaterMark: 0 });
  const req = new Request(URL_, {
    method: 'POST',
    body,
    headers: { cookie, 'content-type': 'multipart/form-data; boundary=x', 'content-length': '1000' },
    duplex: 'half',
  } as RequestInit);
  return { req, pulled: () => pulled };
}

describe('concurrent capture cap (fix round 1)', () => {
  it('the cap is 4 in flight, and a busy answer asks the phone to retry in 5 s', async () => {
    const { MAX_CAPTURES_IN_FLIGHT, BUSY_RETRY_AFTER_SEC } = await import('./limits');
    expect(MAX_CAPTURES_IN_FLIGHT).toBe(4);
    expect(BUSY_RETRY_AFTER_SEC).toBe(5);
  });

  it('with 4 captures in verification, a 5th → 503 {t:"error", retryable:true} + Retry-After, body unread; after they finish, captures go through', async () => {
    const { POST } = await import('../../app/api/capture/route');
    holdVerify();
    const all4 = new Promise<void>((r) => {
      onArrive = () => {
        if (waiting === 4) r();
      };
    });
    // Not awaited: a capture's response starts with its first check line, which comes out of verify().
    const running = Array.from({ length: 4 }, async () => POST(await capture()));
    await all4; // each of the four is past its body and waiting in verify()
    const { req, pulled } = untouchedBody();
    const busy = await POST(req);
    expect(busy.status).toBe(503);
    expect(busy.headers.get('retry-after')).toBe('5');
    expect(JSON.parse((await busy.text()).trim())).toEqual({ t: 'error', retryable: true });
    expect(pulled()).toBe(false);
    // the busy request is charged nothing (it carries no x-forwarded-for, so it would be 'unknown')
    expect((await t.client.execute("SELECT key, count FROM rate_limits WHERE key LIKE 'capture:ip:%'")).rows.map((r) => ({ ...r }))).toEqual([
      { key: 'capture:ip:203.0.113.60', count: 4 },
    ]);
    releaseVerify();
    for (const p of running) {
      const r = await p;
      expect(r.status).toBe(200);
      await r.text();
    }
    const after = await POST(await capture());
    expect(after.status).toBe(200);
    await after.text();
  });

  it('refused and failed requests give their slot back', async () => {
    const { POST } = await import('../../app/api/capture/route');
    for (let i = 0; i < 6; i++) {
      const bad = new FormData();
      bad.set('nope', 'x');
      const r = await POST(await multipartRequest(URL_, bad, { cookie, 'x-forwarded-for': '203.0.113.61' }));
      expect(r.status).toBe(400);
      await r.text();
    }
    for (let i = 0; i < 5; i++) {
      const r = await POST(await capture('203.0.113.62'));
      expect(r.status).toBe(200);
      await r.text();
    }
  });
});
