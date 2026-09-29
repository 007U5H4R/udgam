'use server';

// PLANTED FIXTURE for tests/guard-coverage.test.ts (a stand-in for src/app). Never routed or imported.
import { requireSession } from '../../../../../src/app/_auth/require';

/** Reported: an (admin) action guarded with the buyer role. */
export async function approve() {
  await requireSession('buyer', { action: true });
}
