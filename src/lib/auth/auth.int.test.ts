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

  it('has public sign-up disabled (4xx) and creates no user', async () => {
    const auth = await newAuth();
    const res = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ email: 'new@a.test', password: PASSWORD, name: 'New', role: 'admin', orgId: 'ORG-A' }),
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await t.db.select().from(user)).toHaveLength(0);
  });

  it('never lets a client set role or orgId through update-user', async () => {
    await addOrg(t.db, 'ORG-B', 'fpo');
    await addUser(t.db, { id: 'U-AGENT-A', email: 'agent@a.test', password: PASSWORD, role: 'agent', orgId: 'ORG-A' });
    const auth = await newAuth();
    const cookie = cookieHeader(await auth.api.signInEmail({ body: { email: 'agent@a.test', password: PASSWORD }, asResponse: true }));
    await auth.handler(
      new Request('http://localhost:3000/api/auth/update-user', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', cookie },
        body: JSON.stringify({ role: 'admin', orgId: 'ORG-B' }),
      }),
    );
    const [row] = await t.db.select().from(user).where(eq(user.id, 'U-AGENT-A'));
    expect(row).toMatchObject({ role: 'agent', orgId: 'ORG-A' });
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
});
