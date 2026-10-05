import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// TSK-16.3: POST /api/telemetry accepts only {event:'certificate.proof_failed'|'certificate.viewed', step?,
// batchId} (400 otherwise) and logs it without the caller's IP address or user agent.
// TASK-17 fix round 1: the body is bounded before and while it is read (411 without a numeric
// Content-Length, 413 over 512 bytes declared or streamed, never buffered past the limit), and each client
// address is rate-limited (429 with Retry-After) before the body is read. The limiter on a real database
// is route.int.test.ts.

const info = vi.hoisted(() => vi.fn());
const consume = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/log', () => ({ log: { info, warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../../lib/db/client', () => ({ getDbReady: vi.fn(async () => ({})) }));
vi.mock('../../../lib/capture/rate-limit', () => ({ consume }));

import { POST } from './route';

const BASE_HEADERS = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', 'user-agent': 'Mozilla/5.0 Test' };

/** A request as sendBeacon makes it: the body with its byte length declared (null removes a header). */
const post = (body: string, headers: Record<string, string | null> = {}) => {
  const h: Record<string, string> = { ...BASE_HEADERS, 'content-length': String(new TextEncoder().encode(body).length) };
  for (const [k, v] of Object.entries(headers)) {
    if (v === null) delete h[k];
    else h[k] = v;
  }
  return POST(new Request('http://localhost/api/telemetry', { method: 'POST', body, headers: h }));
};

/** A streamed body of 64-byte chunks that never ends on its own; counts the chunks the route pulled. */
function endless(headers: Record<string, string>): { req: Request; pulled: () => number } {
  let pulled = 0;
  const chunk = new TextEncoder().encode('x'.repeat(64));
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulled++;
        controller.enqueue(chunk);
      },
    },
    { highWaterMark: 0 },
  );
  const init = { method: 'POST', body, headers: { ...BASE_HEADERS, ...headers }, duplex: 'half' };
  return { req: new Request('http://localhost/api/telemetry', init as RequestInit), pulled: () => pulled };
}

const VIEW = JSON.stringify({ event: 'certificate.viewed', batchId: 'B-7K2M9Q4D' });

beforeEach(() => {
  consume.mockReset();
  consume.mockResolvedValue({ ok: true, retryAfterSec: 0 });
});
afterEach(() => info.mockClear());

describe('POST /api/telemetry (TSK-16.3)', () => {
  it('accepts a failed proof with its step and logs exactly event, step and batchId (no IP, no UA)', async () => {
    const res = await post(JSON.stringify({ event: 'certificate.proof_failed', step: 'payload-hash', batchId: 'B-7K2M9Q4D' }));
    expect(res.status).toBe(204);
    expect(info).toHaveBeenCalledTimes(1);
    const [fields, msg] = info.mock.calls[0]!;
    expect(msg).toBe('certificate.telemetry');
    expect(fields).toEqual({ event: 'certificate.proof_failed', step: 'payload-hash', batchId: 'B-7K2M9Q4D' });
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/203\.0\.113\.9|Mozilla/);
  });

  it('accepts a view', async () => {
    const res = await post(VIEW);
    expect(res.status).toBe(204);
    expect(info.mock.calls[0]![0]).toEqual({ event: 'certificate.viewed', batchId: 'B-7K2M9Q4D' });
  });

  it.each([
    ['not JSON', 'hello'],
    ['an unknown event', JSON.stringify({ event: 'certificate.shared', batchId: 'B-7K2M9Q4D' })],
    ['an unknown step', JSON.stringify({ event: 'certificate.proof_failed', step: 'vibes', batchId: 'B-7K2M9Q4D' })],
    ['a failure without its step', JSON.stringify({ event: 'certificate.proof_failed', batchId: 'B-7K2M9Q4D' })],
    ['a step on a view', JSON.stringify({ event: 'certificate.viewed', step: 'format', batchId: 'B-7K2M9Q4D' })],
    ['an extra member', JSON.stringify({ event: 'certificate.viewed', batchId: 'B-7K2M9Q4D', name: 'Zzsentinel Farmer' })],
    ['a batch id of another shape', JSON.stringify({ event: 'certificate.viewed', batchId: 'Zzsentinel Farmer' })],
    ['no batch id', JSON.stringify({ event: 'certificate.viewed' })],
    ['an array', '[]'],
  ])('refuses %s with 400 and logs nothing', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request' });
    expect(info).not.toHaveBeenCalled();
  });
});

describe('POST /api/telemetry body bounds (TASK-17 fix round 1)', () => {
  it.each([
    ['no Content-Length (a chunked body)', null],
    ['a non-numeric Content-Length', 'abc'],
    ['a negative Content-Length', '-1'],
    ['an empty Content-Length', ''],
  ])('refuses %s with 411 before counting or reading anything', async (_name, length) => {
    const res = await post(VIEW, { 'content-length': length });
    expect(res.status).toBe(411);
    expect(await res.json()).toEqual({ error: 'length_required' });
    expect(consume).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('refuses a declared length over 512 bytes with 413 before reading the body', async () => {
    const { req, pulled } = endless({ 'content-length': '513' });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'body_too_large' });
    expect(pulled()).toBe(0);
    expect(info).not.toHaveBeenCalled();
  });

  it('refuses a padded body of over 600 bytes that declares its length with 413', async () => {
    const res = await post(JSON.stringify({ event: 'certificate.viewed', batchId: 'B-7K2M9Q4D', pad: 'x'.repeat(600) }));
    expect(res.status).toBe(413);
    expect(info).not.toHaveBeenCalled();
  });

  it('reads exactly 512 declared bytes (then the schema refuses the padding with 400)', async () => {
    const body = JSON.stringify({ event: 'certificate.viewed', batchId: 'B-7K2M9Q4D', p: '' });
    const padded = body.replace('"p":""', `"p":"${'x'.repeat(512 - body.length)}"`);
    expect(new TextEncoder().encode(padded).length).toBe(512);
    expect((await post(padded)).status).toBe(400);
  });

  it('stops reading a streamed body that runs past 512 bytes, whatever it declared: 413 within 10 chunks of 64 bytes', async () => {
    const { req, pulled } = endless({ 'content-length': '100' });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'body_too_large' });
    // 8 chunks are 512 bytes; the 9th crosses the limit and the read is cancelled there.
    expect(pulled()).toBeLessThanOrEqual(10);
    expect(info).not.toHaveBeenCalled();
  });
});

describe('POST /api/telemetry rate limit (TASK-17 fix round 1)', () => {
  it('counts each request on its client address (the last X-Forwarded-For hop): 30 per 10 minutes', async () => {
    await post(VIEW, { 'x-forwarded-for': '198.51.100.1, 203.0.113.9' });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0]!.slice(1)).toEqual(['telemetry:ip:203.0.113.9', 30, 600]);
  });

  it('a proof failure sent to ?e=proof_failed counts on its own bucket, 30 per 10 minutes (TASK-17 r2 N2)', async () => {
    const failed = JSON.stringify({ event: 'certificate.proof_failed', batchId: 'B-7K2M9Q4D', step: 'entry-hash' });
    const h = { ...BASE_HEADERS, 'content-length': String(failed.length) };
    const res = await POST(new Request('http://localhost/api/telemetry?e=proof_failed', { method: 'POST', body: failed, headers: h }));
    expect(res.status).toBe(204);
    expect(consume.mock.calls[0]!.slice(1)).toEqual(['telemetry:failed:ip:203.0.113.9', 30, 600]);
  });

  it('the failure bucket carries proof failures only: a view sent to it is 400 and not logged', async () => {
    const h = { ...BASE_HEADERS, 'content-length': String(VIEW.length) };
    const res = await POST(new Request('http://localhost/api/telemetry?e=proof_failed', { method: 'POST', body: VIEW, headers: h }));
    expect(res.status).toBe(400);
    expect(info).not.toHaveBeenCalled();
  });

  it('keys an IPv6 client by its /64', async () => {
    await post(VIEW, { 'x-forwarded-for': '2001:db8:1:2:aaaa:bbbb:cccc:dddd' });
    expect(consume.mock.calls[0]![1]).toBe('telemetry:ip:2001:db8:1:2::/64');
  });

  it('refuses over the limit with 429 and Retry-After, before reading the body, and logs nothing', async () => {
    consume.mockResolvedValue({ ok: false, retryAfterSec: 42 });
    const { req, pulled } = endless({ 'content-length': '100' });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('42');
    expect(await res.json()).toEqual({ error: 'rate_limited' });
    expect(pulled()).toBe(0);
    expect(info).not.toHaveBeenCalled();
  });

  it('answers 503 when the limiter cannot be reached', async () => {
    consume.mockRejectedValue(new Error('SQLITE_BUSY'));
    const res = await post(VIEW);
    expect(res.status).toBe(503);
    expect(info).not.toHaveBeenCalled();
  });
});
