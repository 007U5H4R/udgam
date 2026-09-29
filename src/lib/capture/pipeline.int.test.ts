import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../../scripts/tracer-world';
import { fakeJpeg } from '../../../tests/helpers/capture';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { makeDevice, type TestDevice } from '../../../tests/helpers/verify';
import { jcs, sha256Hex, sign } from '../crypto';
import { append } from '../ledger/hashchain';
import { verifyChain } from '../ledger/hashchain';
import { localMediaStore } from '../media/store';
import { REGISTRY } from '../verification/registry';
import type { CapturePayloadV1 } from '../verification/types';
import { runCapture, type CaptureDeps, type CaptureEvent } from './pipeline';

// TC-010 (a), EVAL-067 (atomic capture), EVAL-053 (tamper → 4xx), EVAL-001/030 end to end.
let t: TempDb;
let dev: TestDevice;
let world: TracerWorld;
const SEED_ENTRIES = 2; // plot_registered + device_enrolled

beforeEach(async () => {
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk });
});
afterEach(async () => {
  await t.cleanup();
});

const photo = (label: string) => fakeJpeg(label);
/** One `check` line per registered check (the registry grows by ticket), then `last`. */
const streamOf = (last: string) => [...REGISTRY.map(() => 'check'), last];

async function form(opts: { photos?: Uint8Array<ArrayBuffer>[]; seq?: number; prevEventHash?: string; mutate?: (p: CapturePayloadV1) => CapturePayloadV1 } = {}) {
  const photos = opts.photos ?? [photo('a')];
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: world.plotId,
    deviceId: world.deviceId,
    seq: opts.seq ?? 1,
    prevEventHash: opts.prevEventHash ?? 'genesis',
    capturedAt: '2026-10-14T04:12:33.120Z',
    gps: { ...P01_INSIDE, accuracyM: 8 },
    cherryKg: 42.5,
    media: await Promise.all(photos.map(async (b) => ({ sha256: await sha256Hex(b), size: b.length, mime: 'image/jpeg' }))),
  };
  const signed = jcs(payload);
  const signature = await sign(dev.pair.privateKey, signed);
  const sent = opts.mutate ? jcs(opts.mutate(payload)) : signed;
  const fd = new FormData();
  fd.set('payload', sent);
  fd.set('signature', signature);
  photos.forEach((b, i) => fd.set(`photo${i}`, new File([b], `p${i}.jpg`, { type: 'image/jpeg' })));
  return { fd, signed, payload };
}

function deps(over: Partial<CaptureDeps> = {}): CaptureDeps {
  return { db: t.db, media: localMediaStore(t.dir), agentId: world.agentId, now: () => new Date('2026-10-14T04:12:34.000Z'), ...over };
}

async function run(fd: FormData, d = deps()) {
  const events: CaptureEvent[] = [];
  await runCapture(fd, d, (e) => events.push(e));
  return events;
}

async function count(table: string) {
  return Number((await t.client.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0]?.n);
}

describe('runCapture happy path', () => {
  it('EVAL-001 streams each check, then the verdict after COMMIT, with two new ledger entries', async () => {
    const { fd, signed } = await form({ photos: [photo('a'), photo('b')] });
    const seenAtVerdict: number[] = [];
    const events: CaptureEvent[] = [];
    await runCapture(fd, deps(), (e) => {
      events.push(e);
      if (e.t === 'verdict') void count('verification_runs').then((n) => seenAtVerdict.push(n));
    });
    expect(events.map((e) => e.t)).toEqual(streamOf('verdict'));
    const last = events.at(-1)!;
    expect(last).toMatchObject({ t: 'verdict', verdict: 'Verified' });
    expect(last.t === 'verdict' && last.checks.map((c) => c.id)).toEqual(REGISTRY.map((c) => c.id));
    expect(last.t === 'verdict' && last.checks.every((c) => c.evidence.length > 0)).toBe(true);

    await new Promise((r) => setTimeout(r, 20));
    expect(seenAtVerdict).toEqual([1]); // committed and visible to another connection when the verdict went out

    expect(await count('harvest_events')).toBe(1);
    expect(await count('media')).toBe(2);
    expect(await count('verification_runs')).toBe(1);
    const ledger = await t.client.execute('SELECT seq, kind FROM ledger_entries ORDER BY seq');
    expect(ledger.rows.map((r) => r.kind)).toEqual(['plot_registered', 'device_enrolled', 'harvest_event', 'verification_run']);

    const ev = (await t.client.execute('SELECT * FROM harvest_events')).rows[0]!;
    expect(ev.payload).toBe(signed); // the exact signed string
    expect(ev.payload_hash).toBe(await sha256Hex(signed));
    expect(ev.boundary_status).toBe('accepted');
    expect(ev.final_verdict).toBe('Verified'); // set by the trigger
    expect(ev.anchor_seq).toBe(SEED_ENTRIES + 1);
    const vr = (await t.client.execute('SELECT anchor_seq, run_no, config_version FROM verification_runs')).rows[0]!;
    expect(vr).toMatchObject({ anchor_seq: SEED_ENTRIES + 2, run_no: 1, config_version: 'cfg-1' });
    const dv = (await t.client.execute(`SELECT last_seq, last_event_hash FROM devices WHERE id = '${world.deviceId}'`)).rows[0]!;
    expect(dv).toMatchObject({ last_seq: 1, last_event_hash: await sha256Hex(signed) });

    const files = (await t.client.execute('SELECT path FROM media')).rows.map((r) => String(r.path));
    for (const f of files) expect(existsSync(join(t.dir, f))).toBe(true);
    expect(await verifyChain(t.db)).toEqual({ ok: true });
  });

  it('EVAL-030 the same photo bytes on a later capture are stored but Rejected by photo_uniqueness', async () => {
    const first = await form({ photos: [photo('a')] });
    await run(first.fd);
    const second = await form({ photos: [photo('a')], seq: 2, prevEventHash: await sha256Hex(first.signed) });
    const events = await run(second.fd);
    const verdict = events.at(-1)!;
    expect(verdict).toMatchObject({ t: 'verdict', verdict: 'Rejected' });
    expect(verdict.t === 'verdict' && verdict.checks.find((c) => c.id === 'photo_uniqueness')).toMatchObject({
      status: 'fail',
      evidence: '1 of 1 photos seen before',
    });
    expect(await count('media')).toBe(2); // the rejected replay keeps its row (§4.1)
    expect((await t.client.execute(`SELECT final_verdict FROM harvest_events WHERE seq = 2`)).rows[0]?.final_verdict).toBe('Rejected');
  });

  it('TASK-11 fix round 1: the verdict line names the hard fail per check and the score caps (additive fields), on a replay too', async () => {
    const first = await form({ photos: [photo('h')] });
    const accepted = (await run(first.fd)).at(-1)!;
    expect(accepted.t === 'verdict' && accepted.checks.every((c) => c.hardFail === false)).toBe(true);
    expect(accepted.t === 'verdict' && accepted.capReasons).toEqual([]);
    const second = await form({ photos: [photo('h')], seq: 2, prevEventHash: await sha256Hex(first.signed) });
    const rejected = (await run(second.fd)).at(-1)!;
    expect(rejected).toMatchObject({ t: 'verdict', verdict: 'Rejected' });
    expect(rejected.t === 'verdict' && rejected.checks.filter((c) => c.hardFail).map((c) => c.id)).toEqual(['photo_uniqueness']);
    expect(rejected.t === 'verdict' && rejected.capReasons).toEqual(['anyFail']);
    // the identical signed bytes again: the original line, with the same fields
    const again = await form({ photos: [photo('h')], seq: 2 });
    again.fd.set('payload', second.fd.get('payload') as string);
    again.fd.set('signature', second.fd.get('signature') as string);
    expect(await run(again.fd)).toEqual([{ ...rejected, idempotent: true }]);
  });

  it('TP10: a stale entry replayed out of order is flagged by chain_continuity and never rewinds the phone’s chain head', async () => {
    const first = await form({ photos: [photo('c1')] });
    await run(first.fd);
    const h1 = await sha256Hex(first.signed);
    const second = await form({ photos: [photo('c2')], seq: 2, prevEventHash: h1 });
    const ok = (await run(second.fd)).at(-1)!;
    expect(ok.t === 'verdict' && ok.checks.find((c) => c.id === 'chain_continuity')).toMatchObject({ status: 'ok', evidence: 'Entry 2 follows entry 1 from this phone' });
    const head = { last_seq: 2, last_event_hash: await sha256Hex(second.signed) };

    const stale = await form({ photos: [photo('c3')], seq: 1, prevEventHash: 'genesis' });
    const flagged = (await run(stale.fd)).at(-1)!;
    expect(flagged.t === 'verdict' && flagged.checks.find((c) => c.id === 'chain_continuity')).toMatchObject({
      status: 'flag',
      evidence: `Expected entry 3 after ${head.last_event_hash.slice(0, 8)}, got entry 1`,
    });
    expect((await t.client.execute(`SELECT last_seq, last_event_hash FROM devices WHERE id = '${world.deviceId}'`)).rows[0]).toMatchObject(head);
  });

  it('answers a retried, already-accepted payload with its original verdict and writes nothing', async () => {
    const f = await form();
    const firstEvents = await run(f.fd);
    // A retry re-sends the identical payload, signature and photos (ECDSA signatures are randomised,
    // so copy the originals rather than re-signing).
    const again = await form();
    again.fd.set('payload', f.fd.get('payload') as string);
    again.fd.set('signature', f.fd.get('signature') as string);
    const events = await run(again.fd);
    const orig = firstEvents.at(-1)!;
    expect(events).toEqual([{ ...orig, idempotent: true }]);
    expect(await count('harvest_events')).toBe(1);
    expect(await count('ledger_entries')).toBe(SEED_ENTRIES + 2);
  });
});

describe('boundary rejections are anchored (§3.1 step 2), except garbled payloads (TSK-19.4)', () => {
  it('EVAL-053 cherryKg tampered after signing → 401 bad_signature, anchored as a rejected event, no media', async () => {
    const { fd } = await form({ mutate: (p) => ({ ...p, cherryKg: 142.5 }) });
    const events = await run(fd);
    expect(events).toEqual([{ t: 'rejected', reason: 'bad_signature', status: 401 }]);
    const ev = (await t.client.execute('SELECT * FROM harvest_events')).rows[0]!;
    expect(ev).toMatchObject({ boundary_status: 'rejected', boundary_reason: 'bad_signature', device_id: null, cherry_kg: 142.5 });
    const entry = (await t.client.execute(`SELECT kind, payload FROM ledger_entries WHERE seq = ${Number(ev.anchor_seq)}`)).rows[0]!;
    expect(entry.kind).toBe('harvest_event');
    expect(JSON.parse(String(entry.payload))).toMatchObject({ boundaryStatus: 'rejected', boundaryReason: 'bad_signature' });
    expect(await count('media')).toBe(0);
    expect(await count('verification_runs')).toBe(0);
    expect(existsSync(join(t.dir, 'media'))).toBe(false);
  });

  it('a non-canonical payload is refused with 400 however often it is resent, and never anchored', async () => {
    const { fd, payload } = await form();
    fd.set('payload', JSON.stringify(payload, null, 2));
    expect(await run(fd)).toEqual([{ t: 'rejected', reason: 'non_canonical', status: 400 }]);
    expect(await run(fd)).toEqual([{ t: 'rejected', reason: 'non_canonical', status: 400 }]);
    expect(await count('harvest_events')).toBe(0);
    expect(await count('ledger_entries')).toBe(SEED_ENTRIES);
  });

  it('uploaded bytes that differ from the signed hashes → 409; the same bad resend gets the same answer, the signed bytes are accepted (TKT-09)', async () => {
    const f = await form({ photos: [photo('a')] });
    const good = f.fd.get('photo0') as File;
    f.fd.set('photo0', new File([photo('not-a')], 'p0.jpg', { type: 'image/jpeg' }));
    expect(await run(f.fd)).toEqual([{ t: 'rejected', reason: 'media_hash_mismatch', status: 409 }]);
    expect((await t.client.execute('SELECT device_id FROM harvest_events')).rows[0]?.device_id).toBe(world.deviceId);
    const [first] = (await t.client.execute('SELECT id FROM harvest_events')).rows;
    expect(await run(f.fd)).toEqual([{ t: 'rejected', reason: 'media_hash_mismatch', status: 409, eventId: String(first!.id), idempotent: true }]);
    expect(await count('harvest_events')).toBe(1); // the same refusal is anchored once
    expect(await count('media')).toBe(0);
    // A stored refusal is not sticky: only an accepted payload short-circuits (TP7 as refined, EXE).
    f.fd.set('photo0', good);
    expect((await run(f.fd)).at(-1)).toMatchObject({ t: 'verdict', verdict: 'Verified' });
    expect(await count('harvest_events')).toBe(2);
    expect(await count('media')).toBe(1);
  });

  it('a signed size that differs from the uploaded byte length → 409 media_hash_mismatch, anchored, nothing stored', async () => {
    const f = await form({ photos: [photo('sized')] });
    const wrong = { ...f.payload, media: f.payload.media.map((m) => ({ ...m, size: m.size + 7 })) };
    const s = jcs(wrong);
    f.fd.set('payload', s);
    f.fd.set('signature', await sign(dev.pair.privateKey, s));
    expect(await run(f.fd)).toEqual([{ t: 'rejected', reason: 'media_hash_mismatch', status: 409 }]);
    const ev = (await t.client.execute('SELECT boundary_status, boundary_reason, anchor_seq FROM harvest_events')).rows[0]!;
    expect(ev).toMatchObject({ boundary_status: 'rejected', boundary_reason: 'media_hash_mismatch' });
    expect(Number(ev.anchor_seq)).toBe(SEED_ENTRIES + 1);
    expect(await count('media')).toBe(0);
  });

  it('a capture for an unknown plot is refused with 403 plot_not_assigned', async () => {
    const f = await form();
    const payload = { ...f.payload, plotId: 'PL-NOPE0000' };
    const s = jcs(payload);
    f.fd.set('payload', s);
    f.fd.set('signature', await sign(dev.pair.privateKey, s));
    expect(await run(f.fd)).toEqual([{ t: 'rejected', reason: 'plot_not_assigned', status: 403 }]);
    expect((await t.client.execute('SELECT device_id FROM harvest_events')).rows[0]?.device_id).toBe(world.deviceId);
  });

  it('a malformed form (no signature) is refused with 400 and nothing is written', async () => {
    const fd = new FormData();
    fd.set('payload', '{}');
    expect(await run(fd)).toEqual([{ t: 'rejected', reason: 'bad_form', status: 400 }]);
    expect(await count('harvest_events')).toBe(0);
  });
});

describe('the device must belong to the signed-in agent (technical-plan §10, EVAL-080)', () => {
  it("another agent sending this agent's signed capture → 403 device_not_owned, nothing written or anchored", async () => {
    const { fd } = await form();
    const entries = await count('ledger_entries');
    expect(await run(fd, deps({ agentId: 'AG-SOMEONE' }))).toEqual([{ t: 'rejected', reason: 'device_not_owned', status: 403 }]);
    expect(await count('harvest_events')).toBe(0);
    expect(await count('ledger_entries')).toBe(entries);
    expect(existsSync(join(t.dir, 'media'))).toBe(false);
    // …so the owner's own upload of the same payload is still accepted
    expect((await run(fd)).at(-1)).toMatchObject({ t: 'verdict', verdict: 'Verified' });
  });

  it("is checked before the idempotent replay: another agent's resend never gets the recorded verdict", async () => {
    const { fd } = await form();
    expect((await run(fd)).at(-1)).toMatchObject({ t: 'verdict' });
    expect(await run(fd, deps({ agentId: 'AG-SOMEONE' }))).toEqual([{ t: 'rejected', reason: 'device_not_owned', status: 403 }]);
    expect((await run(fd)).at(-1)).toMatchObject({ t: 'verdict', idempotent: true });
  });

  it("is checked before a signed rejection is anchored against another agent's phone", async () => {
    const f = await form({ photos: [photo('a')] });
    f.fd.set('photo0', new File([photo('not-a')], 'p0.jpg', { type: 'image/jpeg' }));
    expect(await run(f.fd, deps({ agentId: 'AG-SOMEONE' }))).toEqual([{ t: 'rejected', reason: 'device_not_owned', status: 403 }]);
    expect(await count('harvest_events')).toBe(0);
  });
});

describe('delivery failures never change what was committed', () => {
  it('an emit that throws after COMMIT (client gone) is not logged as a failed capture and runCapture resolves', async () => {
    const error = vi.fn();
    const warn = vi.fn();
    const { fd } = await form();
    const lines: string[] = [];
    await expect(
      runCapture(fd, deps({ log: { error, warn, info: vi.fn() } }), (e) => {
        lines.push(e.t);
        if (e.t === 'verdict' || e.t === 'error') throw new TypeError('Invalid state: Controller is already closed');
      }),
    ).resolves.toBeUndefined();
    expect(lines).toEqual(streamOf('verdict'));
    expect(await count('verification_runs')).toBe(1);
    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ errClass: 'TypeError' }), 'capture.emit_failed');
  });

  it('logs, and does not swallow, a media cleanup that fails', async () => {
    const error = vi.fn();
    const real = localMediaStore(t.dir);
    const brokenCleanup: CaptureDeps['media'] = {
      ...real,
      put: real.put,
      release: real.release,
      remove: real.remove,
      removeIfUnused: () => Promise.reject(new Error('EACCES')),
    };
    const failing: CaptureDeps['append'] = async (tx, kind, payload) => {
      if (kind === 'verification_run') throw new Error('injected ledger failure');
      return append(tx, kind, payload);
    };
    const { fd } = await form({ photos: [photo('cleanup')] });
    const events = await run(fd, deps({ media: brokenCleanup, append: failing, log: { error, warn: vi.fn(), info: vi.fn() } }));
    expect(events.at(-1)).toEqual({ t: 'error', retryable: true });
    expect(error).toHaveBeenCalledWith({ errClass: 'Error' }, 'capture.media_cleanup_failed');
    expect(error).toHaveBeenCalledWith({ errClass: 'Error' }, 'capture.failed');
    expect(JSON.stringify(error.mock.calls)).not.toContain('EACCES'); // class only, no message or path
  });
});

describe('the capture transaction is atomic (TC-010 a, EVAL-067, CF-08, N7)', () => {
  it('EVAL-067 a ledger append failure on the verification_run entry rolls everything back and removes the new media files', async () => {
    const failing: CaptureDeps['append'] = async (tx, kind, payload) => {
      if (kind === 'verification_run') throw new Error('injected ledger failure');
      return append(tx, kind, payload);
    };
    const { fd } = await form({ photos: [photo('x'), photo('y')] });
    const events = await run(fd, deps({ append: failing }));
    expect(events.map((e) => e.t)).toEqual(streamOf('error'));
    expect(events.at(-1)).toEqual({ t: 'error', retryable: true });
    expect(await count('harvest_events')).toBe(0);
    expect(await count('media')).toBe(0);
    expect(await count('verification_runs')).toBe(0);
    expect(await count('ledger_entries')).toBe(SEED_ENTRIES);
    const shas = await Promise.all([photo('x'), photo('y')].map((b) => sha256Hex(b)));
    for (const s of shas) expect(existsSync(join(t.dir, 'media', s.slice(0, 2), `${s}.jpg`))).toBe(false);
    expect((await t.client.execute(`SELECT last_seq FROM devices WHERE id = '${world.deviceId}'`)).rows[0]?.last_seq).toBe(0);

    // the same capture succeeds on retry
    const retry = await run(fd);
    expect(retry.at(-1)).toMatchObject({ t: 'verdict', verdict: 'Verified' });
  });

  it('interleaving: A stores X, B finds X and commits, A fails — X must survive A’s cleanup', async () => {
    const shared = photo('interleaved');
    const sha = await sha256Hex(shared);
    const file = join(t.dir, 'media', sha.slice(0, 2), `${sha}.jpg`);

    // A pauses right after storing X (it created the file), then fails inside its transaction.
    let aStored!: () => void;
    const aHasStored = new Promise<void>((r) => (aStored = r));
    let resumeA!: () => void;
    const aMayContinue = new Promise<void>((r) => (resumeA = r));
    const real = localMediaStore(t.dir);
    const pausingStore: CaptureDeps['media'] = {
      ...real,
      put: async (...args) => {
        const r = await real.put(...args);
        expect(r.created).toBe(true);
        aStored();
        await aMayContinue;
        return r;
      },
      release: real.release,
      removeIfUnused: real.removeIfUnused,
      remove: real.remove,
    };
    const failing: CaptureDeps['append'] = async (tx, kind, payload) => {
      if (kind === 'verification_run') throw new Error('injected ledger failure');
      return append(tx, kind, payload);
    };
    const a = await form({ photos: [shared] });
    const aEvents: CaptureEvent[] = [];
    const aRun = runCapture(a.fd, deps({ media: pausingStore, append: failing }), (e) => aEvents.push(e));
    await aHasStored;

    // B carries the same photo on a different payload: it finds X already on disk and commits.
    const b = await form({ photos: [shared], seq: 2 });
    const bEvents = await run(b.fd);
    expect(bEvents.at(-1)).toMatchObject({ t: 'verdict' });

    resumeA();
    await aRun;
    expect(aEvents.at(-1)).toEqual({ t: 'error', retryable: true });
    expect(existsSync(file)).toBe(true); // B's committed media row still has its photo
    expect((await t.client.execute('SELECT path FROM media')).rows.map((r) => String(r.path))).toEqual([
      `media/${sha.slice(0, 2)}/${sha}.jpg`,
    ]);
  });

  it('keeps a media file that an earlier event already stored when the transaction fails', async () => {
    const first = await form({ photos: [photo('shared')] });
    await run(first.fd);
    const failing: CaptureDeps['append'] = async (tx, kind, payload) => {
      if (kind === 'verification_run') throw new Error('injected ledger failure');
      return append(tx, kind, payload);
    };
    const second = await form({ photos: [photo('shared')], seq: 2, prevEventHash: await sha256Hex(first.signed) });
    expect((await run(second.fd, deps({ append: failing }))).at(-1)).toEqual({ t: 'error', retryable: true });
    const path = String((await t.client.execute('SELECT path FROM media')).rows[0]?.path);
    expect(existsSync(join(t.dir, path))).toBe(true);
  });
});
