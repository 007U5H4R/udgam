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

/** A request as the reverse proxy forwards it: whatever the client sent in X-Forwarded-For, then its address last. */
function post(body: unknown, cookie: string | null, ip = '203.0.113.5', extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': `10.9.9.9, ${ip}`, ...extra };
  if (cookie) headers.cookie = cookie;
  return new Request('http://localhost/api/enrol', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

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
