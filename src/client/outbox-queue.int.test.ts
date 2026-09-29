import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../scripts/tracer-world';
import { fakeJpeg } from '../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../tests/helpers/verify';
import { runCapture, type CaptureEvent } from '../lib/capture/pipeline';
import { sha256Hex } from '../lib/crypto';
import { refusalKeepsOutbox } from '../lib/i18n/farmer-evidence';
import { localMediaStore } from '../lib/media/store';
import { finishAnswered, sendPending, submitCapture, type Photo } from './capture-client';
import { listOutbox, loadSigner } from './capture-store';
import { saveEnrolment } from './device-key';
import type { GpsWatch } from './gps';

// TKT-11 (§9): two pickings saved offline are signed with the SAME seq, because the phone's chain head
// moves on only when the server has an event. The queue sends them oldest first, one at a time, as the
// identical signed copies (never re-signed). The server takes both; the second to arrive does not follow
// the first in this phone's chain, so chain_continuity flags it (its verdict is whatever cfg-1 scores:
// see below). Here the phone and the real capture pipeline meet in-process: the phone's fetch runs
// runCapture on the server's database.

let t: TempDb;
let dev: TestDevice;
let world: TracerWorld;

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory(); // a fresh phone per test
  await finishAnswered();
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk });
  await saveEnrolment(dev.pair, { deviceId: world.deviceId, nextSeq: 1, lastEventHash: 'genesis' });
});
afterEach(async () => {
  await t.cleanup();
});

const gps: GpsWatch = {
  best: () => ({ ...P01_INSIDE, accuracyM: 8, at: Date.now() }),
  waitForFresh: async () => null,
  onChange: () => () => undefined,
  stop: () => undefined,
  state: () => 'ok',
};

async function photo(label: string): Promise<Photo> {
  const bytes = fakeJpeg(label);
  return { file: new Blob([bytes], { type: 'image/jpeg' }), sha256: await sha256Hex(bytes), size: bytes.length, mime: 'image/jpeg' };
}

const offline = async (): Promise<Response> => {
  throw new TypeError('Failed to fetch');
};

/** The phone's fetch answered by the real capture pipeline, as the route streams it (NDJSON). */
async function server(_url: string, init?: RequestInit): Promise<Response> {
  const lines: CaptureEvent[] = [];
  await runCapture(init!.body as FormData, { db: t.db, media: localMediaStore(t.dir), agentId: world.agentId }, (e) => lines.push(e));
  const last = lines.at(-1)!;
  const status = last.t === 'rejected' ? last.status : 200;
  return new Response(lines.map((l) => `${JSON.stringify(l)}\n`).join(''), { status });
}

describe('sendPending: two offline pickings with one seq (TKT-11)', () => {
  it('both are saved with seq 1; the queue sends them oldest first; the second is flagged by chain_continuity; the chain head follows the first', async () => {
    const minutes = (m: number) => () => new Date(Date.now() - m * 60_000);
    const a = await submitCapture({ plotId: world.plotId, cherryKg: 42.5, photos: [await photo('a')], gps }, { fetchImpl: offline, now: minutes(20) });
    const b = await submitCapture({ plotId: world.plotId, cherryKg: 38, photos: [await photo('b')], gps }, { fetchImpl: offline, now: minutes(5) });
    expect([a.kind, b.kind]).toEqual(['retryable', 'retryable']);
    const saved = await listOutbox();
    expect(saved.map((i) => JSON.parse(i.payload) as { seq: number; prevEventHash: string; cherryKg: number })).toEqual([
      expect.objectContaining({ seq: 1, prevEventHash: 'genesis', cherryKg: 42.5 }),
      expect.objectContaining({ seq: 1, prevEventHash: 'genesis', cherryKg: 38 }),
    ]);

    const sent: string[] = [];
    const results = await sendPending({
      keepOnRefusal: refusalKeepsOutbox,
      fetchImpl: async (url, init) => {
        sent.push((init!.body as FormData).get('payload') as string);
        return server(url, init);
      },
    });
    // oldest first, the identical signed strings
    expect(sent).toEqual(saved.map((i) => i.payload));
    expect(results.map((r) => r.id)).toEqual(saved.map((i) => i.id));
    const [first, second] = results.map((r) => r.result);
    expect(first).toMatchObject({ kind: 'verdict', verdict: { verdict: 'Verified' } });
    const chainOf = (r: typeof first) => (r?.kind === 'verdict' ? r.verdict.checks.find((c) => c.id === 'chain_continuity') : undefined);
    expect(chainOf(first)).toMatchObject({ status: 'ok', evidence: 'Entry 1 follows entry 0 from this phone' });
    const h1 = await sha256Hex(saved[0]!.payload);
    expect(chainOf(second)).toMatchObject({ status: 'flag', evidence: `Expected entry 2 after ${h1.slice(0, 8)}, got entry 1` });
    // cfg-1 (fixed, EV13): a flag scores 0.5 and chain_continuity is not a flag cap (only
    // deforestation_overlap and yield_plausibility are). These test photos carry no EXIF, so both
    // pickings have their two EXIF checks flagged; the second adds the chain flag. Twelve equal weights:
    // (10 + 2 × 0.5) / 12 = 91.7 and (9 + 3 × 0.5) / 12 = 87.5, both at or above verifiedMin 80, so the
    // second picking stays Verified with its chain check flagged for the office to see.
    const notOk = (r: typeof first) => (r?.kind === 'verdict' ? r.verdict.checks.filter((c) => c.status !== 'ok').map((c) => `${c.id}:${c.status}`).sort() : []);
    expect(notOk(first)).toEqual(['exif_gps_agreement:flag', 'exif_time_agreement:flag']);
    expect(notOk(second)).toEqual(['chain_continuity:flag', 'exif_gps_agreement:flag', 'exif_time_agreement:flag']);
    expect(first).toMatchObject({ kind: 'verdict', verdict: { verdict: 'Verified', score: 91.7 } });
    expect(second).toMatchObject({ kind: 'verdict', verdict: { verdict: 'Verified', score: 87.5 } });

    expect(await listOutbox()).toEqual([]);
    expect(await loadSigner()).toMatchObject({ nextSeq: 2, lastEventHash: h1 });
    expect(Number((await t.client.execute('SELECT COUNT(*) AS n FROM harvest_events WHERE boundary_status = ?', ['accepted'])).rows[0]!.n)).toBe(2);
  });

  it('stops at the first copy that stays on the phone and keeps the rest in order; a later run sends them', async () => {
    await submitCapture({ plotId: world.plotId, cherryKg: 10, photos: [await photo('c')], gps }, { fetchImpl: offline });
    await submitCapture({ plotId: world.plotId, cherryKg: 11, photos: [await photo('d')], gps }, { fetchImpl: offline });
    let calls = 0;
    const down = await sendPending({
      fetchImpl: async () => {
        calls += 1;
        return new Response('<html>Bad gateway</html>', { status: 502 });
      },
    });
    expect(calls).toBe(1);
    expect(down.map((r) => r.result)).toEqual([{ kind: 'retryable', cause: 'server' }]);
    expect((await listOutbox()).map((i) => [i.cherryKg, i.attempts])).toEqual([
      [10, 2],
      [11, 1],
    ]);
    const up = await sendPending({ fetchImpl: server });
    expect(up.map((r) => r.result.kind)).toEqual(['verdict', 'verdict']);
    expect(await listOutbox()).toEqual([]);
  });
});
