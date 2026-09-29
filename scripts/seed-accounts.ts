// Seeds the demo organisations and one account per role and org (technical-plan TSK-04.5):
// two FPOs (Hosahalli FPO, and a second FPO for cross-org tests), two buyers, and `agent@` + `admin@`
// per FPO and `buyer@` per buyer. Idempotent: re-running keeps IDs, resets the passwords and clears
// the accounts' sign-in failure counts (TKT-19), as a password reset would.
//
// Passwords come from SEED_PASSWORD. Only when NODE_ENV is explicitly `development` or `test` does a
// demo default stand in; otherwise a missing SEED_PASSWORD stops the seed. The password is never printed.
//
// Usage: NODE_ENV=development [DATA_DIR=.e2e-data] pnpm exec tsx scripts/seed-accounts.ts
//        SEED_PASSWORD=… pnpm exec tsx scripts/seed-accounts.ts
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashPassword } from 'better-auth/crypto';
import { env } from '../src/lib/config/env';
import { emailKey } from '../src/lib/auth/sign-in-limit';
import { writeTx, type Db } from '../src/lib/db/client';
import { account, organisations, rateLimits, user } from '../src/lib/db/schema';
import type { Role } from '../src/lib/auth/session';
import { inArray } from 'drizzle-orm';

/** Demo-only default for dev and test databases. Used only when NODE_ENV is explicitly development or test. */
export const DEV_SEED_PASSWORD = 'kodagu-coffee-demo';

type Org = { id: string; type: 'fpo' | 'buyer'; name: string };
export type DemoAccount = { id: string; email: string; name: string; role: Role; orgId: string };

export const DEMO_ORGS = {
  fpoA: { id: 'ORG-HOSAHALLI', type: 'fpo', name: 'Hosahalli FPO' },
  fpoB: { id: 'ORG-FPO-TEST', type: 'fpo', name: 'Second FPO (tests)' },
  buyerA: { id: 'ORG-BUYER-A', type: 'buyer', name: 'Demo Buyer A' },
  buyerB: { id: 'ORG-BUYER-B', type: 'buyer', name: 'Demo Buyer B' },
} as const satisfies Record<string, Org>;

export const DEMO_ACCOUNTS = {
  agentA: { id: 'USR-HOSAHALLI-AGENT', email: 'agent@hosahalli.udgam.test', name: 'Hosahalli field agent', role: 'agent', orgId: DEMO_ORGS.fpoA.id },
  adminA: { id: 'USR-HOSAHALLI-ADMIN', email: 'admin@hosahalli.udgam.test', name: 'Hosahalli FPO admin', role: 'admin', orgId: DEMO_ORGS.fpoA.id },
  agentB: { id: 'USR-FPOTEST-AGENT', email: 'agent@fpo-test.udgam.test', name: 'Second FPO field agent', role: 'agent', orgId: DEMO_ORGS.fpoB.id },
  adminB: { id: 'USR-FPOTEST-ADMIN', email: 'admin@fpo-test.udgam.test', name: 'Second FPO admin', role: 'admin', orgId: DEMO_ORGS.fpoB.id },
  buyerA: { id: 'USR-BUYER-A', email: 'buyer@buyer-a.udgam.test', name: 'Buyer A', role: 'buyer', orgId: DEMO_ORGS.buyerA.id },
  buyerB: { id: 'USR-BUYER-B', email: 'buyer@buyer-b.udgam.test', name: 'Buyer B', role: 'buyer', orgId: DEMO_ORGS.buyerB.id },
} as const satisfies Record<string, DemoAccount>;

/**
 * SEED_PASSWORD, or the demo default when NODE_ENV is explicitly `development` or `test`. env.ts
 * defaults an unset NODE_ENV to `development`, so the raw variable is checked too: a shell on the
 * production host without NODE_ENV must not seed real accounts with the committed default.
 */
export function seedPassword(): string {
  if (env.SEED_PASSWORD) return env.SEED_PASSWORD;
  const explicit = process.env.NODE_ENV; // not a secret; only whether it was set at all
  if ((explicit === 'development' || explicit === 'test') && env.NODE_ENV === explicit) return DEV_SEED_PASSWORD;
  throw new Error('SEED_PASSWORD is required unless NODE_ENV is explicitly development or test');
}

/** Write the demo organisations and accounts. Safe to re-run (and to run concurrently). */
export async function seedAccounts(db: Db, password: string, now = new Date()): Promise<DemoAccount[]> {
  const accounts: DemoAccount[] = Object.values(DEMO_ACCOUNTS);
  const hashes = await Promise.all(accounts.map(() => hashPassword(password)));
  const throttles = await Promise.all(accounts.map((a) => emailKey(a.email)));
  await writeTx(db, async (tx) => {
    await tx.delete(rateLimits).where(inArray(rateLimits.key, throttles));
    for (const o of Object.values(DEMO_ORGS)) await tx.insert(organisations).values(o).onConflictDoNothing();
    for (const [i, a] of accounts.entries()) {
      await tx
        .insert(user)
        .values({ id: a.id, name: a.name, email: a.email, emailVerified: true, role: a.role, orgId: a.orgId, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: user.id, set: { name: a.name, email: a.email, role: a.role, orgId: a.orgId, updatedAt: now } });
      await tx
        .insert(account)
        .values({ id: `${a.id}-credential`, accountId: a.id, providerId: 'credential', userId: a.id, password: hashes[i]!, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: account.id, set: { password: hashes[i]!, updatedAt: now } });
    }
  });
  return accounts;
}

async function main(): Promise<void> {
  const { closeDb, getDbReady } = await import('../src/lib/db/client');
  const { runMigrations } = await import('../src/lib/db/migrate');
  const password = seedPassword();
  const db = await getDbReady();
  try {
    await runMigrations(db);
    const accounts = await seedAccounts(db, password);
    console.log(JSON.stringify({ seeded: 'accounts', accounts: accounts.map(({ email, role, orgId }) => ({ email, role, orgId })), password: env.SEED_PASSWORD ? 'password from SEED_PASSWORD' : 'password from SEED_PASSWORD (unset: the dev/test demo default)' }));
  } finally {
    closeDb();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
