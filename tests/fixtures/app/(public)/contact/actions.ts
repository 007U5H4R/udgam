'use server';

// PLANTED FIXTURE for tests/guard-coverage.test.ts (a stand-in for src/app). Never routed or imported.
import { getDb } from '../../../../../src/lib/db/client';
import { organisations } from '../../../../../src/lib/db/schema';

/** Reported: a (public) Server Action that is not on the allowlist. */
export async function send() {
  return getDb().select().from(organisations);
}
