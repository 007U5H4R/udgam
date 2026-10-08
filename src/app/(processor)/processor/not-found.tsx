import type { Metadata } from 'next';
import { NotFoundPage } from '../../../components/ui/NotFound';
import { RailShell } from '../../../components/ui/Rail';
import { t } from '../../../lib/i18n';
import { COPY } from '../../../lib/processing/copy';
import '../../../styles/admin.css';
import './processor.css';

// An unknown batch, or one not in this processor's custody (DES-104): the same 404 for both (EVAL-080),
// inside the processor shell with the shared not-found card and a way back to Batches.
export const metadata: Metadata = { title: 'Not found · Udgam' };

export default function ProcessorNotFound() {
  return (
    <RailShell className="proc-shell" current="batches" items={[{ id: 'batches', href: '/processor' }]} label={COPY.railLabel}>
      <NotFoundPage title={t('notFound.title')} body={t('notFound.body')} backHref="/processor" backLabel={t('notFound.toBatches')} />
    </RailShell>
  );
}
