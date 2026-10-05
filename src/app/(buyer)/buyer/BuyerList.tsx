import Link from 'next/link';
import { Icon } from '../../../components/buyer/Icon';
import { BatchRow } from '../../../components/buyer/BatchRow';
import { ListLoading, StateCard } from '../../../components/buyer/BatchStates';
import screen from '../../../components/buyer/BatchScreen.module.css';
import { cropLabel, plotsLabel } from '../../../components/buyer/labels';
import { Pill } from '../../../components/ui/Pill';
import pill from '../../../components/ui/Pill.module.css';
import type { BuyerBatch } from '../../../lib/batches/buyer';
import { formatKg, istDateTime } from '../../../lib/batches/format';
import { formatScore } from '../../../lib/format';
import type { ViewState } from '../../../lib/batches/view-state';
import { t } from '../../../lib/i18n';
import { signOut } from '../../(public)/sign-in/actions';

// The list column of /buyer and /buyer/batches/[batchId] (admin list grammar, TP17): the batches
// transferred to the buyer's organisation, each with score, quantity and plot count, and sign-out.

export function BuyerList({ orgName, batches, state, currentId }: { orgName: string; batches: BuyerBatch[]; state: ViewState | null; currentId?: string }) {
  return (
    <section className={screen.queue} aria-labelledby="buyer-h">
      <header>
        <p className={screen.eyebrow}>{t('buyer.eyebrow', { org: orgName })}</p>
        <h1 className={screen.h1} id="buyer-h">
          {t('batches.title')}
        </h1>
        <p className={screen.sub}>{t('buyer.sub')}</p>
        {/* M-002 touch point T1 (Design.md §28, TKT-25): the buyer reaches Agreements from this header (no rail, §5). */}
        <div className={screen.headActions}>
          <Link className={`${pill.pill} ${pill.ghost}`} href="/buyer/agreements" data-testid="agreements-link">
            <Icon name="seal" />
            {t('agreements.link.buyer')}
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
            <Link className={`${pill.pill} ${pill.amber} ${screen.statePill}`} href="/buyer">
              {t('batches.error.retry')}
            </Link>
          }
        />
      ) : state === 'empty' || batches.length === 0 ? (
        <StateCard kind="empty" title={t('shell.buyer.empty')} body={t('buyer.empty.body')} />
      ) : (
        <ul className={screen.list} aria-label={t('buyer.list.label')}>
          {batches.map((b) => (
            <BatchRow
              key={b.batchId}
              href={`/buyer/batches/${encodeURIComponent(b.batchId)}`}
              batchId={b.batchId}
              kg={t('batches.kg', { kg: formatKg(b.quantityKg) })}
              facts={t('buyer.row.facts', { crop: cropLabel(b.crop), plots: plotsLabel(b.plotCount), score: formatScore(b.integrityScore) })}
              status={t('buyer.row.from', { org: b.fromOrgName, when: istDateTime(b.transferredAt) })}
              statusIcon="box"
              current={b.batchId === currentId}
            />
          ))}
        </ul>
      )}
      <form action={signOut} className={screen.headActions}>
        <Pill variant="ghost" type="submit">
          {t('signOut')}
        </Pill>
      </form>
    </section>
  );
}
