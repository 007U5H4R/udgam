import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { fakeJpeg } from '../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../crypto';
import { localMediaStore } from '../media/store';
import type { CapturePayloadV1, Submission, VerifyContext } from '../verification/types';
import { verify } from '../verification/verify';
import { runCapture, type CaptureEvent } from './pipeline';

// technical-plan §22 TSK-08.2: the pipeline reads EXIF from each stored photo into
// Submission.media[i].exif (and media.exif), and the context carries this device's last accepted
// event. verify() is wrapped, not replaced, so the real checks still run.
vi.mock('../verification/verify', async (importOriginal) => {
  const real = await importOriginal<typeof import('../verification/verify')>();
  return { ...real, verify: vi.fn(real.verify) };
});
const verifySpy = vi.mocked(verify);

let t: TempDb;
let dev: TestDevice;
let world: TracerWorld;

beforeEach(async () => {
  verifySpy.mockClear();
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk });
});
afterEach(async () => {
  await t.cleanup();
});

const FIXTURE = new Uint8Array(readFileSync('evals/fixtures/photos/gps-time-offset.jpg'));
/** A JPEG with no EXIF (JPEG magic bytes and a label). */
const text = (label: string) => fakeJpeg(label);

type FormOpts = { photos: Uint8Array<ArrayBuffer>[]; seq: number; prevEventHash: string; capturedAt: string; gps?: { lat: number; lng: number } };

async function form(o: FormOpts) {
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: world.plotId,
    deviceId: world.deviceId,
    seq: o.seq,
    prevEventHash: o.prevEventHash,
    capturedAt: o.capturedAt,
    gps: { ...(o.gps ?? P01_INSIDE), accuracyM: 8 },
    cherryKg: 42.5,
    media: await Promise.all(o.photos.map(async (b) => ({ sha256: await sha256Hex(b), size: b.length, mime: 'image/jpeg' }))),
  };
  const signed = jcs(payload);
  const fd = new FormData();
  fd.set('payload', signed);
  fd.set('signature', await sign(dev.pair.privateKey, signed));
  o.photos.forEach((b, i) => fd.set(`photo${i}`, new File([b], `p${i}.jpg`, { type: 'image/jpeg' })));
  return { fd, signed };
}

async function run(fd: FormData) {
  const events: CaptureEvent[] = [];
  // The session agent owns the seeded device (TKT-04: a device must belong to the signed-in agent).
  const deps = { db: t.db, media: localMediaStore(t.dir), agentId: world.agentId, now: () => new Date('2026-09-20T04:47:00.000Z') };
  await runCapture(fd, deps, (e) => events.push(e));
  return events;
}

const lastCall = (): [Submission, VerifyContext] => {
  const call = verifySpy.mock.calls.at(-1);
  if (!call) throw new Error('verify was not called');
  return [call[0], call[1]];
};

describe('capture pipeline feeds EXIF to verification (TSK-08.2)', () => {
  it('reads EXIF from the stored gps-time-offset.jpg, passes ExifFacts to verify and stores them in media.exif', async () => {
    const { fd } = await form({ photos: [FIXTURE, text('no-exif')], seq: 1, prevEventHash: 'genesis', capturedAt: '2026-09-20T04:46:00.000Z' });
    expect((await run(fd)).at(-1)).toMatchObject({ t: 'verdict' });

    const [sub] = lastCall();
    expect(sub.media).toHaveLength(2);
    expect(sub.media[0]!.sha256).toBe(await sha256Hex(FIXTURE));
    expect(sub.media[0]!.exif).toEqual({
      gps: { lat: expect.closeTo(12.4211, 6), lng: expect.closeTo(75.7392, 6) },
      takenAt: '2026-09-20T04:45:00.000Z',
      hadOffset: true,
      make: 'Udgam fixture',
      model: 'gps-time-offset',
    });
    expect(sub.media[1]!.exif).toEqual({ gps: null, takenAt: null, hadOffset: false });

    const rows = (await t.client.execute('SELECT sha256, exif FROM media ORDER BY rowid')).rows;
    const stored = Object.fromEntries(rows.map((r) => [String(r.sha256), JSON.parse(String(r.exif))]));
    expect(stored[await sha256Hex(FIXTURE)]).toMatchObject({ takenAt: '2026-09-20T04:45:00.000Z', hadOffset: true });
    expect(stored[await sha256Hex(text('no-exif'))]).toEqual({ gps: null, takenAt: null, hadOffset: false });
  });

  it('the second capture from the device gets the first as previousEvent; the first has none', async () => {
    const first = await form({ photos: [text('1')], seq: 1, prevEventHash: 'genesis', capturedAt: '2026-09-20T04:30:00.000Z' });
    await run(first.fd);
    expect(lastCall()[1].previousEvent).toBeNull();

    const second = await form({ photos: [text('2')], seq: 2, prevEventHash: await sha256Hex(first.signed), capturedAt: '2026-09-20T04:46:00.000Z' });
    expect((await run(second.fd)).at(-1)).toMatchObject({ t: 'verdict' });
    expect(lastCall()[1].previousEvent).toEqual({ lat: P01_INSIDE.lat, lng: P01_INSIDE.lng, capturedAt: '2026-09-20T04:30:00.000Z' });
  });

  it('a boundary-rejected event is never previousEvent', async () => {
    const first = await form({ photos: [text('1')], seq: 1, prevEventHash: 'genesis', capturedAt: '2026-09-20T04:30:00.000Z' });
    await run(first.fd);

    // Signed by this device (so the rejection is attributed to it), later and elsewhere, but the
    // uploaded bytes differ from the signed hash: refused at the boundary with seq 2 on record.
    const bad = await form({ photos: [text('bad')], seq: 2, prevEventHash: await sha256Hex(first.signed), capturedAt: '2026-09-20T04:40:00.000Z', gps: { lat: 12.43, lng: 75.75 } });
    bad.fd.set('photo0', new File([text('swapped')], 'p0.jpg', { type: 'image/jpeg' }));
    expect(await run(bad.fd)).toEqual([{ t: 'rejected', reason: 'media_hash_mismatch', status: 409 }]);
    const rejected = (await t.client.execute(`SELECT device_id, seq FROM harvest_events WHERE boundary_status = 'rejected'`)).rows[0]!;
    expect(rejected).toMatchObject({ device_id: world.deviceId, seq: 2 });

    const next = await form({ photos: [text('3')], seq: 2, prevEventHash: await sha256Hex(first.signed), capturedAt: '2026-09-20T04:46:00.000Z' });
    expect((await run(next.fd)).at(-1)).toMatchObject({ t: 'verdict' });
    expect(lastCall()[1].previousEvent).toEqual({ lat: P01_INSIDE.lat, lng: P01_INSIDE.lng, capturedAt: '2026-09-20T04:30:00.000Z' });
  });
});
