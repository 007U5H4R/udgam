import { afterEach, describe, expect, it, vi } from 'vitest';

// TSK-16.3: POST /api/telemetry accepts only {event:'certificate.proof_failed'|'certificate.viewed', step?,
// batchId} (400 otherwise) and logs it without the caller's IP address or user agent.

const info = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/log', () => ({ log: { info, warn: vi.fn(), error: vi.fn() } }));

import { POST } from './route';

const post = (body: string, headers: Record<string, string> = {}) =>
  POST(new Request('http://localhost/api/telemetry', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', 'user-agent': 'Mozilla/5.0 Test', ...headers } }));

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
    const res = await post(JSON.stringify({ event: 'certificate.viewed', batchId: 'B-7K2M9Q4D' }));
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
    ['a body over 512 bytes', JSON.stringify({ event: 'certificate.viewed', batchId: 'B-7K2M9Q4D', pad: 'x'.repeat(600) })],
  ])('refuses %s with 400 and logs nothing', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request' });
    expect(info).not.toHaveBeenCalled();
  });
});
