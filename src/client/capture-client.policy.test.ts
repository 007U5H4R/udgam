import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceDevice, deleteOutbox } from './capture-store';
import { sendCapture, sendOutboxItem, type OutboxSend, type SendResult } from './capture-client';
import { refusalKeepsOutbox } from '../lib/i18n/farmer-evidence';

// TASK-11 fix round 1 (quality MAJOR 2, spec MAJOR 3): the signed outbox copy is deleted ONLY on an
// answer the app itself sent — a verdict, or a refusal line / guard JSON with a reason code the app
// knows. 408, 425 and 429 (with or without a body), 5xx, a network error, and any 4xx whose body is
// not a recognised app answer (a proxy's HTML page, nothing, unknown JSON) keep it as retryable. The
// device's chain head moves on only on a verdict.

vi.mock('./capture-store', () => ({
  bumpAttempt: vi.fn(async () => undefined),
  deleteOutbox: vi.fn(async () => undefined),
  advanceDevice: vi.fn(async () => undefined),
  markAnswered: vi.fn(async () => undefined),
  answeredItems: vi.fn(async () => []),
  loadSigner: vi.fn(async () => null),
  putOutbox: vi.fn(async () => 'OB-1'),
}));

const nd = (...lines: object[]) => lines.map((l) => `${JSON.stringify(l)}\n`).join('');
const VERDICT = { t: 'verdict', eventId: 'HE-1', verdict: 'Verified' as const, score: 100, checks: [{ id: 'geofence' as const, status: 'ok' as const, evidence: 'Inside', hardFail: false }], capReasons: [] };

type Row = { name: string; status: number; body: string | null; headers?: Record<string, string>; keep: boolean; advance: boolean; result: SendResult };
const R = (x: SendResult) => x;
const server = R({ kind: 'retryable', cause: 'server' });

const TABLE: Row[] = [
  { name: '200 · verdict line', status: 200, body: nd({ t: 'check', id: 'geofence', status: 'ok' }, VERDICT), keep: false, advance: true, result: R({ kind: 'verdict', verdict: { eventId: 'HE-1', verdict: 'Verified', score: 100, checks: VERDICT.checks, capReasons: [] }, idempotent: false }) },
  { name: '200 · idempotent verdict line', status: 200, body: nd({ ...VERDICT, idempotent: true }), keep: false, advance: true, result: R({ kind: 'verdict', verdict: { eventId: 'HE-1', verdict: 'Verified', score: 100, checks: VERDICT.checks, capReasons: [] }, idempotent: true }) },
  { name: '403 · app refusal line (plot_not_assigned)', status: 403, body: nd({ t: 'rejected', reason: 'plot_not_assigned', status: 403 }), keep: false, advance: false, result: R({ kind: 'rejected', reason: 'plot_not_assigned' }) },
  { name: '409 · app refusal line (media_hash_mismatch)', status: 409, body: nd({ t: 'rejected', reason: 'media_hash_mismatch', status: 409 }), keep: false, advance: false, result: R({ kind: 'rejected', reason: 'media_hash_mismatch' }) },
  { name: '200 · refusal decided in the stream (device_revoked)', status: 200, body: nd({ t: 'check', id: 'geofence', status: 'ok' }, { t: 'rejected', reason: 'device_revoked', status: 403 }), keep: false, advance: false, result: R({ kind: 'rejected', reason: 'device_revoked' }) },
  { name: '403 · guard JSON (forbidden)', status: 403, body: JSON.stringify({ error: 'forbidden' }), keep: false, advance: false, result: R({ kind: 'rejected', reason: 'forbidden' }) },
  { name: '401 · guard JSON (unauthenticated): an app refusal the phone keeps', status: 401, body: JSON.stringify({ error: 'unauthenticated' }), keep: true, advance: false, result: R({ kind: 'rejected', reason: 'unauthenticated' }) },
  { name: '429 · rate_limited line with Retry-After', status: 429, body: nd({ t: 'rejected', reason: 'rate_limited', status: 429, retryAfterSec: 90 }), headers: { 'Retry-After': '90' }, keep: true, advance: false, result: R({ kind: 'retryable', cause: 'server', reason: 'rate_limited', retryAfterSec: 90 }) },
  { name: '429 · no body at all', status: 429, body: null, keep: true, advance: false, result: R({ kind: 'retryable', cause: 'server', reason: 'rate_limited' }) },
  { name: '429 · a proxy HTML page with Retry-After', status: 429, body: '<html>Too many</html>', headers: { 'Retry-After': '120' }, keep: true, advance: false, result: R({ kind: 'retryable', cause: 'server', reason: 'rate_limited', retryAfterSec: 120 }) },
  { name: '408 · no body', status: 408, body: null, keep: true, advance: false, result: server },
  { name: '408 · a proxy HTML page (nginx client_body_timeout)', status: 408, body: '<html><body>408 Request Time-out</body></html>', keep: true, advance: false, result: server },
  { name: '408 · the app error line', status: 408, body: nd({ t: 'error', retryable: true }), keep: true, advance: false, result: server },
  { name: '425 · empty', status: 425, body: '', keep: true, advance: false, result: server },
  { name: '421 · a captive-portal HTML page', status: 421, body: '<html>Sign in to Wi-Fi</html>', keep: true, advance: false, result: server },
  { name: '400 · HTML', status: 400, body: '<html>Bad request</html>', keep: true, advance: false, result: server },
  { name: '404 · no body', status: 404, body: null, keep: true, advance: false, result: server },
  { name: '400 · unknown JSON', status: 400, body: JSON.stringify({ message: 'nope' }), keep: true, advance: false, result: server },
  { name: '404 · JSON with an unknown error code', status: 404, body: JSON.stringify({ error: 'not_found' }), keep: true, advance: false, result: server },
  { name: '400 · a rejected line with an unknown reason', status: 400, body: nd({ t: 'rejected', reason: 'something_new', status: 400 }), keep: true, advance: false, result: server },
  { name: '500 · HTML', status: 500, body: '<html>oops</html>', keep: true, advance: false, result: server },
  { name: '502 · empty', status: 502, body: null, keep: true, advance: false, result: server },
  { name: '503 · busy line with Retry-After', status: 503, body: nd({ t: 'error', retryable: true }), headers: { 'Retry-After': '5' }, keep: true, advance: false, result: R({ kind: 'retryable', cause: 'server', retryAfterSec: 5 }) },
  { name: '200 · stream ends without a verdict', status: 200, body: nd({ t: 'check', id: 'geofence', status: 'ok' }), keep: true, advance: false, result: server },
  { name: '200 · HTML', status: 200, body: '<html>hotel wifi</html>', keep: true, advance: false, result: server },
];

let n = 0;
const item = (): OutboxSend => ({ id: `OB-${++n}`, payload: '{"v":1}', signature: 'sig', files: [new Blob(['a'])], deviceId: 'DV-1', seq: 7 });

beforeEach(() => {
  vi.mocked(deleteOutbox).mockClear();
  vi.mocked(advanceDevice).mockClear();
});

describe('keep / delete / advance, by status × body', () => {
  it.each(TABLE)('$name', async (row) => {
    const fetchImpl = async () => new Response(row.body, { status: row.status, headers: row.headers ?? {} });
    const it_ = item();
    const r = await sendOutboxItem(it_, { fetchImpl, keepOnRefusal: refusalKeepsOutbox });
    expect(r).toEqual(row.result);
    expect(vi.mocked(deleteOutbox).mock.calls).toEqual(row.keep ? [] : [[it_.id]]);
    expect(vi.mocked(advanceDevice).mock.calls.length).toBe(row.advance ? 1 : 0);
    if (row.advance) expect(vi.mocked(advanceDevice).mock.calls[0]!.slice(0, 2)).toEqual(['DV-1', 7]);
  });

  it('a network error keeps the copy (retryable/offline) and does not advance', async () => {
    const r = await sendOutboxItem(item(), {
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    expect(r).toEqual({ kind: 'retryable', cause: 'offline' });
    expect(deleteOutbox).not.toHaveBeenCalled();
    expect(advanceDevice).not.toHaveBeenCalled();
  });
});

describe('sendCapture stream edge cases', () => {
  const capture = { payload: '{"v":1}', signature: 'sig', files: [new Blob(['a'])] };
  it('blank lines and unknown `t` values are skipped; a final verdict line without a newline still counts', async () => {
    const body = `\n\n${JSON.stringify({ t: 'progress', pct: 50 })}\n  \n${JSON.stringify(VERDICT)}`;
    const r = await sendCapture(capture, { fetchImpl: async () => new Response(body, { status: 200 }) });
    expect(r).toMatchObject({ kind: 'verdict', verdict: { eventId: 'HE-1' } });
  });

  it('a verdict line missing its eventId is not an answer (retryable), so nothing is deleted', async () => {
    const r = await sendCapture(capture, { fetchImpl: async () => new Response(nd({ t: 'verdict', verdict: 'Verified' }), { status: 200 }) });
    expect(r).toEqual({ kind: 'retryable', cause: 'server' });
  });

  it('401 JSON unauthenticated → rejected unauthenticated (the screen keeps the copy)', async () => {
    const r = await sendCapture(capture, { fetchImpl: async () => Response.json({ error: 'unauthenticated' }, { status: 401 }) });
    expect(r).toEqual({ kind: 'rejected', reason: 'unauthenticated' });
  });
});
