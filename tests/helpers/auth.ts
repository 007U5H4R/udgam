import { hashPassword } from 'better-auth/crypto';
import { writeTx, type Db } from '../../src/lib/db/client';
import { account, organisations, user } from '../../src/lib/db/schema';
import type { Role } from '../../src/lib/auth/session';

// Test-only helpers for Better Auth users (TKT-04). Seeds write through writeTx like every app write.

export type TestUser = { id: string; email: string; password: string; role: Role; orgId: string };

export async function addOrg(db: Db, id: string, type: 'fpo' | 'buyer' | 'processor', name = id): Promise<void> {
  await writeTx(db, (tx) => tx.insert(organisations).values({ id, type, name }).onConflictDoNothing().then(() => undefined));
}

/** A user with an email + password credential, as seed-accounts.ts writes them. */
export async function addUser(db: Db, u: TestUser): Promise<TestUser> {
  const hash = await hashPassword(u.password);
  await writeTx(db, async (tx) => {
    await tx.insert(user).values({ id: u.id, name: u.id, email: u.email, emailVerified: true, role: u.role, orgId: u.orgId });
    await tx.insert(account).values({ id: `${u.id}-cred`, accountId: u.id, providerId: 'credential', userId: u.id, password: hash, updatedAt: new Date() });
  });
  return u;
}

/** The Cookie header value from a Better Auth response's Set-Cookie lines. */
export function cookieHeader(res: Response | Headers): string {
  const headers = res instanceof Headers ? res : res.headers;
  return headers
    .getSetCookie()
    .map((c) => c.split(';')[0]!)
    .join('; ');
}
