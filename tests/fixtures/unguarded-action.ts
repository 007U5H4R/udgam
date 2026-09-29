'use server';

// PLANTED FIXTURE for tests/guard-coverage.test.ts: every export here breaks the guard rule and must be
// reported. Never imported by the app.

import { organisations } from '../../src/lib/db/schema';
import { getDb } from '../../src/lib/db/client';
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
