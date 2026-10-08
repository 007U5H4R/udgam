'use server';

// PLANTED FIXTURE for tests/guard-coverage.test.ts: every export here breaks the guard rule and must be
// reported. Never imported by the app.

import { organisations } from '../../src/lib/db/schema';
import { createDb, getDb } from '../../src/lib/db/client';
import type { Role } from '../../src/lib/auth/session';
import { requireSession } from '../../src/app/_auth/require';

/** No guard at all. */
export async function leakOrgs() {
  return getDb().select().from(organisations);
}

/** Reads the database before the guard. */
export async function guardTooLate() {
  const rows = await getDb().select().from(organisations);
  await requireSession('admin', { action: true });
  return rows;
}

/** Calls the guard without awaiting it, so a refusal never stops the read. */
export async function guardNotAwaited() {
  void requireSession('admin', { action: true });
  return getDb().select().from(organisations);
}

/** Guards only on one branch. */
export async function guardOnOneBranch(strict: boolean) {
  if (strict) await requireSession('admin', { action: true });
  return getDb().select().from(organisations);
}

/** An exported arrow action with no guard. */
export const arrowLeak = async () => getDb().select().from(organisations);

/** Swallows the guard's refusal in a catch that neither returns nor throws, then reads anyway. */
export async function swallowCatch() {
  try {
    await requireSession('admin', { action: true });
  } catch (err) {
    console.error(err);
  }
  return getDb().select().from(organisations);
}

/** Calls a helper imported from src/lib/db before the guard. */
export async function importedDbHelperBefore() {
  const { db } = createDb('file::memory:');
  await requireSession('admin', { action: true });
  return db.select().from(organisations);
}

async function allOrgs() {
  return getDb().select().from(organisations);
}

/** Calls a local function that reads the database before the guard. */
export async function localDbHelperBefore() {
  const rows = await allOrgs();
  await requireSession('admin', { action: true });
  return rows;
}

/** The role comes from input, so the guard cannot be checked (or trusted). */
export async function roleFromInput(role: Role) {
  await requireSession(role, { action: true });
  return getDb().select().from(organisations);
}
