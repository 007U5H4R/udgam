// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addOrg, addUser, cookieHeader } from '../../../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../../../tests/helpers/db';
import { session } from '../../../../lib/db/schema';

// TASK-20 fix round 1 (review major 3): Better Auth's HTTP surface is only what the app uses. Sign-in
// goes through the throttled Server Action (in-process), so `POST /api/auth/sign-in/*` and every other
// credential endpoint answer 404 here and can't be used to guess passwords around the throttle.
// get-session and sign-out keep working.

let t: TempDb;
const PASSWORD = 'correct horse battery';
const ORIGIN = 'http://localhost:3000';

beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  vi.stubEnv('BETTER_AUTH_URL', ORIGIN);
  await addOrg(t.db, 'ORG-A', 'fpo');
  await addUser(t.db, { id: 'U-ADMIN-A', email: 'admin@a.test', password: PASSWORD, role: 'admin', orgId: 'ORG-A' });
});
afterEach(async () => {
  (await import('../../../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

const route = () => import('./route');

const request = (method: 'GET' | 'POST', path: string, body?: unknown, cookie?: string) =>
  new Request(`${ORIGIN}/api/auth/${path}`, {
    method,
    headers: { origin: ORIGIN, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/** A session cookie made the way the app makes one: Better Auth's API, in-process. */
async function signedInCookie(): Promise<string> {
  const { appAuth } = await import('../../../_auth/auth');
  return cookieHeader(await appAuth().api.signInEmail({ body: { email: 'admin@a.test', password: PASSWORD }, asResponse: true }));
}

describe('/api/auth/[...all] (fix round 1)', () => {
  it('refuses POST /api/auth/sign-in/email with 404 — the right password included — and creates no session', async () => {
    const { POST } = await route();
    for (let i = 0; i < 12; i++) {
      const res = await POST(request('POST', 'sign-in/email', { email: 'admin@a.test', password: `guess ${i}` }));
      expect(res.status).toBe(404);
    }
    const right = await POST(request('POST', 'sign-in/email', { email: 'admin@a.test', password: PASSWORD }));
    expect(right.status).toBe(404);
    expect(right.headers.getSetCookie()).toEqual([]);
    expect(await t.db.select().from(session)).toHaveLength(0);
  });

  it('refuses every other credential or account endpoint with 404', async () => {
    const { GET, POST } = await route();
    const cookie = await signedInCookie();
    const posts = [
      'sign-in/social',
      'sign-in/username',
      'sign-up/email',
      'forget-password',
      'request-password-reset',
      'reset-password',
      'change-password',
      'set-password',
      'change-email',
      'update-user',
      'delete-user',
      'revoke-session',
      'revoke-sessions',
      'revoke-other-sessions',
      'send-verification-email',
      'link-social',
      'unlink-account',
      'refresh-token',
      'get-access-token',
    ];
    for (const path of posts) {
      expect((await POST(request('POST', path, { email: 'admin@a.test', password: PASSWORD, newPassword: 'x'.repeat(12) }, cookie))).status, path).toBe(404);
    }
    for (const path of ['list-sessions', 'list-accounts', 'verify-email?token=x', 'reset-password/x', 'callback/google', 'error', 'ok', 'sign-in/email']) {
      expect((await GET(request('GET', path, undefined, cookie))).status, path).toBe(404);
    }
    // POST to the allowed GET path and GET to the allowed POST path are refused too
    expect((await POST(request('POST', 'get-session', {}, cookie))).status).toBe(404);
    expect((await GET(request('GET', 'sign-out', undefined, cookie))).status).toBe(404);
    expect(await t.db.select().from(session)).toHaveLength(1); // no session revoked, none added
  });

  it('keeps GET get-session and POST sign-out working', async () => {
    const { GET, POST } = await route();
    const cookie = await signedInCookie();
    const got = await GET(request('GET', 'get-session', undefined, cookie));
    expect(got.status).toBe(200);
    expect(((await got.json()) as { user: { id: string } }).user).toMatchObject({ id: 'U-ADMIN-A', role: 'admin', orgId: 'ORG-A' });
    const out = await POST(request('POST', 'sign-out', {}, cookie));
    expect(out.status).toBe(200);
    expect(await t.db.select().from(session).where(eq(session.userId, 'U-ADMIN-A'))).toHaveLength(0);
    const after = await GET(request('GET', 'get-session', undefined, cookie));
    expect(after.status).toBe(200);
    expect(await after.json()).toBeNull();
  });
});
