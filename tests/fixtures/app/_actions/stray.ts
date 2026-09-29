'use server';

// PLANTED FIXTURE for tests/guard-coverage.test.ts (a stand-in for src/app). Never routed or imported.
import { getDb } from '../../../../src/lib/db/client';
import { organisations } from '../../../../src/lib/db/schema';

/** Reported: a Server Action outside the route groups is still reachable by POST. */
export async function listOrgs() {
  return getDb().select().from(organisations);
}
