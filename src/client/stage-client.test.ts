import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureForm, sendCapture } from './capture-client';
import { abortStaging, forgetStaged, MAX_STAGING_IN_FLIGHT, resetStagingForTests, stagedHashes, stageEndMark, stagePhoto, stageStartMark, STAGED_TRUST_MS } from './stage-client';

// TSK-30.4 / TSK-30.5 (TC-094 d–e, client half): photos are staged in the background, at most two at a
// time with no retry loop; Submit names staged photos by hash and sends only the rest; a 409
// media_not_staged makes the phone send the same signed capture once more with every photo's bytes.

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const payload = JSON.stringify({ v: 1, media: [A, B, C].map((sha256) => ({ sha256, size: 1, mime: 'image/jpeg' })) });
const files = [new Blob(['photo-a']), new Blob(['photo-b']), new Blob(['photo-c'])];
const capture = { payload, signature: 'sig', files };
const VERDICT = { t: 'verdict', eventId: 'HE-1', verdict: 'Verified', score: 100, checks: [] };
const ndjson = (...lines: object[]) => lines.map((l) => JSON.stringify(l) + '\n').join('');

const created = (sha256: string) => new Response(JSON.stringify({ sha256, expiresAt: '2026-10-14T05:00:00.000Z' }), { status: 201 });

beforeEach(() => {
  resetStagingForTests();
  performance.clearMarks();
});

describe('stagePhoto', () => {
  it('POSTs the raw photo with its type and the phone id; a 201 for that hash → staged, and Submit may name it', async () => {
    const fetchImpl = vi.fn(async () => created(A));
    expect(await stagePhoto(files[0]!, A, { mime: 'image/jpeg', deviceId: 'DV-7K2M9Q4D', fetchImpl })).toBe('staged');
    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('/api/capture/stage');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(files[0]);
    expect(init.headers).toEqual({ 'Content-Type': 'image/jpeg', 'X-Udgam-Device': 'DV-7K2M9Q4D' });
    expect(stagedHashes()).toEqual(new Set([A]));
    // staged already: not uploaded again
    expect(await stagePhoto(files[0]!, A, { deviceId: 'DV-7K2M9Q4D', fetchImpl })).toBe('staged');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('any other answer, a different hash, or no network → failed, with no retry; nothing is named at Submit', async () => {
    const answers = [
      async () => new Response('{"error":"too_many"}', { status: 429 }),
      async () => created(B),
      async () => {
        throw new TypeError('Failed to fetch');
      },
    ];
    for (const a of answers) {
      const fetchImpl = vi.fn(a);
      expect(await stagePhoto(files[0]!, A, { deviceId: 'DV-7K2M9Q4D', fetchImpl })).toBe('failed');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
    expect(stagedHashes()).toEqual(new Set());
  });

  it(`at most ${MAX_STAGING_IN_FLIGHT} uploads at a time`, async () => {
    let now = 0;
    let max = 0;
    const gates: (() => void)[] = [];
    const fetchImpl = async (_u: string, init?: RequestInit) => {
      now++;
      max = Math.max(max, now);
      await new Promise<void>((r) => gates.push(r));
      now--;
      return created(String(init?.body === files[0] ? A : init?.body === files[1] ? B : C));
    };
    const all = [stagePhoto(files[0]!, A, { deviceId: 'DV-1', fetchImpl }), stagePhoto(files[1]!, B, { deviceId: 'DV-1', fetchImpl }), stagePhoto(files[2]!, C, { deviceId: 'DV-1', fetchImpl })];
    await vi.waitFor(() => expect(gates.length).toBe(2));
    while (gates.length > 0 || now > 0) {
      gates.shift()?.();
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(await Promise.all(all)).toEqual(['staged', 'staged', 'staged']);
    expect(max).toBe(2);
  });

  it('TSK-30.5 marks udgam:stage-start:<slot> and udgam:stage-end:<slot> around the upload, in order', async () => {
    await stagePhoto(files[1]!, B, { slot: 1, deviceId: 'DV-1', fetchImpl: async () => created(B) });
    const start = performance.getEntriesByName(stageStartMark(1));
    const end = performance.getEntriesByName(stageEndMark(1));
    expect(start).toHaveLength(1);
    expect(end).toHaveLength(1);
    expect(end[0]!.startTime).toBeGreaterThanOrEqual(start[0]!.startTime);
    expect(stageStartMark(1)).toBe('udgam:stage-start:1');
  });

  it('a staged photo is trusted for less than the server keeps it, then sent as bytes again', async () => {
    let t = 1_000;
    await stagePhoto(files[0]!, A, { deviceId: 'DV-1', fetchImpl: async () => created(A), now: () => t });
    expect(stagedHashes(t)).toEqual(new Set([A]));
    t += STAGED_TRUST_MS + 1;
    expect(STAGED_TRUST_MS).toBeLessThan(60 * 60 * 1000);
    expect(stagedHashes(t)).toEqual(new Set());
  });
});

describe('Submit with staged photos (TC-094 d–e)', () => {
  it('names staged photos in `staged` and attaches only the others, in payload order', () => {
    const fd = captureForm(capture, new Set([A, C]));
    expect(JSON.parse(fd.get('staged') as string)).toEqual([A, C]);
    expect([...fd.keys()].filter((k) => k.startsWith('photo'))).toEqual(['photo0']);
    expect(fd.get('photo0')).toBeInstanceOf(Blob);
    expect(fd.get('payload')).toBe(payload); // the signed payload is unchanged
    const all = captureForm(capture, new Set([A, B, C]));
    expect([...all.keys()].filter((k) => k.startsWith('photo'))).toEqual([]);
    const none = captureForm(capture);
    expect(none.has('staged')).toBe(false);
    expect([...none.keys()].filter((k) => k.startsWith('photo'))).toEqual(['photo0', 'photo1', 'photo2']);
  });

  it('TC-094 (d) with every photo staged the capture request carries no photo bytes; the verdict forgets them', async () => {
    await Promise.all([A, B, C].map((h, i) => stagePhoto(files[i]!, h, { deviceId: 'DV-1', fetchImpl: async () => created(h) })));
    const bodies: FormData[] = [];
    const fetchImpl = vi.fn(async (_u: string, init?: RequestInit) => {
      bodies.push(init?.body as FormData);
      return new Response(ndjson(VERDICT), { status: 200 });
    });
    expect(await sendCapture(capture, { fetchImpl })).toMatchObject({ kind: 'verdict' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect([...bodies[0]!.keys()].filter((k) => k.startsWith('photo'))).toEqual([]);
    expect(stagedHashes()).toEqual(new Set());
  });

  it('TC-094 (e) a 409 media_not_staged → exactly one resend of the identical capture with every photo, then the verdict', async () => {
    const bodies: FormData[] = [];
    const fetchImpl = vi.fn(async (_u: string, init?: RequestInit) => {
      bodies.push(init?.body as FormData);
      return bodies.length === 1
        ? new Response(ndjson({ t: 'rejected', reason: 'media_not_staged', status: 409, missing: [A, B] }), { status: 409 })
        : new Response(ndjson(VERDICT), { status: 200 });
    });
    const r = await sendCapture(capture, { fetchImpl, staged: new Set([A, B]) });
    expect(r).toMatchObject({ kind: 'verdict' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(bodies[0]!.has('staged')).toBe(true);
    expect(bodies[1]!.has('staged')).toBe(false);
    expect([...bodies[1]!.keys()].filter((k) => k.startsWith('photo'))).toEqual(['photo0', 'photo1', 'photo2']);
    expect(bodies[1]!.get('payload')).toBe(bodies[0]!.get('payload'));
    expect(bodies[1]!.get('signature')).toBe('sig');
  });

  it('a 409 media_not_staged is never a refusal: if the resend cannot reach the server the copy stays (retryable)', async () => {
    let n = 0;
    const fetchImpl = async () => {
      n++;
      if (n === 1) return new Response(ndjson({ t: 'rejected', reason: 'media_not_staged', status: 409, missing: [A] }), { status: 409 });
      throw new TypeError('Failed to fetch');
    };
    expect(await sendCapture(capture, { fetchImpl, staged: new Set([A]) })).toEqual({ kind: 'retryable', cause: 'offline' });
    expect(n).toBe(2);
  });

  it('a 409 media_hash_mismatch with staged photos is the boundary refusal, not a resend', async () => {
    const fetchImpl = vi.fn(async () => new Response(ndjson({ t: 'rejected', reason: 'media_hash_mismatch', status: 409 }), { status: 409 }));
    expect(await sendCapture(capture, { fetchImpl, staged: new Set([A]) })).toEqual({ kind: 'rejected', reason: 'media_hash_mismatch' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('Send while stage uploads are in flight or queued aborts them and sends those photos inline, once (TKT-30 review #2)', async () => {
    const signals: AbortSignal[] = [];
    const stageFetch = vi.fn(
      (_u: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          signals.push(init!.signal!);
          init!.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    // three photos: two upload at once, the third waits in the queue
    const uploads = [A, B, C].map((h, i) => stagePhoto(files[i]!, h, { deviceId: 'DV-1', fetchImpl: stageFetch }));
    await vi.waitFor(() => expect(stageFetch).toHaveBeenCalledTimes(MAX_STAGING_IN_FLIGHT));
    const bodies: FormData[] = [];
    const captureFetch = vi.fn(async (_u: string, init?: RequestInit) => {
      bodies.push(init?.body as FormData);
      return new Response(ndjson(VERDICT), { status: 200 });
    });
    expect(await sendCapture(capture, { fetchImpl: captureFetch })).toMatchObject({ kind: 'verdict' });
    expect(await Promise.all(uploads)).toEqual(['failed', 'failed', 'failed']);
    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(stageFetch).toHaveBeenCalledTimes(MAX_STAGING_IN_FLIGHT); // the queued one never went up
    expect(bodies[0]!.has('staged')).toBe(false);
    expect([...bodies[0]!.keys()].filter((k) => k.startsWith('photo'))).toEqual(['photo0', 'photo1', 'photo2']);
  });

  it('abortStaging leaves photos already staged named by hash', async () => {
    await stagePhoto(files[0]!, A, { deviceId: 'DV-1', fetchImpl: async () => created(A) });
    abortStaging();
    expect(stagedHashes()).toEqual(new Set([A]));
  });

  it('nothing staged: one request with every photo, as before', async () => {
    forgetStaged([A, B, C]);
    const fetchImpl = vi.fn(async () => new Response(ndjson(VERDICT), { status: 200 }));
    await sendCapture(capture, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
