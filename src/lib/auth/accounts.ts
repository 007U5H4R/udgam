import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { writeTx, type Db } from '../db/client';
import { account, organisations, session, user } from '../db/schema';
import { newId } from '../ids';
import type { Role } from './session';
import { clearSignInThrottles } from './sign-in-limit';

// Production account provisioning (SEC-001, TKT-28): one account at a time, each with its own password,
// and a set-password path. Public sign-up stays off (auth.ts `disableSignUp`), so these functions and the
// dev/test seed are the only ways a credential is written. They use the seed's code path: Better Auth's
// own `hashPassword` and direct rows, written through writeTx (the one-writer rule).
//
// Used by `pnpm accounts:create` and `pnpm accounts:set-password` (scripts/accounts-*.ts). A password is
// an argument here and nothing else: it is never logged, returned or put in an error message.

/** Which organisation type each role belongs to (§10): agents and admins work for an FPO. */
export const ORG_TYPE_FOR_ROLE: Record<Role, 'fpo' | 'buyer' | 'processor'> = { agent: 'fpo', admin: 'fpo', buyer: 'buyer', processor: 'processor' };

/** Better Auth's own bounds are 8–128; an operator-chosen password must be at least 12. */
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/** A refusal. `code` is stable for the CLI and the tests; the message never carries a password. */
export class AccountError extends Error {
  constructor(
    readonly code: 'weak_password' | 'password_in_use' | 'email_taken' | 'unknown_org' | 'role_org_mismatch' | 'unknown_account' | 'bad_email' | 'bad_name',
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'AccountError';
  }
}

/** A strong random password: 24 bytes from the CSPRNG (192 bits), base64url, 32 characters. */
export function generatePassword(): string {
  return randomBytes(24).toString('base64url');
}

const normaliseEmail = (email: string) => email.trim().toLowerCase();

function checkPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new AccountError('weak_password', `a password is ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters`);
  }
}

/**
 * No two accounts share a password (SEC-001). Hashes are salted, so the check verifies the candidate
 * against every other credential: one scrypt per account, a few seconds at pilot scale.
 */
async function assertNotInUse(db: Db, password: string, exceptUserId?: string): Promise<void> {
  const rows = await db.select({ userId: account.userId, hash: account.password }).from(account).where(eq(account.providerId, 'credential'));
  for (const r of rows) {
    if (r.userId === exceptUserId || !r.hash) continue;
    if (await verifyPassword({ hash: r.hash, password })) throw new AccountError('password_in_use', 'another account already has this password');
  }
}

/** `generated`: the password came from generatePassword (192 random bits), so no other account can have it. */
export type PasswordOptions = { generated?: boolean; now?: Date };

export type NewAccount = { name: string; email: string; role: Role } & ({ orgId: string; newOrgName?: undefined } | { orgId?: undefined; newOrgName: string });

/**
 * Create one account with its own credential. With `newOrgName` the organisation is created first, of
 * the type the role needs (an empty production database has none). Refuses (AccountError, nothing
 * written) a duplicate email, an unknown organisation, a role that does not fit the organisation's type,
 * a weak password, or a password another account already has.
 */
export async function createAccount(db: Db, a: NewAccount, password: string, o: PasswordOptions = {}): Promise<{ userId: string; orgId: string; email: string }> {
  const now = o.now ?? new Date();
  const email = normaliseEmail(a.email);
  const name = a.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError('bad_email', 'not an email address');
  if (name === '') throw new AccountError('bad_name', 'a name is required');
  checkPassword(password);
  const wantType = ORG_TYPE_FOR_ROLE[a.role];

  if (a.orgId !== undefined) {
    const [org] = await db.select({ type: organisations.type }).from(organisations).where(eq(organisations.id, a.orgId));
    if (!org) throw new AccountError('unknown_org', `no organisation ${a.orgId}`);
    if (org.type !== wantType) throw new AccountError('role_org_mismatch', `a ${a.role} belongs to a ${wantType} organisation, not a ${org.type}`);
  } else if (a.newOrgName.trim() === '') {
    throw new AccountError('bad_name', 'an organisation name is required');
  }
  if ((await db.select({ id: user.id }).from(user).where(eq(user.email, email))).length > 0) throw new AccountError('email_taken', 'an account with this email exists');
  if (!o.generated) await assertNotInUse(db, password);

  const hash = await hashPassword(password);
  const userId = newId('USR-'); // opaque, like Better Auth's own ids (EXE13): it may reach anchored payloads
  const orgId = a.orgId ?? newId('ORG-');
  await writeTx(db, async (tx) => {
    // Re-checked inside the write: two runs at once must not both create the email.
    if ((await tx.select({ id: user.id }).from(user).where(eq(user.email, email))).length > 0) throw new AccountError('email_taken', 'an account with this email exists');
    if (a.orgId === undefined) await tx.insert(organisations).values({ id: orgId, type: wantType, name: a.newOrgName.trim() });
    await tx.insert(user).values({ id: userId, name, email, emailVerified: true, role: a.role, orgId, createdAt: now, updatedAt: now });
    await tx.insert(account).values({ id: `${userId}-credential`, accountId: userId, providerId: 'credential', userId, password: hash, createdAt: now, updatedAt: now });
  });
  return { userId, orgId, email };
}

/**
 * Give an existing account a new password: replaces (or adds) its credential, ends every session it has
 * (a password change signs the old holder out) and clears its sign-in throttles, as the seed does.
 */
export async function setAccountPassword(db: Db, emailIn: string, password: string, o: PasswordOptions = {}): Promise<{ userId: string; email: string; sessionsEnded: number }> {
  const now = o.now ?? new Date();
  const email = normaliseEmail(emailIn);
  checkPassword(password);
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!u) throw new AccountError('unknown_account', 'no account with this email');
  if (!o.generated) await assertNotInUse(db, password, u.id);
  const hash = await hashPassword(password);
  const sessionsEnded = await writeTx(db, async (tx) => {
    const [cred] = await tx
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, u.id), eq(account.providerId, 'credential')));
    if (cred) await tx.update(account).set({ password: hash, updatedAt: now }).where(eq(account.id, cred.id));
    else await tx.insert(account).values({ id: `${u.id}-credential`, accountId: u.id, providerId: 'credential', userId: u.id, password: hash, createdAt: now, updatedAt: now });
    const ended = await tx.delete(session).where(eq(session.userId, u.id)).returning({ id: session.id });
    await clearSignInThrottles(tx, [email]);
    return ended.length;
  });
  return { userId: u.id, email, sessionsEnded };
}
