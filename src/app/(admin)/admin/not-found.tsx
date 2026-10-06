import type { Metadata } from 'next';
import { AdminNotFound } from '../../../components/admin/AdminNotFound';

// A not-found under /admin outside a batch, plot or review ID (DES-104): the shared card inside the admin
// shell, back to Review. A bad batch, plot or review ID has its own, back to its list (DES-115:
// batches/[batchId], plots/[plotId] and review/[runId] not-found.tsx). Agreements keep their nearer,
// list-shaped not-found (agreements/[id]/not-found.tsx).
export const metadata: Metadata = { title: 'Not found · Udgam' };

export default function NotFound() {
  return <AdminNotFound />;
}
