'use server';

// FIXTURE for tests/guard-coverage.test.ts: every export here follows the guard rule and must NOT be
// reported. Never imported by the app.

import { eq } from 'drizzle-orm';
import { requireSession } from '../../src/app/_auth/require';
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
