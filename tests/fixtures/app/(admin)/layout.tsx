// PLANTED FIXTURE for tests/guard-coverage.test.ts (a stand-in for src/app). Never routed or imported.
import type { ReactNode } from 'react';
import { requireSession } from '../../../../src/app/_auth/require';

/** Reported: the (admin) layout guarded with the buyer role. */
export default async function Layout({ children }: { children: ReactNode }) {
  await requireSession('buyer');
  return children;
}
