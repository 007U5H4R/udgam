import { describe, expect, it } from 'vitest';
import { readFormWithin } from './read-form';

// TASK-20 fix round 2 (N2): the capture body must arrive within a deadline; past it the read is cancelled.

const URL_ = 'http://localhost/api/capture';

async function multipart(): Promise<{ bytes: Uint8Array; type: string }> {
  const fd = new FormData();
  fd.set('payload', '{"v":1}');
  fd.set('photo0', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], 'p.jpg', { type: 'image/jpeg' }));
  const r = new Response(fd);
  return { bytes: new Uint8Array(await r.arrayBuffer()), type: r.headers.get('content-type')! };
}

/** A request whose body sends `first` and then nothing more until `end()` or `fail()`; records a cancel. */
function trickle(first: Uint8Array, type: string) {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      c.enqueue(first);
    },
    cancel() {
      cancelled = true;
    },
  });
  const req = new Request(URL_, { method: 'POST', body, headers: { 'content-type': type }, duplex: 'half' } as RequestInit);
  return { req, cancelled: () => cancelled, send: (b: Uint8Array) => ctrl.enqueue(b), end: () => ctrl.close(), fail: () => ctrl.error(new Error('connection reset')) };
}

describe('readFormWithin', () => {
  it('a body that arrives in time is parsed as multipart form data, in chunks too', async () => {
    const { bytes, type } = await multipart();
    const t = trickle(bytes.slice(0, 10), type);
    const reading = readFormWithin(t.req, 5_000);
    t.send(bytes.slice(10));
    t.end();
    const r = await reading;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.form.get('payload')).toBe('{"v":1}');
    expect(((r.form.get('photo0') as File).size)).toBe(7);
  });

  it('a body still arriving at the deadline → timeout, and the read is cancelled', async () => {
    const { bytes, type } = await multipart();
    const t = trickle(bytes.slice(0, 10), type);
    const started = Date.now();
    const r = await readFormWithin(t.req, 150);
    expect(r).toEqual({ ok: false, reason: 'timeout' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    expect(t.cancelled()).toBe(true);
  });

  it('a body that is not multipart, or that breaks off → bad_form', async () => {
    const plain = new Request(URL_, { method: 'POST', body: 'not a form', headers: { 'content-type': 'multipart/form-data; boundary=x' } });
    expect(await readFormWithin(plain, 5_000)).toEqual({ ok: false, reason: 'bad_form' });
    const { bytes, type } = await multipart();
    const t = trickle(bytes.slice(0, 10), type);
    const reading = readFormWithin(t.req, 5_000);
    t.fail();
    expect(await reading).toEqual({ ok: false, reason: 'bad_form' });
    const none = new Request(URL_, { method: 'POST', headers: { 'content-type': type } });
    expect(await readFormWithin(none, 5_000)).toEqual({ ok: false, reason: 'bad_form' });
  });

  it('more bytes than the body cap → too_large, read no further', async () => {
    const { type } = await multipart();
    const t = trickle(new Uint8Array(40), type);
    const reading = readFormWithin(t.req, 5_000, 64);
    t.send(new Uint8Array(40));
    expect(await reading).toEqual({ ok: false, reason: 'too_large' });
    expect(t.cancelled()).toBe(true);
  });
});
