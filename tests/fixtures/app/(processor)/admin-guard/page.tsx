// PLANTED FIXTURE for tests/guard-coverage.test.ts (a stand-in for src/app). Never routed or imported.
import { requireSession } from '../../../../../src/app/_auth/require';

/** Reported: a (processor) page guarded with the admin role (TKT-26: the processor is its own role, D9). */
export default async function AdminGuardPage() {
  await requireSession('admin');
  return null;
}
