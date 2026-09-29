// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../../scripts/tracer-world';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../../../lib/crypto';

let t: TempDb;
let dev: TestDevice;
let world: TracerWorld;

beforeEach(async () => {
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk });
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
});
afterEach(async () => {
  (await import('../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

async function request(tamper = false) {
  const bytes = new TextEncoder().encode('tracer-photo');
  const payload = {
    v: 1 as const,
    plotId: world.plotId,
    deviceId: world.deviceId,
    seq: 1,
    prevEventHash: 'genesis',
    capturedAt: '2026-10-14T04:12:33.120Z',
    gps: { ...P01_INSIDE, accuracyM: 8 },
    cherryKg: 42.5,
    media: [{ sha256: await sha256Hex(bytes), size: bytes.length, mime: 'image/jpeg' }],
  };
  const signed = jcs(payload);
  const fd = new FormData();
  fd.set('payload', tamper ? jcs({ ...payload, cherryKg: 142.5 }) : signed);
  fd.set('signature', await sign(dev.pair.privateKey, signed));
  fd.set('photo0', new File([bytes], 'p.jpg', { type: 'image/jpeg' }));
  return new Request('http://localhost/api/capture', { method: 'POST', body: fd });
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
    const res = await POST(new Request('http://localhost/api/capture', { method: 'POST', body: 'nope' }));
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

describe('session guard stub (technical-plan §10)', () => {
  it('the route calls captureSessionGuard before reading the body', () => {
    const src = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
    const guardAt = src.indexOf('await captureSessionGuard(req)');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(src.indexOf('req.formData()'));
  });

  it('is still the TKT-02 stub: TKT-04 must replace it with requireSession("agent") and flip this test', async () => {
    const { CAPTURE_SESSION_GUARD_IS_STUB } = await import('./guard');
    expect(CAPTURE_SESSION_GUARD_IS_STUB).toBe(true);
    const src = readFileSync(new URL('./guard.ts', import.meta.url), 'utf8');
    expect(src).toContain("TODO(TKT-04): replace with `requireSession('agent')`");
  });
});
