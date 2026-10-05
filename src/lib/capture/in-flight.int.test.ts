// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { addUser, cookieHeader } from '../../../tests/helpers/auth';
import { fakeJpeg, multipartRequest } from '../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../crypto';
import { capturesInFlight } from './in-flight';

// TASK-20 fix round 1 (review minor 10): at most MAX_CAPTURES_IN_FLIGHT (4) capture bodies are buffered
// and processed per process. Past that, POST /api/capture answers 503 {t:"error", retryable:true} with
// Retry-After, before its body is read. Fix round 2 (N2, N7): one agent holds at most 2 slots; the
// per-address limit is checked before a slot is taken; a body must arrive within the deadline (408); every
// early path gives its slot back. The slot counts live on globalThis, so each test ends with none held.

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
/** While true, the per-address rate-limit write fails (the database refusing). */
let failConsume = false;
/**
 * The rate limiter's clock when a test pins it (else the wall clock). Its windows are fixed 10-minute
 * buckets of wall-clock time, so a test that fills a bucket and then asserts on the next request must not
 * straddle a bucket boundary: slow setup under load could roll the window over in between (TASK-20).
 */
let rateNow: Date | undefined;
/** The route's body-read deadline in these tests (60 s in the app; the value is pinned in in-flight.test.ts). */
let deadlineMs = 30_000;
/** Bodies left hanging by a test; broken off in afterEach so no slot outlives its test. */
const hanging: { fail: () => void; response: Promise<Response> }[] = [];

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
  failConsume = false;
  rateNow = undefined;
  vi.doMock('./rate-limit', async (importOriginal) => {
    const real = await importOriginal<typeof import('./rate-limit')>();
    return {
      ...real,
      consume: async (...[db, key, limit, windowSec, now]: Parameters<typeof real.consume>) => {
        if (failConsume) throw new Error('database is locked');
        return real.consume(db, key, limit, windowSec, rateNow ?? now ?? new Date()); // a pinned clock wins over the route's own
      },
    };
  });
  vi.doMock('./limits', async (importOriginal) => ({ ...(await importOriginal<typeof import('./limits')>()), BODY_READ_DEADLINE_MS: deadlineMs }));
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
  for (const h of hanging.splice(0)) {
    h.fail();
    await (await h.response).text();
  }
  expect(capturesInFlight().total).toBe(0);
  deadlineMs = 30_000;
  vi.doUnmock('../verification/verify');
  vi.doUnmock('./rate-limit');
  vi.doUnmock('./limits');
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
function untouchedBody(extra: Record<string, string> = {}): { req: Request; pulled: () => boolean } {
  let pulled = false;
  const body = new ReadableStream({ pull: (c) => ((pulled = true), c.close()) }, { highWaterMark: 0 });
  const req = new Request(URL_, {
    method: 'POST',
    body,
    headers: { cookie, 'content-type': 'multipart/form-data; boundary=x', 'content-length': '1000', ...extra },
    duplex: 'half',
  } as RequestInit);
  return { req, pulled: () => pulled };
}

/** Another signed-in agent of the tracer org (no phone needed: these requests never get past the body). */
async function agentCookie(id: string): Promise<string> {
  const email = `${id.toLowerCase()}@tracer.udgam.test`;
  await addUser(t.db, { id, email, password: PASSWORD, role: 'agent', orgId: world.orgId });
  const { appAuth } = await import('../../app/_auth/auth');
  return cookieHeader(await appAuth().api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true }));
}

/**
 * POST a capture whose body starts to arrive and then stalls: it holds its slot while the route waits for
 * the rest. Resolves once the route has started reading (so the slot is taken). `fail()` breaks it off.
 */
async function stalled(POST: (r: Request) => Promise<Response>, as: string, ip: string): Promise<{ fail: () => void; cancelled: () => boolean; response: Promise<Response> }> {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  let reading!: () => void;
  const started = new Promise<void>((r) => (reading = r));
  const body = new ReadableStream<Uint8Array>(
    {
      start: (c) => void (ctrl = c),
      pull: () => {
        reading();
        return new Promise<void>(() => undefined); // nothing more arrives
      },
      cancel: () => void (cancelled = true),
    },
    { highWaterMark: 0 },
  );
  const req = new Request(URL_, {
    method: 'POST',
    body,
    headers: { cookie: as, 'content-type': 'multipart/form-data; boundary=x', 'content-length': '1000', 'x-forwarded-for': ip },
    duplex: 'half',
  } as RequestInit);
  const response = POST(req);
  const h = {
    fail: () => {
      try {
        ctrl.error(new Error('connection reset'));
      } catch {
        // already cancelled by the route
      }
    },
    cancelled: () => cancelled,
    response,
  };
  hanging.push(h);
  await Promise.race([started, response]);
  return h;
}

describe('concurrent capture cap (fix round 1)', () => {
  it('the cap is 4 in flight, and a busy answer asks the phone to retry in 5 s', async () => {
    const { MAX_CAPTURES_IN_FLIGHT, BUSY_RETRY_AFTER_SEC } = await import('./limits');
    expect(MAX_CAPTURES_IN_FLIGHT).toBe(4);
    expect(BUSY_RETRY_AFTER_SEC).toBe(5);
  });

  it('with 4 captures in flight (2 in verification, 2 still uploading), a 5th → 503 {t:"error", retryable:true} + Retry-After, body unread; after they finish, captures go through', async () => {
    const { POST } = await import('../../app/api/capture/route');
    const b = await agentCookie('AG-B');
    const c = await agentCookie('AG-C');
    holdVerify();
    const both = new Promise<void>((r) => {
      onArrive = () => {
        if (waiting === 2) r();
      };
    });
    // Not awaited: a capture's response starts with its first check line, which comes out of verify().
    const running = Array.from({ length: 2 }, async () => POST(await capture()));
    await both; // A's two are past their body and waiting in verify()
    await stalled(POST, b, '203.0.113.63');
    await stalled(POST, b, '203.0.113.63');
    expect(capturesInFlight().total).toBe(4);
    const { req, pulled } = untouchedBody({ cookie: c, 'x-forwarded-for': '203.0.113.64' });
    const busy = await POST(req);
    expect(busy.status).toBe(503);
    expect(busy.headers.get('retry-after')).toBe('5');
    expect(JSON.parse((await busy.text()).trim())).toEqual({ t: 'error', retryable: true });
    expect(pulled()).toBe(false);
    // Fix round 2: the per-address limit runs before a slot is taken, so the busy request was counted.
    expect((await t.client.execute("SELECT key, count FROM rate_limits WHERE key LIKE 'capture:ip:%' ORDER BY key")).rows.map((r) => ({ ...r }))).toEqual([
      { key: 'capture:ip:203.0.113.60', count: 2 },
      { key: 'capture:ip:203.0.113.63', count: 2 },
      { key: 'capture:ip:203.0.113.64', count: 1 },
    ]);
    releaseVerify();
    for (const p of running) {
      const r = await p;
      expect(r.status).toBe(200);
      await r.text();
    }
    for (const h of hanging.splice(0)) {
      h.fail();
      expect((await h.response).status).toBe(400); // the body broke off
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

describe('capture slots, fix round 2 (N2, N7)', () => {
  it('one agent holds at most 2 slots: its 3rd → 503 unread and costs no slot; other agents still get the rest; past 4 → 503 for everyone', async () => {
    const { POST } = await import('../../app/api/capture/route');
    const b = await agentCookie('AG-B');
    const c = await agentCookie('AG-C');
    await stalled(POST, cookie, '203.0.113.70');
    await stalled(POST, cookie, '203.0.113.70');
    const third = untouchedBody({ 'x-forwarded-for': '203.0.113.70' });
    const refused = await POST(third.req);
    expect(refused.status).toBe(503);
    expect(refused.headers.get('retry-after')).toBe('5');
    expect(JSON.parse((await refused.text()).trim())).toEqual({ t: 'error', retryable: true });
    expect(third.pulled()).toBe(false);
    expect(capturesInFlight()).toEqual({ total: 2, agents: { [world.agentId]: 2 } });
    await stalled(POST, b, '203.0.113.71'); // another agent is not locked out by A's uploads
    await stalled(POST, b, '203.0.113.71');
    expect(capturesInFlight().total).toBe(4);
    const full = untouchedBody({ cookie: c, 'x-forwarded-for': '203.0.113.72' });
    const busy = await POST(full.req);
    expect(busy.status).toBe(503); // the process-wide cap of 4 still holds
    await busy.text();
    expect(full.pulled()).toBe(false);
    // A's first upload breaks off: A may start another one.
    const [a1] = hanging.splice(0, 1);
    a1!.fail();
    expect((await a1!.response).status).toBe(400);
    await stalled(POST, cookie, '203.0.113.70');
    expect(capturesInFlight().agents[world.agentId]).toBe(2);
  });

  it('the per-address limit is checked before a slot is taken: with all 4 slots held, an address over its limit → 429, not 503', async () => {
    const { POST } = await import('../../app/api/capture/route');
    const b = await agentCookie('AG-B');
    const { consume: realConsume, ipKey, IP_LIMIT } = await vi.importActual<typeof import('./rate-limit')>('./rate-limit');
    // One pinned clock, mid-window, for the fill and for every request after it: the window cannot roll
    // over between them however slow the setup is (it did once under full-suite load: 503 instead of 429).
    rateNow = new Date('2026-10-14T04:15:00.000Z');
    for (let i = 0; i < IP_LIMIT.limit; i++) await realConsume(t.db, ipKey('203.0.113.80'), IP_LIMIT.limit, IP_LIMIT.windowSec, rateNow);
    await stalled(POST, cookie, '203.0.113.81');
    await stalled(POST, cookie, '203.0.113.81');
    await stalled(POST, b, '203.0.113.82');
    await stalled(POST, b, '203.0.113.82');
    const c = await agentCookie('AG-C');
    const over = untouchedBody({ cookie: c, 'x-forwarded-for': '203.0.113.80' });
    const r = await POST(over.req);
    expect(r.status).toBe(429);
    expect(JSON.parse((await r.text()).trim())).toMatchObject({ t: 'rejected', reason: 'rate_limited', status: 429 });
    expect(over.pulled()).toBe(false);
  });

  it('a body that has not arrived by the deadline → 408 {t:"error", retryable:true}; its read is cancelled and its slot freed', async () => {
    deadlineMs = 200;
    vi.resetModules();
    const { POST } = await import('../../app/api/capture/route');
    const b = await agentCookie('AG-B');
    const slow = [await stalled(POST, cookie, '203.0.113.90'), await stalled(POST, cookie, '203.0.113.90'), await stalled(POST, b, '203.0.113.91'), await stalled(POST, b, '203.0.113.91')];
    for (const h of slow) {
      const r = await h.response;
      expect(r.status).toBe(408);
      expect(r.headers.get('retry-after')).toBeNull();
      expect(JSON.parse((await r.text()).trim())).toEqual({ t: 'error', retryable: true });
      expect(h.cancelled()).toBe(true);
    }
    hanging.splice(0);
    expect(capturesInFlight().total).toBe(0);
    const ok = await POST(await capture('203.0.113.92'));
    expect(ok.status).toBe(200);
    await ok.text();
  });

  it('the early paths give their slot back: per-address 429s, a failing rate-limit write, a body that is not multipart, a body that breaks off', async () => {
    const { POST } = await import('../../app/api/capture/route');
    const { consume: realConsume, ipKey, IP_LIMIT } = await vi.importActual<typeof import('./rate-limit')>('./rate-limit');
    for (let i = 0; i < IP_LIMIT.limit; i++) await realConsume(t.db, ipKey('203.0.113.100'), IP_LIMIT.limit, IP_LIMIT.windowSec);
    for (let i = 0; i < 6; i++) {
      const r = await POST(await capture('203.0.113.100'));
      expect(r.status, `429 #${i}`).toBe(429);
      await r.text();
    }
    failConsume = true;
    for (let i = 0; i < 6; i++) {
      const r = await POST(await capture('203.0.113.101'));
      expect(r.status, `db failure #${i}`).toBe(503);
      expect(JSON.parse((await r.text()).trim())).toEqual({ t: 'error', retryable: true });
    }
    failConsume = false;
    for (let i = 0; i < 6; i++) {
      const junk = new TextEncoder().encode('this is not multipart');
      const r = await POST(
        new Request(URL_, { method: 'POST', body: junk, headers: { cookie, 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(junk.length), 'x-forwarded-for': '203.0.113.102' } }),
      );
      expect(r.status, `bad form #${i}`).toBe(400);
      expect(JSON.parse((await r.text()).trim())).toEqual({ t: 'rejected', reason: 'bad_form', status: 400 });
    }
    for (let i = 0; i < 6; i++) {
      const h = await stalled(POST, cookie, '203.0.113.103');
      h.fail();
      const r = await h.response;
      expect(r.status, `broken body #${i}`).toBe(400);
      await r.text();
    }
    hanging.splice(0);
    expect(capturesInFlight().total).toBe(0);
    const ok = await POST(await capture('203.0.113.104'));
    expect(ok.status).toBe(200);
    await ok.text();
  });
});
