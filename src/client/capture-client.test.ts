import { describe, expect, it } from 'vitest';
import type { CaptureEvent } from '../lib/capture/pipeline';
import { captureForm, sendCapture } from './capture-client';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

describe('sendCapture', () => {
  it('delivers NDJSON lines as they arrive, even when a chunk splits a line', async () => {
    const lines = [
      { t: 'check', id: 'signature_valid', status: 'ok' },
      { t: 'check', id: 'geofence', status: 'ok' },
      { t: 'verdict', eventId: 'HE-1', verdict: 'Verified', score: 100, checks: [] },
    ].map((l) => JSON.stringify(l) + '\n');
    const joined = lines.join('');
    const chunks = [joined.slice(0, 10), joined.slice(10, 57), joined.slice(57)];
    let sent: RequestInit | undefined;
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      sent = init;
      return new Response(streamOf(chunks), { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
    };
    const events: CaptureEvent[] = [];
    const form = captureForm({ payloadString: '{}', signature: 'sig', files: [new File(['a'], 'a.jpg')] });
    const r = await sendCapture(form, (e) => events.push(e), fetchImpl);
    expect(r.status).toBe(200);
    expect(events.map((e) => e.t)).toEqual(['check', 'check', 'verdict']);
    expect(sent?.method).toBe('POST');
    expect(sent?.body).toBe(form);
  });

  it('passes a 4xx rejected line through', async () => {
    const fetchImpl = async () => new Response('{"t":"rejected","reason":"bad_signature","status":401}\n', { status: 401 });
    const events: CaptureEvent[] = [];
    await sendCapture(new FormData(), (e) => events.push(e), fetchImpl);
    expect(events).toEqual([{ t: 'rejected', reason: 'bad_signature', status: 401 }]);
  });

  it('turns a network failure, a 5xx without lines, or a stream that ends without a terminal line into a retryable error', async () => {
    for (const fetchImpl of [
      async () => {
        throw new TypeError('Failed to fetch');
      },
      async () => new Response('<html>Bad gateway</html>', { status: 502 }),
      async () => new Response('{"t":"check","id":"geofence","status":"ok"}\n', { status: 200 }),
    ]) {
      const events: CaptureEvent[] = [];
      await sendCapture(new FormData(), (e) => events.push(e), fetchImpl);
      expect(events.at(-1)).toEqual({ t: 'error', retryable: true });
    }
  });
});

describe('captureForm', () => {
  it('carries payload, signature and photo0..photoN in order', async () => {
    const fd = captureForm({ payloadString: 'P', signature: 'S', files: [new File(['a'], 'a'), new File(['b'], 'b')] });
    expect(fd.get('payload')).toBe('P');
    expect(fd.get('signature')).toBe('S');
    expect(await (fd.get('photo0') as File).text()).toBe('a');
    expect(await (fd.get('photo1') as File).text()).toBe('b');
  });
});
