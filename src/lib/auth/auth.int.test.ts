// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addOrg, addUser, cookieHeader } from '../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { organisations, session, user } from '../db/schema';

// TSK-04.1: Better Auth email sign-in with role and organisation on the user.

let t: TempDb;

beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  await addOrg(t.db, 'ORG-A', 'fpo');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await t.cleanup();
});

const newAuth = async () => (await import('./auth')).createAuth(t.db);
const PASSWORD = 'correct horse battery';

describe('Better Auth on the app database', () => {
  it('signs in a seeded user and the session carries role and orgId', async () => {
    await addUser(t.db, { id: 'U-ADMIN-A', email: 'admin@a.test', password: PASSWORD, role: 'admin', orgId: 'ORG-A' });
    const auth = await newAuth();
    const res = await auth.api.signInEmail({ body: { email: 'admin@a.test', password: PASSWORD }, asResponse: true });
    expect(res.status).toBe(200);
    const cookie = cookieHeader(res);
    expect(cookie).toMatch(/better-auth\.session_token=/);

    const s = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(s?.user).toMatchObject({ id: 'U-ADMIN-A', role: 'admin', orgId: 'ORG-A' });
    const { readSession } = await import('./session');
    expect(await readSession(auth, new Headers({ cookie }))).toEqual({ userId: 'U-ADMIN-A', orgId: 'ORG-A', role: 'admin' });
    expect(await t.db.select().from(session).where(eq(session.userId, 'U-ADMIN-A'))).toHaveLength(1);
  });

  it('rejects a wrong password without saying which field was wrong', async () => {
    await addUser(t.db, { id: 'U-AGENT-A', email: 'agent@a.test', password: PASSWORD, role: 'agent', orgId: 'ORG-A' });
    const auth = await newAuth();
    const wrongPw = await auth.api.signInEmail({ body: { email: 'agent@a.test', password: 'not the password' }, asResponse: true });
    const noUser = await auth.api.signInEmail({ body: { email: 'nobody@a.test', password: PASSWORD }, asResponse: true });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(await wrongPw.json()).toEqual(await noUser.json());
  });

  /** A JSON POST to Better Auth's HTTP handler, from the app's own origin. */
  const post = (auth: Awaited<ReturnType<typeof newAuth>>, path: string, body: unknown, cookie?: string) =>
    auth.handler(
      new Request(`http://localhost:3000/api/auth/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      }),
    );

  it('has public sign-up disabled (400 EMAIL_PASSWORD_SIGN_UP_DISABLED) and creates no user; sign-in through the same handler works', async () => {
    await addUser(t.db, { id: 'U-ADMIN-A', email: 'admin@a.test', password: PASSWORD, role: 'admin', orgId: 'ORG-A' });
    const auth = await newAuth();
    const res = await post(auth, 'sign-up/email', { email: 'new@a.test', password: PASSWORD, name: 'New', role: 'admin', orgId: 'ORG-A' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'EMAIL_PASSWORD_SIGN_UP_DISABLED' });
    expect((await t.db.select().from(user)).map((u) => u.id)).toEqual(['U-ADMIN-A']);
    // Positive control: the same handler, origin and headers reach Better Auth's routes.
    const ok = await post(auth, 'sign-in/email', { email: 'admin@a.test', password: PASSWORD });
    expect(ok.status).toBe(200);
  });

  it('never lets a client set role or orgId through update-user (400 FIELD_NOT_ALLOWED); a name change goes through', async () => {
    await addOrg(t.db, 'ORG-B', 'fpo');
    await addUser(t.db, { id: 'U-AGENT-A', email: 'agent@a.test', password: PASSWORD, role: 'agent', orgId: 'ORG-A' });
    const auth = await newAuth();
    const cookie = cookieHeader(await auth.api.signInEmail({ body: { email: 'agent@a.test', password: PASSWORD }, asResponse: true }));
    const refused = await post(auth, 'update-user', { role: 'admin', orgId: 'ORG-B' }, cookie);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ code: 'FIELD_NOT_ALLOWED' });
    expect((await t.db.select().from(user).where(eq(user.id, 'U-AGENT-A')))[0]).toMatchObject({ role: 'agent', orgId: 'ORG-A', name: 'U-AGENT-A' });
    // Positive control: the same request shape with an allowed field reaches the handler and applies.
    const ok = await post(auth, 'update-user', { name: 'Renamed' }, cookie);
    expect(ok.status).toBe(200);
    expect((await t.db.select().from(user).where(eq(user.id, 'U-AGENT-A')))[0]).toMatchObject({ role: 'agent', orgId: 'ORG-A', name: 'Renamed' });
  });

  it('sets the session cookie HttpOnly and SameSite=Lax, without Secure outside production', async () => {
    await addUser(t.db, { id: 'U-ADMIN-A', email: 'admin@a.test', password: PASSWORD, role: 'admin', orgId: 'ORG-A' });
    const res = await (await newAuth()).api.signInEmail({ body: { email: 'admin@a.test', password: PASSWORD }, asResponse: true });
    const session = res.headers.getSetCookie().find((c) => c.startsWith('better-auth.session_token='));
    expect(session).toBeDefined();
    expect(session).toMatch(/;\s*HttpOnly(;|$)/i);
    expect(session).toMatch(/;\s*SameSite=Lax(;|$)/i);
    expect(session).not.toMatch(/;\s*Secure(;|$)/i);
  });

  it('in production the session cookie is also Secure (and __Secure- prefixed)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_SECRET', 'p'.repeat(40));
    await addUser(t.db, { id: 'U-ADMIN-A', email: 'admin@a.test', password: PASSWORD, role: 'admin', orgId: 'ORG-A' });
    const res = await (await newAuth()).api.signInEmail({ body: { email: 'admin@a.test', password: PASSWORD }, asResponse: true });
    const session = res.headers.getSetCookie().find((c) => c.startsWith('__Secure-better-auth.session_token='));
    expect(session).toBeDefined();
    expect(session).toMatch(/;\s*HttpOnly(;|$)/i);
    expect(session).toMatch(/;\s*SameSite=Lax(;|$)/i);
    expect(session).toMatch(/;\s*Secure(;|$)/i);
  });

  it('a queued write runs once even when its `then` is read more than once', async () => {
    const { serialisedWrites } = await import('./auth');
    const q = serialisedWrites(t.db).insert(organisations).values({ id: 'ORG-ONCE', type: 'fpo', name: 'once' });
    expect(typeof (q as unknown as { then: unknown }).then).toBe('function'); // a probe, as thenable checks do
    await q;
    expect(await t.db.select().from(organisations).where(eq(organisations.id, 'ORG-ONCE'))).toHaveLength(1);
  });

  it('the database refuses an unknown role and an org that does not exist', async () => {
    await expect(addUser(t.db, { id: 'U-X', email: 'x@a.test', password: PASSWORD, role: 'root' as never, orgId: 'ORG-A' })).rejects.toThrow();
    await expect(addUser(t.db, { id: 'U-Y', email: 'y@a.test', password: PASSWORD, role: 'agent', orgId: 'ORG-NOPE' })).rejects.toThrow();
    expect(await t.db.select().from(organisations)).toHaveLength(1);
  });

  it('queues its writes behind an open app transaction instead of stalling the server', async () => {
    await addUser(t.db, { id: 'U-AGENT-A', email: 'agent@a.test', password: PASSWORD, role: 'agent', orgId: 'ORG-A' });
    const auth = await newAuth();
    const { writeTx } = await import('../db/client'); // the same module instance (one FIFO) as auth.ts
    let release!: () => void;
    const held = writeTx(t.db, async (tx) => {
      await tx.insert(organisations).values({ id: 'ORG-HELD', type: 'fpo', name: 'held' });
      await new Promise<void>((r) => (release = r));
    });
    const signIn = auth.api.signInEmail({ body: { email: 'agent@a.test', password: PASSWORD }, asResponse: true });
    await new Promise((r) => setTimeout(r, 300)); // the sign-in reaches its session insert and must wait, not spin
    release();
    await held;
    expect((await signIn).status).toBe(200);
  });

  it('a production process without BETTER_AUTH_SECRET refuses to build the auth instance', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_SECRET', '');
    const { authSecret } = await import('./auth');
    expect(() => authSecret()).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('outside production without BETTER_AUTH_SECRET, every module instance in the process shares one dev secret (fix round 1)', async () => {
    // `next start` loads this module once per Turbopack runtime (route handlers, Server Actions): a cookie
    // signed at sign-in must verify in /api/capture.
    vi.stubEnv('BETTER_AUTH_SECRET', '');
    const first = (await import('./auth')).authSecret();
    vi.resetModules();
    const second = (await import('./auth')).authSecret();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });
});
