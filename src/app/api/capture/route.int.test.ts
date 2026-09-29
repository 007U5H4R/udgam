// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../../scripts/tracer-world';
import { addOrg, addUser, cookieHeader } from '../../../../tests/helpers/auth';
import { fakeJpeg, multipartRequest } from '../../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../../../lib/crypto';

let t: TempDb;
let dev: TestDevice;
let world: TracerWorld;
/** The Cookie header of the tracer world's signed-in agent (the device's owner). */
let agentCookie: string;

const PASSWORD = 'tracer agent password';

beforeEach(async () => {
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk, agentPassword: PASSWORD });
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  agentCookie = await signIn(world.agentEmail);
});
afterEach(async () => {
  (await import('../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

/** Sign in through the app's Better Auth instance and return the session's Cookie header. */
async function signIn(email: string, password = PASSWORD): Promise<string> {
  const { appAuth } = await import('../../_auth/auth');
  const res = await appAuth().api.signInEmail({ body: { email, password }, asResponse: true });
  expect(res.status).toBe(200);
  return cookieHeader(res);
}

async function request(tamper = false, cookie: string | null = agentCookie) {
  const bytes = fakeJpeg('tracer-photo');
  const payload = {
    v: 1 as const,
    plotId: world.plotId,
    deviceId: world.deviceId,
    seq: 1,
    prevEventHash: 'genesis',
    capturedAt: new Date().toISOString(), // the route stamps real server time; the clock gap is checked (TKT-08)
    gps: { ...P01_INSIDE, accuracyM: 8 },
    cherryKg: 42.5,
    media: [{ sha256: await sha256Hex(bytes), size: bytes.length, mime: 'image/jpeg' }],
  };
  const signed = jcs(payload);
  const fd = new FormData();
  fd.set('payload', tamper ? jcs({ ...payload, cherryKg: 142.5 }) : signed);
  fd.set('signature', await sign(dev.pair.privateKey, signed));
  fd.set('photo0', new File([bytes], 'p.jpg', { type: 'image/jpeg' }));
  return multipartRequest('http://localhost/api/capture', fd, cookie ? { cookie } : {});
}

const lines = async (res: Response) =>
  (await res.text())
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as { t: string });

describe('POST /api/capture', () => {
  it('streams NDJSON check lines and a Verified verdict with the streaming headers', async () => {
    const { POST } = await import('./route');
    const res = await POST(await request());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/x-ndjson');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    const out = await lines(res);
    expect(out.map((l) => l.t).join()).toMatch(/^(check,)+verdict$/); // one line per registered check
    expect(out.at(-1)).toMatchObject({ verdict: 'Verified' });
  });

  it('EVAL-053 answers a payload tampered after signing with 401 and a rejected line', async () => {
    const { POST } = await import('./route');
    const res = await POST(await request(true));
    expect(res.status).toBe(401);
    expect(await lines(res)).toEqual([{ t: 'rejected', reason: 'bad_signature', status: 401 }]);
  });

  it('answers a body that is not multipart with 400', async () => {
    const { POST } = await import('./route');
    const res = await POST(new Request('http://localhost/api/capture', { method: 'POST', body: 'nope', headers: { cookie: agentCookie, 'content-length': '4' } }));
    expect(res.status).toBe(400);
  });

  it('declares the Node runtime and no caching', async () => {
    const mod = await import('./route');
    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
  });
});

describe('client disconnect', () => {
  afterEach(() => {
    vi.doUnmock('../../../lib/db/client');
    vi.doUnmock('../../../lib/log');
    vi.doUnmock('../../../lib/capture/rate-limit');
  });

  it('a stream cancelled before the verdict still commits once, raises no unhandled rejection and logs no failure', async () => {
    // Hold the capture transaction until the client has gone.
    let openGate!: () => void;
    const gate = new Promise<void>((r) => (openGate = r));
    vi.doMock('../../../lib/db/client', async (importOriginal) => {
      const real = await importOriginal<typeof import('../../../lib/db/client')>();
      return {
        ...real,
        writeTx: async (...args: Parameters<typeof real.writeTx>) => {
          await gate;
          return real.writeTx(...args);
        },
      };
    });
    // The rate limits count in their own write transactions before the stream starts; only the
    // capture's commit is held here.
    vi.doMock('../../../lib/capture/rate-limit', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../../../lib/capture/rate-limit')>()),
      consume: async () => ({ ok: true, retryAfterSec: 0 }),
    }));
    const error = vi.fn();
    const warn = vi.fn();
    vi.doMock('../../../lib/log', () => ({ log: { error, warn, info: vi.fn() } }));
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const { POST } = await import('./route');
      const res = await POST(await request());
      expect(res.status).toBe(200);
      const reader = res.body!.getReader();
      await reader.read(); // the first check line
      await reader.cancel(); // the phone drops off the network
      openGate();

      await vi.waitFor(async () => {
        const n = (await t.client.execute('SELECT COUNT(*) AS n FROM verification_runs')).rows[0]?.n;
        expect(n).toBe(1);
      });
      await new Promise((r) => setTimeout(r, 50)); // let the route's finally run
      expect(unhandled).toEqual([]);
      expect(error).not.toHaveBeenCalled();
      expect((await t.client.execute('SELECT COUNT(*) AS n FROM harvest_events')).rows[0]?.n).toBe(1);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('agent session guard (technical-plan §10, TC-018, EVAL-080)', () => {
  const other = async (id: string, role: 'agent' | 'admin' | 'buyer', orgId: string) => {
    await addUser(t.db, { id, email: `${id.toLowerCase()}@x.test`, password: PASSWORD, role, orgId });
    return signIn(`${id.toLowerCase()}@x.test`);
  };

  it('signed out → 401 JSON before the body is read; nothing is written', async () => {
    const { POST } = await import('./route');
    const res = await POST(await request(false, null));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
    expect((await t.client.execute('SELECT COUNT(*) AS n FROM harvest_events')).rows[0]?.n).toBe(0);
  });

  it('a forged or expired session cookie → 401', async () => {
    const { POST } = await import('./route');
    const res = await POST(await request(false, 'better-auth.session_token=forged.value'));
    expect(res.status).toBe(401);
  });

  it("the FPO's own admin and a buyer → 403 JSON; nothing is written", async () => {
    await addOrg(t.db, 'ORG-BUYER-A', 'buyer');
    const { POST } = await import('./route');
    for (const cookie of [await other('U-ADMIN', 'admin', world.orgId), await other('U-BUYER', 'buyer', 'ORG-BUYER-A')]) {
      const res = await POST(await request(false, cookie));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'forbidden' });
    }
    expect((await t.client.execute('SELECT COUNT(*) AS n FROM harvest_events')).rows[0]?.n).toBe(0);
  });

  it("another agent (another FPO) signing in with this agent's phone payload → 403 device_not_owned, not anchored", async () => {
    await addOrg(t.db, 'ORG-FPO-B', 'fpo');
    const { POST } = await import('./route');
    const res = await POST(await request(false, await other('U-AGENT-B', 'agent', 'ORG-FPO-B')));
    expect(res.status).toBe(403);
    expect(await lines(res)).toEqual([{ t: 'rejected', reason: 'device_not_owned', status: 403 }]);
    expect((await t.client.execute('SELECT COUNT(*) AS n FROM harvest_events')).rows[0]?.n).toBe(0);
  });

  it('the route calls requireSession("agent") before reading the body, and the TKT-02 stub is gone', () => {
    const src = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
    const guardAt = src.indexOf("await requireSession('agent', { request: req })");
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(src.indexOf('req.formData()'));
    expect(src).toContain('agentId: agent.userId');
    expect(src).not.toContain('captureSessionGuard');
  });
});
