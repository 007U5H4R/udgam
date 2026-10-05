import type { Metadata } from 'next';
import { NotFoundPage } from '../../../components/ui/NotFound';
import { t } from '../../../lib/i18n';

// An unknown or another organisation's batch under /buyer (DES-104): the same 404 for both (EVAL-080),
// with the shared not-found card and a way back to Batches (the buyer has no rail, Design.md §5).
// Agreements keep their nearer, list-shaped not-found (agreements/[id]/not-found.tsx).
export const metadata: Metadata = { title: 'Not found · Udgam' };

export default function BuyerNotFound() {
  return <NotFoundPage title={t('notFound.title')} body={t('notFound.body')} backHref="/buyer" backLabel={t('notFound.toBatches')} />;
}
