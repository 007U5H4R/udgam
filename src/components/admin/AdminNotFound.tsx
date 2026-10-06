import { NotFoundPage } from '../ui/NotFound';
import { RailShell, type RailSection } from '../ui/Rail';
import { t, type MessageKey } from '../../lib/i18n';
import '../../styles/admin.css';

// The admin not-found inside the admin shell (DES-104), with the way back to the list the bad link came
// from (DES-115): a batch ID goes back to Batches, a plot ID to Plots, a review ID to Review, and the rail
// marks that section. An unknown and another organisation's ID read the same (EVAL-080).
const BACK: Record<Exclude<RailSection, 'phones'>, { href: string; label: MessageKey }> = {
  review: { href: '/admin', label: 'notFound.toReview' },
  plots: { href: '/admin/plots', label: 'notFound.toPlots' },
  batches: { href: '/admin/batches', label: 'notFound.toBatches' },
};

/** `section`: the list to go back to. Absent: back to Review with no section marked (any other admin not-found). */
export function AdminNotFound({ section }: { section?: keyof typeof BACK }) {
  const back = BACK[section ?? 'review'];
  return (
    <RailShell current={section}>
      <NotFoundPage title={t('notFound.title')} body={t('notFound.body')} backHref={back.href} backLabel={t(back.label)} />
    </RailShell>
  );
}
