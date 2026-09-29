// @vitest-environment node
import { Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../scripts/tracer-world';
import { cookieHeader } from '../../tests/helpers/auth';
import { fakeJpeg, multipartRequest } from '../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from './crypto';

// TSK-19.6 · TC-075 · EVAL-083: in-process capture requests (a Verified one and refused ones) emit
// structured logs that contain neither a request's signature nor any value of the secret variables.

let t: TempDb;
let dev: TestDevice;
let world: TracerWorld;
let lines: string[];
const PASSWORD = 'tracer agent password';
/** Test-only secret values: distinctive so a leak is findable, fake so the grep is not scan bait. */
const SECRETS = {
  BETTER_AUTH_SECRET: 'fake-auth-secret-7f3a9c0e5b2d4186a1c3e5f7091b2d4f',
  GFW_API_KEY: 'fake-gfw-key-2b4d6f8a0c1e3a5c',
  CDSE_CLIENT_SECRET: 'fake-cdse-secret-9e8d7c6b5a4f3e2d',
  ARCGIS_API_KEY: 'fake-arcgis-key-1a2b3c4d5e6f7a8b',
  MAPTILER_KEY: 'fake-maptiler-key-0f1e2d3c4b5a6978',
};

beforeEach(async () => {
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk, agentPassword: PASSWORD });
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  for (const [k, v] of Object.entries(SECRETS)) vi.stubEnv(k, v);
  lines = [];
  vi.doMock('./log', async (importOriginal) => {
    const real = await importOriginal<typeof import('./log')>();
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const logger = real.createLogger('debug', stream);
    return { ...real, log: logger, withRequestId: () => logger };
  });
});
afterEach(async () => {
  vi.doUnmock('./log');
  (await import('./db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

async function capture(photo: Uint8Array<ArrayBuffer>, o: { tamper?: boolean; seq?: number } = {}) {
  const payload = {
    v: 1 as const,
    plotId: world.plotId,
    deviceId: world.deviceId,
    seq: o.seq ?? 1,
    prevEventHash: 'genesis',
    capturedAt: new Date().toISOString(),
    gps: { ...P01_INSIDE, accuracyM: 8 },
    cherryKg: 12.5,
    media: [{ sha256: await sha256Hex(photo), size: photo.length, mime: 'image/jpeg' }],
  };
  const s = jcs(payload);
  const signature = await sign(dev.pair.privateKey, s);
  const fd = new FormData();
  fd.set('payload', o.tamper ? jcs({ ...payload, cherryKg: 99 }) : s);
  fd.set('signature', signature);
  fd.set('photo0', new File([photo], 'p.jpg', { type: 'image/jpeg' }));
  return { fd, signature };
}

describe('TC-075 / EVAL-083 capture logs carry no signature and no secret', () => {
  it('a Verified capture, a signed refusal and a tampered payload', async () => {
    const { appAuth } = await import('../app/_auth/auth');
    const cookie = cookieHeader(await appAuth().api.signInEmail({ body: { email: world.agentEmail, password: PASSWORD }, asResponse: true }));
    const { POST } = await import('../app/api/capture/route');

    const sent = [await capture(fakeJpeg('ok')), await capture(new TextEncoder().encode('text, not a photo'), { seq: 2 }), await capture(fakeJpeg('t'), { tamper: true, seq: 3 })];
    const statuses: number[] = [];
    for (const c of sent) {
      const res = await POST(await multipartRequest('http://localhost/api/capture', c.fd, { cookie }));
      statuses.push(res.status);
      await res.text();
    }
    expect(statuses).toEqual([200, 415, 401]);

    const out = lines.join('');
    expect(out).toContain('capture.refused'); // the logs were captured
    for (const { signature } of sent) expect(out).not.toContain(signature);
    for (const [name, value] of Object.entries(SECRETS)) expect(out.includes(value), name).toBe(false);
    expect(out).not.toContain(cookie.split('=')[1]!.slice(0, 16));
  });
});
