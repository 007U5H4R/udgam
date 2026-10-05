import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '../admin/QueueList';
import pill from '../ui/Pill.module.css';
import { adminStatus, buyerStatus, rowFacts, type AgreementView } from '../../lib/agreements/read';
import { t } from '../../lib/i18n';
import { AgreementRow, Brand, EmptyCard, ErrorCard, ListLoading } from './parts';
import '../../styles/admin.css';
import './agreements.css';

// The list column of the agreement screens (Design.md §28.1 screens 1 and 5, final/contract.html
// buyerList / admin-agreement list): a Batches back link (the buyer has no rail; admin agreements live
// under Batches), the eyebrow, the h1 with its lit count, the sub line and the rows, or the loading,
// empty and error states. The buyer's "New agreement" pill is the screen's primary only on the list
// page; beside an open detail it is a ghost pill, so each screen has one primary (A6/Q10, like M-001's
// BatchList `primary`).

export type ListState = 'data' | 'loading' | 'empty' | 'error';

export function AgreementList({
  side,
  orgName,
  items,
  state,
  currentId,
  primaryNew = false,
}: {
  side: 'buyer' | 'fpo';
  orgName: string;
  items: AgreementView[];
  state: ListState;
  currentId?: string;
  primaryNew?: boolean;
}) {
  const buyer = side === 'buyer';
  const base = buyer ? '/buyer/agreements' : '/admin/agreements';
  const live = state === 'data' && items.length > 0;
  const newPill = (extra: string): ReactNode => (
    <Link className={`${pill.pill} ${primaryNew ? '' : pill.ghost} ${extra}`} href="/buyer/agreements/new" data-testid="new-agreement">
      <Icon name="arrowRight" />
      {t('agreements.new.pill')}
    </Link>
  );
  return (
    <section className="queue" aria-labelledby="q-h">
      <Brand />
      <header className="q-head">
        <Link className="back" href={buyer ? '/buyer' : '/admin/batches'}>
          <Icon name="arrowLeft" />
          {t('agreements.toBatches')}
        </Link>
        <p className="eyebrow">{t('agreements.eyebrow', { org: orgName })}</p>
        <h1 id="q-h" tabIndex={-1}>
          {live ? (
            <>
              <span className="lit">{items.length}</span>{' '}
            </>
          ) : null}
          {t(buyer ? 'agreements.buyer.title' : 'agreements.fpo.title')}
        </h1>
        {live ? <p className="q-sub">{t(buyer ? 'agreements.buyer.sub' : 'agreements.fpo.sub')}</p> : null}
      </header>
      {state === 'loading' ? (
        <ListLoading label={t(buyer ? 'agreements.buyer.loading' : 'agreements.fpo.loading')} />
      ) : state === 'error' ? (
        <ErrorCard title={t(buyer ? 'agreements.buyer.errTitle' : 'agreements.fpo.errTitle')} body={t('agreements.nothingChanged')} retryHref={base} />
      ) : state === 'empty' || items.length === 0 ? (
        <EmptyCard
          title={t('agreements.empty.title')}
          body={t(buyer ? 'agreements.buyer.emptyBody' : 'agreements.fpo.emptyBody')}
          action={buyer ? <div className="head-acts">{newPill('')}</div> : undefined}
        />
      ) : (
        <>
          {buyer ? <div className="q-new">{newPill('')}</div> : null}
          <ul className="q-list" aria-label={t(buyer ? 'agreements.buyer.listLabel' : 'agreements.fpo.title')}>
            {items.map((v) => (
              <AgreementRow
                key={v.row.id}
                href={`${base}/${encodeURIComponent(v.row.id)}`}
                id={v.row.id}
                other={buyer ? v.fpoName : v.buyerName}
                kg={v.row.agreedKg}
                facts={rowFacts(v.row)}
                status={buyer ? buyerStatus(v) : adminStatus(v)}
                current={v.row.id === currentId}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
