// PLANTED FIXTURE for tests/guard-coverage.test.ts (a stand-in for src/app). Never routed or imported.
import { requireSession } from '../../../../../src/app/_auth/require';

/** Not reported: guarded with its own group's role. */
export default async function OkPage() {
  await requireSession('agent');
  return null;
}
