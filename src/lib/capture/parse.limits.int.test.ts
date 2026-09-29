// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { cookieHeader } from '../../../tests/helpers/auth';
import { fakeJpeg, multipartRequest } from '../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../crypto';
import type { CapturePayloadV1 } from '../verification/types';
import { MAX_BODY_BYTES, MAX_PHOTO_BYTES } from './limits';

// TSK-19.2 · TC-074 · EVAL-081: POST /api/capture refuses oversized, miscounted, mistyped and
// malformed uploads before verify() runs, cheapest check first. Where the request carried a valid
// signature, the refusal is anchored as a rejected harvest_event (Solution-PRD §7 rule 2).

let t: TempDb;
let dev: TestDevice;
let world: TracerWorld;
let cookie: string;
const verifyCalls = vi.fn();
const PASSWORD = 'tracer agent password';
const URL_ = 'http://localhost/api/capture';

beforeEach(async () => {
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk, agentPassword: PASSWORD });
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  verifyCalls.mockReset();
  vi.doMock('../verification/verify', async (importOriginal) => {
    const real = await importOriginal<typeof import('../verification/verify')>();
    return {
      ...real,
      verify: (...args: Parameters<typeof real.verify>) => {
        verifyCalls();
        return real.verify(...args);
      },
    };
  });
  const { appAuth } = await import('../../app/_auth/auth');
  const res = await appAuth().api.signInEmail({ body: { email: world.agentEmail, password: PASSWORD }, asResponse: true });
  cookie = cookieHeader(res);
});
afterEach(async () => {
  vi.doUnmock('../verification/verify');
  (await import('../db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

let n = 0;
/** A validly signed capture over `photos` (the payload lists each photo's hash and size). */
async function signed(photos: Uint8Array<ArrayBuffer>[] = [fakeJpeg(`p${n++}`)], mutate?: (p: CapturePayloadV1) => unknown) {
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: world.plotId,
    deviceId: world.deviceId,
    seq: 1,
    prevEventHash: 'genesis',
    capturedAt: new Date().toISOString(),
    gps: { ...P01_INSIDE, accuracyM: 8 },
    cherryKg: 42.5,
    media: await Promise.all(photos.map(async (b) => ({ sha256: await sha256Hex(b), size: b.length, mime: 'image/jpeg' }))),
  };
  const s = jcs(mutate ? mutate(payload) : payload);
  const fd = new FormData();
  fd.set('payload', s);
  fd.set('signature', await sign(dev.pair.privateKey, s));
  photos.forEach((b, i) => fd.set(`photo${i}`, new File([b], `p${i}.jpg`, { type: 'image/jpeg' })));
  return fd;
}

async function post(req: Request) {
  const { POST } = await import('../../app/api/capture/route');
  const res = await POST(req);
  const lines = (await res.text())
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  return { status: res.status, lines };
}

const rows = async () => (await t.client.execute('SELECT boundary_status, boundary_reason, device_id FROM harvest_events')).rows.map((r) => ({ ...r }));
const entries = async () => Number((await t.client.execute('SELECT COUNT(*) AS n FROM ledger_entries')).rows[0]?.n);

describe('TC-074 / EVAL-081 upload limits at the capture boundary', () => {
  it('a missing Content-Length → 411, the body is never read', async () => {
    let pulled = false;
    // highWaterMark 0: pull runs only when someone reads the body
    const body = new ReadableStream(
      {
        pull(c) {
          pulled = true;
          c.close();
        },
      },
      { highWaterMark: 0 },
    );
    const req = new Request(URL_, { method: 'POST', body, headers: { cookie, 'content-type': 'multipart/form-data; boundary=x' }, duplex: 'half' } as RequestInit);
    const r = await post(req);
    expect(r.status).toBe(411);
    expect(r.lines).toEqual([{ t: 'rejected', reason: 'length_required', status: 411 }]);
    expect(pulled).toBe(false);
    expect(verifyCalls).not.toHaveBeenCalled();
  });

  it(`a Content-Length above MAX_BODY_BYTES (${MAX_BODY_BYTES}) → 413 before the body is read`, async () => {
    let pulled = false;
    // highWaterMark 0: pull runs only when someone reads the body
    const body = new ReadableStream(
      {
        pull(c) {
          pulled = true;
          c.close();
        },
      },
      { highWaterMark: 0 },
    );
    const req = new Request(URL_, {
      method: 'POST',
      body,
      headers: { cookie, 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(MAX_BODY_BYTES + 1) },
      duplex: 'half',
    } as RequestInit);
    const r = await post(req);
    expect(r.status).toBe(413);
    expect(r.lines).toEqual([{ t: 'rejected', reason: 'body_too_large', status: 413 }]);
    expect(pulled).toBe(false);
    expect(verifyCalls).not.toHaveBeenCalled();
  });

  it('EVAL-081 a photo of 10 MB + 1 byte → 413 media_too_large, anchored (validly signed)', async () => {
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set([0xff, 0xd8, 0xff, 0xe0]);
    const r = await post(await multipartRequest(URL_, await signed([big]), { cookie }));
    expect(r.status).toBe(413);
    expect(r.lines).toEqual([{ t: 'rejected', reason: 'media_too_large', status: 413 }]);
    expect(await rows()).toEqual([{ boundary_status: 'rejected', boundary_reason: 'media_too_large', device_id: world.deviceId }]);
    expect(verifyCalls).not.toHaveBeenCalled();
  });

  it('EVAL-081 a 10.5 MB photo → 413', async () => {
    const big = new Uint8Array(Math.round(10.5 * 1024 * 1024));
    big.set([0xff, 0xd8, 0xff, 0xe0]);
    const r = await post(await multipartRequest(URL_, await signed([big]), { cookie }));
    expect(r.status).toBe(413);
    expect(verifyCalls).not.toHaveBeenCalled();
  });

  it('EVAL-081 zero photos → 400 media_count, anchored (validly signed)', async () => {
    const fd = await signed();
    fd.delete('photo0');
    const r = await post(await multipartRequest(URL_, fd, { cookie }));
    expect(r.status).toBe(400);
    expect(r.lines).toEqual([{ t: 'rejected', reason: 'media_count', status: 400 }]);
    expect(await rows()).toEqual([{ boundary_status: 'rejected', boundary_reason: 'media_count', device_id: world.deviceId }]);
    expect(verifyCalls).not.toHaveBeenCalled();
  });

  it('EVAL-081 four photos → 400 media_count', async () => {
    const fd = await signed([fakeJpeg('a'), fakeJpeg('b'), fakeJpeg('c')]);
    fd.set('photo3', new File([fakeJpeg('d')], 'p3.jpg', { type: 'image/jpeg' }));
    const r = await post(await multipartRequest(URL_, fd, { cookie }));
    expect(r.status).toBe(400);
    expect(r.lines).toEqual([{ t: 'rejected', reason: 'media_count', status: 400 }]);
    expect(verifyCalls).not.toHaveBeenCalled();
  });

  it('an unknown form field → 400 bad_form, nothing anchored', async () => {
    const fd = await signed();
    fd.set('comment', 'hello');
    const entriesBefore = await entries();
    const r = await post(await multipartRequest(URL_, fd, { cookie }));
    expect(r.status).toBe(400);
    expect(r.lines).toEqual([{ t: 'rejected', reason: 'bad_form', status: 400 }]);
    expect(await rows()).toEqual([]);
    expect(await entries()).toBe(entriesBefore);
    expect(verifyCalls).not.toHaveBeenCalled();
  });

  it('EVAL-081 a text file labelled image/jpeg → 415 media_type, anchored (validly signed)', async () => {
    const text = new TextEncoder().encode('not a photo at all, just text');
    const r = await post(await multipartRequest(URL_, await signed([text]), { cookie }));
    expect(r.status).toBe(415);
    expect(r.lines).toEqual([{ t: 'rejected', reason: 'media_type', status: 415 }]);
    expect(await rows()).toEqual([{ boundary_status: 'rejected', boundary_reason: 'media_type', device_id: world.deviceId }]);
    expect(verifyCalls).not.toHaveBeenCalled();
  });

  it('a PNG sent as image/jpeg → 415 media_type', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
    const r = await post(await multipartRequest(URL_, await signed([png]), { cookie }));
    expect(r.status).toBe(415);
    expect(verifyCalls).not.toHaveBeenCalled();
  });

  it('a payload failing the schema → 400 bad_schema naming the field, nothing anchored', async () => {
    const r = await post(await multipartRequest(URL_, await signed(undefined, (p) => ({ ...p, cherryKg: 0.3 })), { cookie }));
    expect(r.status).toBe(400);
    expect(r.lines).toEqual([{ t: 'rejected', reason: 'bad_schema', status: 400, field: 'cherryKg' }]);
    const nested = await post(await multipartRequest(URL_, await signed(undefined, (p) => ({ ...p, gps: { ...p.gps, lat: 'north' } })), { cookie }));
    expect(nested.lines).toEqual([{ t: 'rejected', reason: 'bad_schema', status: 400, field: 'gps.lat' }]);
    expect(await rows()).toEqual([]);
    expect(verifyCalls).not.toHaveBeenCalled();
  });

  it('EVAL-081 a media hash that does not match the uploaded bytes → 409, anchored as tampering', async () => {
    const fd = await signed([fakeJpeg('signed')]);
    fd.set('photo0', new File([fakeJpeg('swapped')], 'p0.jpg', { type: 'image/jpeg' }));
    const r = await post(await multipartRequest(URL_, fd, { cookie }));
    expect(r.status).toBe(409);
    expect(await rows()).toEqual([{ boundary_status: 'rejected', boundary_reason: 'media_hash_mismatch', device_id: world.deviceId }]);
    expect(verifyCalls).not.toHaveBeenCalled();
  });

  it('a valid capture still reaches verify() once', async () => {
    const r = await post(await multipartRequest(URL_, await signed(), { cookie }));
    expect(r.status).toBe(200);
    expect(r.lines.at(-1)).toMatchObject({ t: 'verdict' });
    expect(verifyCalls).toHaveBeenCalledTimes(1);
  });

  // Fix round 1: the sniffed type must agree with the signed media[i].mime; AVIF is refused; HEIC passes.
  const withMime = (mime: string) => (p: CapturePayloadV1) => ({ ...p, media: p.media.map((m) => ({ ...m, mime })) });

  it('a JPEG whose signed mime says image/png → 415 media_type, anchored (validly signed); nothing stored as .png', async () => {
    const r = await post(await multipartRequest(URL_, await signed([fakeJpeg('as-png')], withMime('image/png')), { cookie }));
    expect(r.status).toBe(415);
    expect(r.lines).toEqual([{ t: 'rejected', reason: 'media_type', status: 415 }]);
    expect(await rows()).toEqual([{ boundary_status: 'rejected', boundary_reason: 'media_type', device_id: world.deviceId }]);
    expect((await t.client.execute('SELECT COUNT(*) AS n FROM media')).rows[0]?.n).toBe(0);
    expect(verifyCalls).not.toHaveBeenCalled();
  });

  it('a mime mismatch under a signature no enrolled key verifies → 415, only logged', async () => {
    const fd = await signed([fakeJpeg('forged-as-heic')], withMime('image/heic'));
    fd.set('signature', await sign((await makeDevice()).pair.privateKey, String(fd.get('payload'))));
    const before = await entries();
    const r = await post(await multipartRequest(URL_, fd, { cookie }));
    expect(r.status).toBe(415);
    expect(await rows()).toEqual([]);
    expect(await entries()).toBe(before);
  });

  it('an AVIF photo (generic mif1 major brand, avif compatible) → 415 media_type', async () => {
    const box = new TextEncoder().encode('ftypmif1\0\0\0\0avifmif1miafMA1B');
    const avif = new Uint8Array([0, 0, 0, 4 + box.length, ...box, ...new TextEncoder().encode('avif body')]);
    for (const mime of ['image/avif', 'image/heic']) {
      const r = await post(await multipartRequest(URL_, await signed([avif], withMime(mime)), { cookie }));
      expect(r.status, mime).toBe(415);
      expect(r.lines, mime).toEqual([{ t: 'rejected', reason: 'media_type', status: 415 }]);
    }
    expect(verifyCalls).not.toHaveBeenCalled();
  });

  it('a real HEIC photo signed as image/heic is accepted end to end: verified, stored as .heic', async () => {
    const heic = new Uint8Array(readFileSync('evals/fixtures/photos/sample.heic'));
    const r = await post(await multipartRequest(URL_, await signed([heic], withMime('image/heic')), { cookie }));
    expect(r.status).toBe(200);
    expect(r.lines.at(-1)).toMatchObject({ t: 'verdict' });
    expect(verifyCalls).toHaveBeenCalledTimes(1);
    const media = (await t.client.execute('SELECT mime, path, size FROM media')).rows.map((m) => ({ ...m }));
    expect(media).toEqual([{ mime: 'image/heic', path: expect.stringMatching(/\.heic$/), size: heic.length }]);
    expect(await rows()).toEqual([{ boundary_status: 'accepted', boundary_reason: null, device_id: world.deviceId }]);
  });
});
