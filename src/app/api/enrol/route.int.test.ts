// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addOrg, addUser, cookieHeader } from '../../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../../tests/helpers/db';
import { generateKeyPair, publicMembers } from '../../../lib/crypto';
import { issueCode } from '../../../lib/enrolment/codes';

// TSK-05.3: POST /api/enrol needs an agent session and a code issued for that agent; JSON in, 200 {deviceId}.
let t: TempDb;
const PW = 'enrol route password';

beforeEach(async () => {
  t = await tempDb();
  await addOrg(t.db, 'ORG-A', 'fpo');
  await addUser(t.db, { id: 'U-AGENT', email: 'agent@a.test', password: PW, role: 'agent', orgId: 'ORG-A' });
  await addUser(t.db, { id: 'U-ADMIN', email: 'admin@a.test', password: PW, role: 'admin', orgId: 'ORG-A' });
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
});
afterEach(async () => {
  (await import('../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

async function cookieFor(email: string): Promise<string> {
  const { appAuth } = await import('../../_auth/auth');
  return cookieHeader(await appAuth().api.signInEmail({ body: { email, password: PW }, asResponse: true }));
}

async function jwk() {
  const pair = await generateKeyPair(false);
  return publicMembers(await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey)); // what the phone sends
}

/**
 * A request as the reverse proxy forwards it: whatever the client sent in X-Forwarded-For, then its
 * address last. It declares its Content-Length, as a browser's fetch of a string body does; `extra` may
 * override it, or drop it with null.
 */
function post(body: unknown, cookie: string | null, ip = '203.0.113.5', extra: Record<string, string | null> = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const merged: Record<string, string | null> = {
    'content-type': 'application/json',
    'content-length': String(new TextEncoder().encode(text).length),
    'x-forwarded-for': `10.9.9.9, ${ip}`,
    ...extra,
  };
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged)) if (v !== null) headers[k] = v;
  if (cookie) headers.cookie = cookie;
  return new Request('http://localhost/api/enrol', { method: 'POST', headers, body: text });
}

/** A streamed body of 64-byte chunks that never ends on its own; counts the chunks the route pulled. */
function endless(cookie: string, headers: Record<string, string>): { req: Request; pulled: () => number } {
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
  const init = { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.5', cookie, ...headers }, duplex: 'half' };
  return { req: new Request('http://localhost/api/enrol', init as RequestInit), pulled: () => pulled };
}

const deviceCount = async () => (await t.client.execute('SELECT COUNT(*) AS n FROM devices')).rows[0]!.n;

describe('POST /api/enrol', () => {
  it('enrols the phone for the signed-in agent: 200 {deviceId}', async () => {
    const { code } = await issueCode(t.db, { agentId: 'U-AGENT', adminId: 'U-ADMIN', orgId: 'ORG-A' });
    const { POST } = await import('./route');
    const res = await POST(post({ code, publicJwk: await jwk() }, await cookieFor('agent@a.test')));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as { deviceId: string };
    expect(Object.keys(body)).toEqual(['deviceId']);
    const dev = await t.client.execute({ sql: 'SELECT agent_id FROM devices WHERE id = ?', args: [body.deviceId] });
    expect(dev.rows[0]?.agent_id).toBe('U-AGENT');
  });

  it('401 signed out, 403 for an admin; nothing is enrolled', async () => {
    const { code } = await issueCode(t.db, { agentId: 'U-AGENT', adminId: 'U-ADMIN', orgId: 'ORG-A' });
    const { POST } = await import('./route');
    expect((await POST(post({ code, publicJwk: await jwk() }, null))).status).toBe(401);
    expect((await POST(post({ code, publicJwk: await jwk() }, await cookieFor('admin@a.test')))).status).toBe(403);
    expect((await t.client.execute('SELECT COUNT(*) AS n FROM devices')).rows[0]!.n).toBe(0);
  });

  it('answers each refusal with its reason and status (400 invalid/used/bad_key, 400 bad_request, 429 rate_limited)', async () => {
    const { POST } = await import('./route');
    const cookie = await cookieFor('agent@a.test');
    const { code } = await issueCode(t.db, { agentId: 'U-AGENT', adminId: 'U-ADMIN', orgId: 'ORG-A' });
    const answer = async (res: Response) => ({ status: res.status, body: (await res.json()) as unknown });
    expect(await answer(await POST(post('{not json', cookie)))).toEqual({ status: 400, body: { error: 'bad_request' } });
    expect(await answer(await POST(post({ code: 42, publicJwk: await jwk() }, cookie)))).toEqual({ status: 400, body: { error: 'bad_request' } });
    expect(await answer(await POST(post({ code, publicJwk: { ...(await jwk()), d: 'AAAA' } }, cookie)))).toEqual({ status: 400, body: { error: 'bad_key' } });
    expect((await POST(post({ code, publicJwk: await jwk() }, cookie))).status).toBe(200);
    expect(await answer(await POST(post({ code, publicJwk: await jwk() }, cookie)))).toEqual({ status: 400, body: { error: 'used' } });
    for (let i = 0; i < 8; i++) await POST(post({ code: 'ZZZZZZ', publicJwk: await jwk() }, cookie));
    expect(await answer(await POST(post({ code: 'YYYYYY', publicJwk: await jwk() }, cookie)))).toEqual({ status: 429, body: { error: 'rate_limited' } });
    // the limit is per client address: the LAST X-Forwarded-For hop (the one the proxy appends/sets);
    // a forged earlier hop or X-Real-IP does not move the caller to a fresh bucket
    expect(await answer(await POST(post({ code: 'YYYYYY', publicJwk: await jwk() }, cookie, '203.0.113.5', { 'x-real-ip': '198.51.100.77' })))).toEqual({
      status: 429,
      body: { error: 'rate_limited' },
    });
    expect(await answer(await POST(post({ code: 'YYYYYY', publicJwk: await jwk() }, cookie, '198.51.100.8')))).toEqual({ status: 400, body: { error: 'invalid' } });
  });
});

describe('POST /api/enrol body bound (final branch review finding 2)', () => {
  // A legitimate body is a 6-character code and a P-256 public JWK: about 200 bytes. The cap is 4 KiB.
  it('the largest legitimate body is well under the 4096-byte cap', async () => {
    const body = JSON.stringify({ code: 'ZZZZZZ', publicJwk: await jwk() });
    expect(new TextEncoder().encode(body).length).toBeLessThan(400);
  });

  it.each([
    ['no Content-Length', null],
    ['a non-numeric Content-Length', 'abc'],
    ['a negative Content-Length', '-1'],
    ['an empty Content-Length', ''],
  ])('refuses %s with 411 and enrols nothing', async (_name, length) => {
    const { code } = await issueCode(t.db, { agentId: 'U-AGENT', adminId: 'U-ADMIN', orgId: 'ORG-A' });
    const { POST } = await import('./route');
    const res = await POST(post({ code, publicJwk: await jwk() }, await cookieFor('agent@a.test'), '203.0.113.5', { 'content-length': length }));
    expect(res.status).toBe(411);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'length_required' });
    expect(await deviceCount()).toBe(0);
  });

  it('refuses a chunked body (no Content-Length) with 411 without reading it', async () => {
    const { POST } = await import('./route');
    const { req, pulled } = endless(await cookieFor('agent@a.test'), {});
    const res = await POST(req);
    expect(res.status).toBe(411);
    expect(await res.json()).toEqual({ error: 'length_required' });
    expect(pulled()).toBe(0);
  });

  it('refuses a declared length over 4096 bytes with 413 before reading the body', async () => {
    const { POST } = await import('./route');
    const { req, pulled } = endless(await cookieFor('agent@a.test'), { 'content-length': '4097' });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'body_too_large' });
    expect(pulled()).toBe(0);
  });

  it('refuses a 60 MB declared body with 413', async () => {
    const { POST } = await import('./route');
    const { req, pulled } = endless(await cookieFor('agent@a.test'), { 'content-length': '62914560' });
    expect((await POST(req)).status).toBe(413);
    expect(pulled()).toBe(0);
  });

  it('stops reading a streamed body that runs past 4096 bytes, whatever it declared: 413 within 66 chunks of 64 bytes', async () => {
    const { POST } = await import('./route');
    const { req, pulled } = endless(await cookieFor('agent@a.test'), { 'content-length': '300' });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'body_too_large' });
    expect(pulled()).toBeLessThanOrEqual(66);
    expect(await deviceCount()).toBe(0);
  });

  it('refuses a padded JSON body of 4097 bytes that declares its length with 413; enrols nothing', async () => {
    const { code } = await issueCode(t.db, { agentId: 'U-AGENT', adminId: 'U-ADMIN', orgId: 'ORG-A' });
    const { POST } = await import('./route');
    const base = JSON.stringify({ code, publicJwk: await jwk(), pad: '' });
    const padded = base.replace('"pad":""', `"pad":"${'x'.repeat(4097 - base.length)}"`);
    expect(new TextEncoder().encode(padded).length).toBe(4097);
    const res = await POST(post(padded, await cookieFor('agent@a.test')));
    expect(res.status).toBe(413);
    expect(await deviceCount()).toBe(0);
  });

  it('accepts a body of exactly 4096 bytes (the extra member is ignored)', async () => {
    const { code } = await issueCode(t.db, { agentId: 'U-AGENT', adminId: 'U-ADMIN', orgId: 'ORG-A' });
    const { POST } = await import('./route');
    const base = JSON.stringify({ code, publicJwk: await jwk(), pad: '' });
    const padded = base.replace('"pad":""', `"pad":"${'x'.repeat(4096 - base.length)}"`);
    expect(new TextEncoder().encode(padded).length).toBe(4096);
    const res = await POST(post(padded, await cookieFor('agent@a.test')));
    expect(res.status).toBe(200);
    expect(await deviceCount()).toBe(1);
  });

  it('a signed-out caller is 401 whatever the body declares', async () => {
    const { POST } = await import('./route');
    expect((await POST(post('{}', null, '203.0.113.5', { 'content-length': null }))).status).toBe(401);
  });
});
