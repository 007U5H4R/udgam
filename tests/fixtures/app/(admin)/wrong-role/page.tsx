// PLANTED FIXTURE for tests/guard-coverage.test.ts (a stand-in for src/app). Never routed or imported.
import { requireSession } from '../../../../../src/app/_auth/require';

/** Reported: an (admin) page guarded with another group's role. */
export default async function WrongRolePage() {
  await requireSession('agent');
  return null;
}
