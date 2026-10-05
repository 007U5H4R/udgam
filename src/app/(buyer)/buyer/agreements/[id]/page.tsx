import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionPanel } from '../../../../../components/agreements/ActionPanel';
import { AgreementList } from '../../../../../components/agreements/AgreementList';
import { GradeForm } from '../../../../../components/agreements/GradeForm';
import { Conditions, DetailColumn, DetailHead, DetailSkeleton, EmptyCard, OutcomeNotReleased, OutcomeReleased, StatusChip, Terms } from '../../../../../components/agreements/parts';
import { Icon } from '../../../../../components/admin/QueueList';
import { buyerBalance } from '../../../../../lib/agreements/env-chain';
import { formatInr, formatKg1, istDate } from '../../../../../lib/agreements/format';
import { gradeDisplay, type Grade } from '../../../../../lib/agreements/grades';
import { batchToGrade, buyerStatus, getAgreementView, listBuyerAgreements, type AgreementView } from '../../../../../lib/agreements/read';
import { forcedAgreementState } from '../../../../../lib/agreements/view-state';
import { orgNames } from '../../../../../lib/batches/read';
import { getDbReady } from '../../../../../lib/db/client';
import { t } from '../../../../../lib/i18n';
import { requireSession } from '../../../../_auth/require';
import { fundAgreementAction, gradeBatchAction, refundAgreementAction } from '../actions';

// /buyer/agreements/[id] (TSK-25.8, Design.md §28.1 screens 1, 3, 3r and 4): one agreement of the
// buyer's organisation. Created → fund (what moves where, the three conditions, the refund date);
// funded with a delivered batch → grade it; funded after the deadline with nothing settled → take the
// money back; otherwise the terms with the latest result and its conditions, read-only. Another
// organisation's agreement is a 404 like an unknown one (EVAL-080). `?state=loading|working` for e2e.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Agreement · Udgam' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

function Body({ v, balance, forcedWorking }: { v: AgreementView; balance: bigint | null; forcedWorking: boolean }) {
  const a = v.row;
  const amount = formatInr(a.amountPaise);
  const last = v.settlements[0];
  const toGrade = batchToGrade(v);
  const id = { agreementId: a.id };

  if (a.status === 'created') {
    return (
      <>
        <Terms v={v} side="buyer" />
        <ActionPanel
          layout="decide"
          action={fundAgreementAction}
          hidden={id}
          heading={{ id: 'fund-h', text: t('agreements.fund.title') }}
          forcedWorking={forcedWorking}
          texts={{ idle: t('agreements.fund.idle', { amount }), busy: t('agreements.fund.busy', { amount }), retry: t('agreements.retry'), noAnswer: { title: t('agreements.fund.errTitle'), body: t('agreements.fund.errBody') } }}
          note={
            <p className="dec-note">
              <Icon name="seal" />
              <span>{t('agreements.fund.note', { deadline: istDate(a.deadline) })}</span>
            </p>
          }
        >
          <p>{t('agreements.fund.body', { amount, fpo: v.fpoName })}</p>
          <ol>
            <li>{t('agreements.fund.c1', { kg: formatKg1(a.agreedKg) })}</li>
            <li>{t('agreements.fund.c2', { grade: gradeDisplay(a.minGrade as Grade) })}</li>
            <li>{t('agreements.fund.c3')}</li>
          </ol>
          {balance !== null ? <p className="bal">{t('agreements.fund.balance', { before: formatInr(balance), after: formatInr(balance - BigInt(a.amountPaise)) })}</p> : null}
        </ActionPanel>
      </>
    );
  }
  if (a.status === 'funded' && v.deadlinePassed) {
    return (
      <>
        <Terms v={v} side="buyer" />
        <ActionPanel
          layout="decide"
          action={refundAgreementAction}
          hidden={id}
          icon="arrowLeft"
          heading={{ id: 'rf-h', text: t('agreements.refund.title') }}
          forcedWorking={forcedWorking}
          texts={{ idle: t('agreements.refund.idle', { amount }), busy: t('agreements.refund.busy', { amount }), retry: t('agreements.retry'), noAnswer: { title: t('agreements.refund.errTitle'), body: t('agreements.refund.errBody', { amount }) } }}
          note={
            <p className="dec-note">
              <Icon name="seal" />
              <span>{t('agreements.refund.note')}</span>
            </p>
          }
        >
          <p>{t('agreements.refund.body', { deadline: istDate(a.deadline), amount })}</p>
          {balance !== null ? <p className="bal">{t('agreements.refund.balance', { before: formatInr(balance), after: formatInr(balance + BigInt(a.amountPaise)) })}</p> : null}
        </ActionPanel>
      </>
    );
  }
  if (a.status === 'funded' && toGrade) {
    return (
      <>
        <section className="glass card terms" aria-labelledby="b-h">
          <h3 className="sec-h" id="b-h">
            {t('agreements.delivered.title')}
          </h3>
          <dl>
            <div>
              <dt>{t('agreements.delivered.batch')}</dt>
              <dd>
                {toGrade.batchId} · <Link href={`/verify/${encodeURIComponent(toGrade.batchId)}?h=${toGrade.shortHash}`}>{t('agreements.delivered.certificate')}</Link>
              </dd>
            </div>
            <div>
              <dt>{t('agreements.delivered.delivered')}</dt>
              <dd>{t('agreements.delivered.kgWhen', { kg: formatKg1(toGrade.deliveredKg), when: toGrade.deliveredAt ? istDate(toGrade.deliveredAt) : '' })}</dd>
            </div>
            <div>
              <dt>{t('agreements.delivered.pickings')}</dt>
              <dd>{t('agreements.delivered.pickingsValue', { n: toGrade.verifiedPickings, of: toGrade.pickings })}</dd>
            </div>
            <div>
              <dt>{t('agreements.terms.minGrade')}</dt>
              <dd>{gradeDisplay(a.minGrade as Grade)}</dd>
            </div>
          </dl>
        </section>
        <div style={{ marginTop: 16 }}>
          <GradeForm action={gradeBatchAction} agreementId={a.id} batchId={toGrade.batchId} minGrade={a.minGrade} forcedWorking={forcedWorking} />
        </div>
        <Terms v={v} side="buyer" />
      </>
    );
  }
  if (a.status === 'funded' && v.delivered.length === 0) {
    return (
      <>
        <Terms v={v} side="buyer" />
        <EmptyCard title={t('agreements.grade.emptyTitle')} body={t('agreements.grade.emptyBody', { fpo: v.fpoName })} />
      </>
    );
  }
  // Read-only: the latest result, the terms and the conditions.
  const released = a.status === 'settled' ? v.settlements.find((s) => s.outcome === 'released') : undefined;
  const judged = released ?? last;
  return (
    <>
      {released ? <OutcomeReleased v={v} s={released} /> : last?.outcome === 'not_released' && a.status === 'funded' ? <OutcomeNotReleased v={v} s={last} side="buyer" /> : null}
      {a.status === 'refunded' ? <p className="d-meta">{t('agreements.refunded.line', { amount, when: a.closedAt ? istDate(a.closedAt) : '' })}</p> : null}
      <Terms v={v} side="buyer" />
      {judged ? <Conditions v={v} facts={judged} pending={false} /> : null}
    </>
  );
}

export default async function BuyerAgreementPage({ params, searchParams }: Props) {
  const me = await requireSession('buyer');
  const { id } = await params;
  const forced = forcedAgreementState((await searchParams).state);
  const db = await getDbReady();
  const v = await getAgreementView(db, 'buyer', me.orgId, id);
  if (!v) notFound();
  const [items, names, balance] = await Promise.all([
    forced === 'loading' ? [] : listBuyerAgreements(db, me.orgId),
    orgNames(db, [me.orgId]),
    v.row.status === 'created' || (v.row.status === 'funded' && v.deadlinePassed) ? buyerBalance(me.orgId) : Promise.resolve(null),
  ]);
  const orgName = names.get(me.orgId) ?? '';
  const status = buyerStatus(v);
  const a = v.row;
  const firstBatch = v.delivered[0];
  const meta =
    a.status === 'created'
      ? t('agreements.meta.created', { when: istDate(a.createdAt) })
      : a.status === 'funded' && v.deadlinePassed
        ? t(v.delivered.length ? 'agreements.meta.endedNotSettled' : 'agreements.meta.endedNothing', { funded: istDate(a.fundedAt!), deadline: istDate(a.deadline) })
        : a.status === 'funded'
          ? t('agreements.meta.funded', { when: istDate(a.fundedAt!), amount: formatInr(a.amountPaise) })
          : firstBatch
            ? t('agreements.meta.delivered', { when: istDate(a.createdAt), batch: firstBatch.batchId, delivered: firstBatch.deliveredAt ? istDate(firstBatch.deliveredAt) : '' })
            : t('agreements.meta.createdOnly', { when: istDate(a.createdAt) });
  return (
    <main className="review agr no-rail detail-open" data-state="working" id="main">
      <AgreementList side="buyer" orgName={orgName} items={items} state={forced === 'loading' ? 'loading' : 'data'} currentId={a.id} />
      {forced === 'loading' ? (
        <DetailSkeleton />
      ) : (
        <DetailColumn backHref="/buyer/agreements" backLabel={t('agreements.back')} listTitle={t('agreements.buyer.title')}>
          <DetailHead eyebrow={t('agreements.detailEyebrow', { other: v.fpoName })} title={a.id} chip={<StatusChip status={{ mark: status.mark, word: status.short }} />} meta={meta} />
          <Body v={v} balance={balance} forcedWorking={forced === 'working'} />
        </DetailColumn>
      )}
    </main>
  );
}
