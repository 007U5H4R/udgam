import { describe, expect, it, vi } from 'vitest';
import { captureForm, sendCapture } from './capture-client';

// TSK-10.9: the send client reads the NDJSON stream as it arrives (TP12) and ends in exactly one
// outcome — a verdict, a boundary refusal (retrying cannot help), or retryable (offline / server).

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

const capture = { payload: '{"v":1}', signature: 'sig', files: [new Blob(['a'])] };
const ndjson = (...lines: object[]) => lines.map((l) => JSON.stringify(l) + '\n').join('');
const VERDICT = { t: 'verdict', eventId: 'HE-1', verdict: 'Verified', score: 100, checks: [{ id: 'geofence', status: 'ok', evidence: 'Inside' }] };

describe('sendCapture', () => {
  it('fires onCheck once per check line, in order, even when a chunk splits a line; a verdict line resolves kind verdict', async () => {
    const body = ndjson(
      { t: 'check', id: 'signature_valid', status: 'ok' },
      { t: 'check', id: 'geofence', status: 'flag' },
      { t: 'check', id: 'gps_accuracy', status: 'ok' },
      VERDICT,
    );
    const chunks = [body.slice(0, 7), body.slice(7, 61), body.slice(61, 62), body.slice(62)];
    let sent: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      sent = init;
      return new Response(streamOf(chunks), { status: 200 });
    });
    const seen: [string, string][] = [];
    const r = await sendCapture(capture, { onCheck: (id, status) => seen.push([id, status]), fetchImpl });
    expect(seen).toEqual([
      ['signature_valid', 'ok'],
      ['geofence', 'flag'],
      ['gps_accuracy', 'ok'],
    ]);
    expect(r).toEqual({ kind: 'verdict', verdict: { eventId: 'HE-1', verdict: 'Verified', score: 100, checks: VERDICT.checks }, idempotent: false });
    expect(fetchImpl.mock.calls[0]![0]).toBe('/api/capture');
    expect(sent?.method).toBe('POST');
    const form = sent?.body as FormData;
    expect(form.get('payload')).toBe('{"v":1}');
    expect(form.get('signature')).toBe('sig');
    expect(form.get('photo0')).toBeInstanceOf(Blob);
  });

  it('an idempotent replay is a verdict flagged idempotent', async () => {
    const fetchImpl = async () => new Response(ndjson({ ...VERDICT, idempotent: true }), { status: 200 });
    expect(await sendCapture(capture, { fetchImpl })).toMatchObject({ kind: 'verdict', idempotent: true });
  });

  it('a thrown TypeError (no network) → retryable/offline', async () => {
    const fetchImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await sendCapture(capture, { fetchImpl })).toEqual({ kind: 'retryable', cause: 'offline' });
  });

  it('HTTP 503, or an error line with retryable:true → retryable/server', async () => {
    const a = async () => new Response(ndjson({ t: 'error', retryable: true }), { status: 503 });
    const b = async () => new Response(ndjson({ t: 'check', id: 'geofence', status: 'ok' }, { t: 'error', retryable: true }), { status: 200 });
    const c = async () => new Response('<html>Bad gateway</html>', { status: 502 });
    for (const fetchImpl of [a, b, c]) expect(await sendCapture(capture, { fetchImpl })).toEqual({ kind: 'retryable', cause: 'server' });
  });

  it('HTTP 4xx JSON {error:"plot_not_assigned"} → rejected; an NDJSON rejected line too (with its extras)', async () => {
    const json = async () => Response.json({ error: 'plot_not_assigned' }, { status: 403 });
    expect(await sendCapture(capture, { fetchImpl: json })).toEqual({ kind: 'rejected', reason: 'plot_not_assigned' });
    const line = async () => new Response(ndjson({ t: 'rejected', reason: 'media_hash_mismatch', status: 409 }), { status: 409 });
    expect(await sendCapture(capture, { fetchImpl: line })).toEqual({ kind: 'rejected', reason: 'media_hash_mismatch' });
    const schema = async () => new Response(ndjson({ t: 'rejected', reason: 'bad_schema', status: 400, field: 'cherryKg' }), { status: 400 });
    expect(await sendCapture(capture, { fetchImpl: schema })).toEqual({ kind: 'rejected', reason: 'bad_schema', field: 'cherryKg' });
    // a refusal decided inside the 200 stream (e.g. the phone was revoked while it verified)
    const late = async () => new Response(ndjson({ t: 'check', id: 'geofence', status: 'ok' }, { t: 'rejected', reason: 'device_revoked', status: 403 }), { status: 200 });
    expect(await sendCapture(capture, { fetchImpl: late })).toEqual({ kind: 'rejected', reason: 'device_revoked' });
  });

  it('429 rate_limited is retryable later (nothing is lost), with the wait the phone will use: 90 s → 60 s (TKT-11)', async () => {
    const fetchImpl = async () =>
      new Response(ndjson({ t: 'rejected', reason: 'rate_limited', status: 429, retryAfterSec: 90 }), { status: 429, headers: { 'Retry-After': '90' } });
    expect(await sendCapture(capture, { fetchImpl })).toEqual({ kind: 'retryable', cause: 'server', reason: 'rate_limited', retryAfterSec: 60 });
  });

  it('a stream that ends without a verdict → retryable/server; one that breaks mid-way → retryable/offline', async () => {
    const ends = async () => new Response(ndjson({ t: 'check', id: 'geofence', status: 'ok' }), { status: 200 });
    expect(await sendCapture(capture, { fetchImpl: ends })).toEqual({ kind: 'retryable', cause: 'server' });
    const breaks = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode(ndjson({ t: 'check', id: 'geofence', status: 'ok' })));
            c.error(new TypeError('network changed'));
          },
        }),
        { status: 200 },
      );
    expect(await sendCapture(capture, { fetchImpl: breaks })).toEqual({ kind: 'retryable', cause: 'offline' });
  });
});

describe('captureForm', () => {
  it('carries payload, signature and photo0..photoN in order', async () => {
    const fd = captureForm({ payload: 'P', signature: 'S', files: [new Blob(['a']), new Blob(['b'])] });
    expect(fd.get('payload')).toBe('P');
    expect(fd.get('signature')).toBe('S');
    expect(await (fd.get('photo0') as File).text()).toBe('a');
    expect(await (fd.get('photo1') as File).text()).toBe('b');
  });
});
