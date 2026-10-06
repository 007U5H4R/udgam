// @vitest-environment node
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addOrg, cookieHeader } from '../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { account, organisations, rateLimits, session, user } from '../db/schema';

// SEC-001 (TKT-28): production accounts are provisioned one by one, each with its own password, and an
// operator can set a new one. Built on the seed's code path (Better Auth's hashPassword, direct rows).

let t: TempDb;
beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  await addOrg(t.db, 'ORG-FPO1', 'fpo');
  await addOrg(t.db, 'ORG-BUY1', 'buyer');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await t.cleanup();
});

const lib = () => import('./accounts');
const signIn = async (email: string, password: string) => {
  const auth = (await import('./auth')).createAuth(t.db);
  return auth.api.signInEmail({ body: { email, password }, asResponse: true });
};
const hashOf = async (userId: string) => (await t.db.select({ p: account.password }).from(account).where(eq(account.userId, userId)))[0]?.p;

describe('generatePassword', () => {
  it('is long, URL-safe and different every time', async () => {
    const { generatePassword } = await lib();
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[A-Za-z0-9_-]{32}$/); // 24 random bytes, base64url
      seen.add(p);
    }
    expect(seen.size).toBe(50);
  });
});

describe('createAccount (SEC-001)', () => {
  it('creates a user with an opaque id, the role and org asked for, and a credential that signs in', async () => {
    const { createAccount, generatePassword } = await lib();
    const pw = generatePassword();
    const r = await createAccount(t.db, { name: 'Asha K.', email: 'Asha@FPO1.example', role: 'admin', orgId: 'ORG-FPO1' }, pw);
    expect(r.userId).toMatch(/^USR-[0-9A-HJKMNP-TV-Z]{8}$/); // EXE13: no name, org or role in the id
    const [u] = await t.db.select().from(user).where(eq(user.id, r.userId));
    expect(u).toMatchObject({ name: 'Asha K.', email: 'asha@fpo1.example', role: 'admin', orgId: 'ORG-FPO1', emailVerified: true });
    expect(r.email).toBe('asha@fpo1.example');
    expect((await signIn('asha@fpo1.example', pw)).status).toBe(200);
    expect((await signIn('asha@fpo1.example', 'not the password at all')).status).toBe(401);
  });

  it('two accounts never share a password hash, and neither password opens the other account', async () => {
    const { createAccount, generatePassword } = await lib();
    const pa = generatePassword();
    const pb = generatePassword();
    const a = await createAccount(t.db, { name: 'A', email: 'a@fpo1.example', role: 'agent', orgId: 'ORG-FPO1' }, pa);
    const b = await createAccount(t.db, { name: 'B', email: 'b@fpo1.example', role: 'agent', orgId: 'ORG-FPO1' }, pb);
    const [ha, hb] = [await hashOf(a.userId), await hashOf(b.userId)];
    expect(ha).toBeTruthy();
    expect(hb).toBeTruthy();
    expect(ha).not.toBe(hb);
    expect(pa).not.toBe(pb);
    expect((await signIn('a@fpo1.example', pb)).status).toBe(401);
    expect((await signIn('b@fpo1.example', pa)).status).toBe(401);
  });

  it('refuses a password another account already uses (no shared password, even one typed in)', async () => {
    const { createAccount } = await lib();
    const shared = 'one password for two people';
    await createAccount(t.db, { name: 'A', email: 'a@fpo1.example', role: 'agent', orgId: 'ORG-FPO1' }, shared);
    await expect(createAccount(t.db, { name: 'B', email: 'b@fpo1.example', role: 'admin', orgId: 'ORG-FPO1' }, shared)).rejects.toThrow(/password_in_use/);
    expect(await t.db.select().from(user).where(eq(user.email, 'b@fpo1.example'))).toHaveLength(0);
  });

  it('refuses a duplicate email, an unknown org, a role that does not fit the org, and a weak password; writes nothing', async () => {
    const { createAccount, generatePassword } = await lib();
    await createAccount(t.db, { name: 'A', email: 'a@fpo1.example', role: 'agent', orgId: 'ORG-FPO1' }, generatePassword());
    await expect(createAccount(t.db, { name: 'A2', email: 'A@fpo1.example', role: 'agent', orgId: 'ORG-FPO1' }, generatePassword())).rejects.toThrow(/email_taken/);
    await expect(createAccount(t.db, { name: 'C', email: 'c@x.example', role: 'agent', orgId: 'ORG-NOPE' }, generatePassword())).rejects.toThrow(/unknown_org/);
    await expect(createAccount(t.db, { name: 'D', email: 'd@x.example', role: 'agent', orgId: 'ORG-BUY1' }, generatePassword())).rejects.toThrow(/role_org_mismatch/);
    await expect(createAccount(t.db, { name: 'E', email: 'e@x.example', role: 'buyer', orgId: 'ORG-BUY1' }, 'short')).rejects.toThrow(/weak_password/);
    await expect(createAccount(t.db, { name: 'F', email: 'not-an-email', role: 'buyer', orgId: 'ORG-BUY1' }, generatePassword())).rejects.toThrow(/bad_email/);
    await expect(createAccount(t.db, { name: ' ', email: 'g@x.example', role: 'buyer', orgId: 'ORG-BUY1' }, generatePassword())).rejects.toThrow(/bad_name/);
    expect((await t.db.select().from(user)).map((u) => u.email)).toEqual(['a@fpo1.example']);
  });

  it('can create the organisation first (an empty production database), of the type the role needs', async () => {
    const { createAccount, generatePassword } = await lib();
    const r = await createAccount(t.db, { name: 'Ravi', email: 'ravi@buyer.example', role: 'buyer', newOrgName: 'Malnad Roasters' }, generatePassword());
    const [o] = await t.db.select().from(organisations).where(eq(organisations.id, r.orgId));
    expect(o).toMatchObject({ type: 'buyer', name: 'Malnad Roasters' });
    expect(r.orgId).toMatch(/^ORG-[0-9A-HJKMNP-TV-Z]{8}$/);
  });
});

describe('generated passwords skip the shared-password scan (a 192-bit random value cannot collide)', () => {
  it('create and set-password with { generated: true } verify against no other credential; a typed password still does', async () => {
    const verify = vi.fn();
    vi.doMock('better-auth/crypto', async (importOriginal) => {
      const real = await importOriginal<typeof import('better-auth/crypto')>();
      return { ...real, verifyPassword: (a: Parameters<typeof real.verifyPassword>[0]) => (verify(), real.verifyPassword(a)) };
    });
    try {
      const { createAccount, setAccountPassword, generatePassword } = await lib();
      await createAccount(t.db, { name: 'A', email: 'a@fpo1.example', role: 'agent', orgId: 'ORG-FPO1' }, generatePassword(), { generated: true });
      await createAccount(t.db, { name: 'B', email: 'b@fpo1.example', role: 'agent', orgId: 'ORG-FPO1' }, generatePassword(), { generated: true });
      await setAccountPassword(t.db, 'a@fpo1.example', generatePassword(), { generated: true });
      expect(verify).not.toHaveBeenCalled();
      await setAccountPassword(t.db, 'a@fpo1.example', 'a password somebody typed');
      expect(verify).toHaveBeenCalledTimes(1); // checked against B's credential (its own is skipped)
    } finally {
      vi.doUnmock('better-auth/crypto');
    }
  });
});

describe('setAccountPassword (SEC-001)', () => {
  it('replaces the password, ends the account’s sessions and clears its sign-in throttle', async () => {
    const { createAccount, setAccountPassword, generatePassword } = await lib();
    const old = generatePassword();
    const { userId } = await createAccount(t.db, { name: 'A', email: 'a@fpo1.example', role: 'admin', orgId: 'ORG-FPO1' }, old);
    const signedIn = await signIn('a@fpo1.example', old);
    expect(signedIn.status).toBe(200);
    expect(cookieHeader(signedIn)).toMatch(/session_token/);
    expect(await t.db.select().from(session).where(eq(session.userId, userId))).toHaveLength(1);
    const { reserveSignIn } = await import('./sign-in-limit');
    await reserveSignIn(t.db, 'a@fpo1.example', '203.0.113.9');
    const throttles = async () => (await t.db.select().from(rateLimits)).filter((r) => r.key.startsWith('signin:') && !r.key.startsWith('signin:ip:'));
    expect((await throttles()).length).toBeGreaterThan(0);

    const fresh = generatePassword();
    expect(await setAccountPassword(t.db, 'A@fpo1.example', fresh)).toEqual({ userId, email: 'a@fpo1.example', sessionsEnded: 1 });
    expect(await t.db.select().from(session).where(eq(session.userId, userId))).toHaveLength(0);
    expect(await throttles()).toEqual([]);
    expect((await signIn('a@fpo1.example', old)).status).toBe(401);
    expect((await signIn('a@fpo1.example', fresh)).status).toBe(200);
  });

  it('refuses an unknown email, a weak password and another account’s password', async () => {
    const { createAccount, setAccountPassword, generatePassword } = await lib();
    const pa = generatePassword();
    await createAccount(t.db, { name: 'A', email: 'a@fpo1.example', role: 'agent', orgId: 'ORG-FPO1' }, pa);
    await createAccount(t.db, { name: 'B', email: 'b@fpo1.example', role: 'agent', orgId: 'ORG-FPO1' }, generatePassword());
    await expect(setAccountPassword(t.db, 'nobody@fpo1.example', generatePassword())).rejects.toThrow(/unknown_account/);
    await expect(setAccountPassword(t.db, 'b@fpo1.example', 'tiny')).rejects.toThrow(/weak_password/);
    await expect(setAccountPassword(t.db, 'b@fpo1.example', pa)).rejects.toThrow(/password_in_use/);
  });

  it('may set the same password again on the same account (only other accounts count as sharing)', async () => {
    const { createAccount, setAccountPassword } = await lib();
    const pw = 'a perfectly long password';
    await createAccount(t.db, { name: 'A', email: 'a@fpo1.example', role: 'agent', orgId: 'ORG-FPO1' }, pw);
    await expect(setAccountPassword(t.db, 'a@fpo1.example', pw)).resolves.toMatchObject({ email: 'a@fpo1.example' });
  });
});
