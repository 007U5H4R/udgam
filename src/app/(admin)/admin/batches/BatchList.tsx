import Link from 'next/link';
import { BatchRow } from '../../../../components/buyer/BatchRow';
import { ListLoading, StateCard } from '../../../../components/buyer/BatchStates';
import { cropLabel, pickingsLabel } from '../../../../components/buyer/labels';
import screen from '../../../../components/buyer/BatchScreen.module.css';
import pill from '../../../../components/ui/Pill.module.css';
import { formatKg, formatScore } from '../../../../lib/batches/format';
import type { BatchSummary } from '../../../../lib/batches/read';
import type { ViewState } from '../../../../lib/batches/view-state';
import { t } from '../../../../lib/i18n';

// The list column of /admin/batches and /admin/batches/[batchId] (admin.html queue grammar): heading,
// the "New batch" pill, and the org's batches with status, crop, kilograms, score and pickings.

export function BatchList({
  orgName,
  batches,
  state,
  currentId,
  primary,
}: {
  orgName: string;
  batches: BatchSummary[];
  state: ViewState | null;
  currentId?: string;
  /** The "New batch" pill is the screen's primary action only on the list page. */
  primary: boolean;
}) {
  return (
    <section className={screen.queue} aria-labelledby="batches-h">
      <header>
        <p className={screen.eyebrow}>{t('batches.eyebrow', { org: orgName })}</p>
        <h1 className={screen.h1} id="batches-h">
          {t('batches.title')}
        </h1>
        <p className={screen.sub}>{t('batches.sub')}</p>
        <div className={screen.headActions}>
          <Link className={`${pill.pill} ${primary ? '' : pill.ghost}`} href="/admin/batches/new">
            {t('batches.new')}
          </Link>
        </div>
      </header>
      {state === 'loading' ? (
        <ListLoading label={t('batches.loading')} />
      ) : state === 'error' ? (
        <StateCard
          kind="error"
          title={t('batches.error.title')}
          body={t('batches.error.body')}
          action={
            <Link className={`${pill.pill} ${pill.amber} ${screen.statePill}`} href="/admin/batches">
              {t('batches.error.retry')}
            </Link>
          }
        />
      ) : state === 'empty' || batches.length === 0 ? (
        <StateCard kind="empty" title={t('batches.empty.title')} body={t('batches.empty.body')} />
      ) : (
        <ul className={screen.list} aria-label={t('batches.list.label')}>
          {batches.map((b) => (
            <BatchRow
              key={b.batchId}
              href={`/admin/batches/${encodeURIComponent(b.batchId)}`}
              batchId={b.batchId}
              kg={t('batches.kg', { kg: formatKg(b.quantityKg) })}
              facts={t('batches.row.facts', { crop: cropLabel(b.crop), pickings: pickingsLabel(b.pickings), score: formatScore(b.integrityScore) })}
              status={t(b.status === 'open' ? 'batches.row.open' : 'batches.row.transferred')}
              statusIcon={b.status === 'open' ? 'box' : 'lock'}
              current={b.batchId === currentId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
