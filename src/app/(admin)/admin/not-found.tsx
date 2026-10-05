import type { Metadata } from 'next';
import { NotFoundPage } from '../../../components/ui/NotFound';
import { RailShell } from '../../../components/ui/Rail';
import { t } from '../../../lib/i18n';
import '../../../styles/admin.css';

// An unknown or another organisation's batch, run or plot under /admin (DES-104): the same 404 for both
// (EVAL-080), now inside the admin shell with the shared not-found card and a way back to Review.
// Agreements keep their nearer, list-shaped not-found (agreements/[id]/not-found.tsx).
export const metadata: Metadata = { title: 'Not found · Udgam' };

export default function AdminNotFound() {
  return (
    <RailShell>
      <NotFoundPage title={t('notFound.title')} body={t('notFound.body')} backHref="/admin" backLabel={t('notFound.toReview')} />
    </RailShell>
  );
}
