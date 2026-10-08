import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { fakeJpeg } from '../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../crypto';
import { localMediaStore } from '../media/store';
import type { CapturePayloadV1 } from '../verification/types';
import type { CaptureEvent } from './pipeline';

// TKT-19 carry-forward (photo_uniqueness race): two captures carrying the same new photo, both past
// context building before either commits, must not both be accepted as "new". The seen-photo set is
// re-read inside the write transaction and the check re-run there.

let t: TempDb;
let dev: TestDevice;
let world: TracerWorld;

beforeEach(async () => {
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk });
  vi.resetModules();
});
afterEach(async () => {
  vi.doUnmock('./context');
  await t.cleanup();
});

async function form(photo: Uint8Array<ArrayBuffer>, seq: number) {
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: world.plotId,
    deviceId: world.deviceId,
    seq,
    prevEventHash: 'genesis',
    capturedAt: '2026-10-14T04:12:33.120Z',
    gps: { ...P01_INSIDE, accuracyM: 8 },
    cherryKg: 20,
    media: [{ sha256: await sha256Hex(photo), size: photo.length, mime: 'image/jpeg' }],
  };
  const s = jcs(payload);
  const fd = new FormData();
  fd.set('payload', s);
  fd.set('signature', await sign(dev.pair.privateKey, s));
  fd.set('photo0', new File([photo], 'p.jpg', { type: 'image/jpeg' }));
  return fd;
}

describe('photo_uniqueness under concurrency', () => {
  it('A and B carry the same new photo; B commits while A is verifying → A is Rejected by photo_uniqueness', async () => {
    // A pauses right after its context was built (it saw the photo as new) until B has committed.
    let aBuilt!: () => void;
    const aHasContext = new Promise<void>((r) => (aBuilt = r));
    let resumeA!: () => void;
    const aMayContinue = new Promise<void>((r) => (resumeA = r));
    let calls = 0;
    vi.doMock('./context', async (importOriginal) => {
      const real = await importOriginal<typeof import('./context')>();
      return {
        ...real,
        buildContext: async (...args: Parameters<typeof real.buildContext>) => {
          const ctx = await real.buildContext(...args);
          if (calls++ === 0) {
            aBuilt();
            await aMayContinue;
          }
          return ctx;
        },
      };
    });
    const { runCapture } = await import('./pipeline');
    const deps = { db: t.db, media: localMediaStore(t.dir), agentId: world.agentId, now: () => new Date('2026-10-14T04:12:34.000Z') };

    const shared = fakeJpeg('the same new photo');
    const aEvents: CaptureEvent[] = [];
    const aRun = runCapture(await form(shared, 1), deps, (e) => aEvents.push(e));
    await aHasContext;

    const bEvents: CaptureEvent[] = [];
    await runCapture(await form(shared, 2), deps, (e) => bEvents.push(e));
    const b = bEvents.at(-1)!;
    expect(b).toMatchObject({ t: 'verdict' });
    expect(b.t === 'verdict' && b.checks.find((c) => c.id === 'photo_uniqueness')).toMatchObject({ status: 'ok' });

    resumeA();
    await aRun;
    const a = aEvents.at(-1)!;
    expect(a).toMatchObject({ t: 'verdict', verdict: 'Rejected' });
    expect(a.t === 'verdict' && a.checks.find((c) => c.id === 'photo_uniqueness')).toEqual({ id: 'photo_uniqueness', status: 'fail', evidence: '1 of 1 photos seen before', hardFail: true });

    // What was committed is what was streamed.
    const rows = (await t.client.execute(`SELECT e.seq, e.final_verdict, r.verdict, r.checks FROM harvest_events e JOIN verification_runs r ON r.event_id = e.id ORDER BY e.seq`)).rows;
    expect(rows.map((r) => [r.seq, r.final_verdict])).toEqual([
      [1, 'Rejected'],
      [2, b.t === 'verdict' ? b.verdict : null],
    ]);
    const aChecks = JSON.parse(String(rows[0]!.checks)) as { id: string; status: string; hardFail: boolean }[];
    expect(aChecks.find((c) => c.id === 'photo_uniqueness')).toMatchObject({ status: 'fail', hardFail: true });
    const [entry] = (await t.client.execute(`SELECT payload FROM ledger_entries WHERE kind = 'verification_run' AND json_extract(payload, '$.eventId') = (SELECT id FROM harvest_events WHERE seq = 1)`)).rows;
    expect(JSON.parse(String(entry!.payload))).toMatchObject({ verdict: 'Rejected' });
  });
});
