'use server';

// FIXTURE for tests/guard-coverage.test.ts: every export here follows the guard rule and must NOT be
// reported. Never imported by the app.

import { eq } from 'drizzle-orm';
import { requireSession } from '../../src/app/_auth/require';
import { AuthError } from '../../src/lib/auth/guards';
import { getDb } from '../../src/lib/db/client';
import { farmers } from '../../src/lib/db/schema';

export async function listFarmers() {
  const { orgId } = await requireSession('admin', { action: true });
  return getDb().select().from(farmers).where(eq(farmers.orgId, orgId));
}

export const countFarmers = async () => {
  const { orgId } = await requireSession('admin', { action: true });
  return (await getDb().select().from(farmers).where(eq(farmers.orgId, orgId))).length;
};

/** A catch that rethrows (or throws its own error) keeps the guard: nothing after it runs on a refusal. */
export async function rethrowingCatch() {
  let orgId: string;
  try {
    ({ orgId } = await requireSession('admin', { action: true }));
  } catch (err) {
    if (err instanceof AuthError) throw new Error('refused');
    throw err;
  }
  return getDb().select().from(farmers).where(eq(farmers.orgId, orgId));
}

/** A catch that returns keeps the guard too. */
export async function returningCatch() {
  try {
    await requireSession('admin', { action: true });
  } catch {
    return [];
  }
  return getDb().select().from(farmers);
}

async function farmersOf(orgId: string) {
  return getDb().select().from(farmers).where(eq(farmers.orgId, orgId));
}

/** A local database helper called after the guard is fine. */
export async function localHelperAfterGuard() {
  const { orgId } = await requireSession('admin', { action: true });
  return farmersOf(orgId);
}
