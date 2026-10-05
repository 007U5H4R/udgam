import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ActionPanel } from '../../../../../components/agreements/ActionPanel';
import { AgreementList } from '../../../../../components/agreements/AgreementList';
import { Conditions, DetailColumn, DetailHead, DetailSkeleton, OutcomeNotReleased, OutcomeReleased, StatusChip, Terms } from '../../../../../components/agreements/parts';
import { RailShell } from '../../../../../components/ui/Rail';
import { formatInr, istDate, istDateTime12 } from '../../../../../lib/agreements/format';
import { adminStatus, getAgreementView, listFpoAgreements, readyBatch } from '../../../../../lib/agreements/read';
import { forcedAgreementState } from '../../../../../lib/agreements/view-state';
import { orgNames } from '../../../../../lib/batches/read';
import { getDbReady } from '../../../../../lib/db/client';
import { userName } from '../../../../../lib/enrolment/phones';
import { t } from '../../../../../lib/i18n';
import { requireSession } from '../../../../_auth/require';
import { settleAgreementAction } from '../actions';

// /admin/agreements/[id] (TSK-25.8, Design.md §28.1 screen 5): the settlement panel. Ready: the three
// conditions "Before settling", each as value vs threshold with Met / Not met, and Settle in the sticky
// action bar. Released: "Payment released" (--ok) with the ledger line. Not released: "Not released"
// (--check) naming each condition not met. A settle that did not go through is never shown as a result:
// the chip stays "Ready to settle" and the inline error says nothing moved. Another FPO's agreement is a
// 404 like an unknown one (EVAL-080). `?state=loading|working|turned-away` for e2e.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Agreement · Udgam' };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminAgreementPage({ params, searchParams }: Props) {
  const me = await requireSession('admin');
  const { id } = await params;
  const forced = forcedAgreementState((await searchParams).state);
  const db = await getDbReady();
  const v = await getAgreementView(db, 'fpo', me.orgId, id);
  if (!v) notFound();
  const [items, names, name] = await Promise.all([forced === 'loading' ? [] : listFpoAgreements(db, me.orgId), orgNames(db, [me.orgId]), userName(db, me.userId)]);
  const a = v.row;
  const amount = formatInr(a.amountPaise);
  const status = adminStatus(v);
  const ready = readyBatch(v);
  const released = a.status === 'settled' ? v.settlements.find((s) => s.outcome === 'released') : undefined;
  const last = v.settlements[0];
  const shown = ready ?? v.delivered.find((b) => b.batchId === (released ?? last)?.batchId) ?? v.delivered[0];
  const meta =
    a.status === 'created'
      ? t('agreements.meta.adminCreated', { when: istDate(a.createdAt), deadline: istDate(a.deadline) })
      : shown
        ? t('agreements.meta.adminDelivered', { funded: istDate(a.fundedAt ?? a.createdAt), batch: shown.batchId, delivered: shown.deliveredAt ? istDate(shown.deliveredAt) : '', deadline: istDate(a.deadline) })
        : t('agreements.meta.adminFunded', { funded: istDate(a.fundedAt ?? a.createdAt), deadline: istDate(a.deadline) });
  const listTitle = t('agreements.fpo.title');
  const head = <DetailHead eyebrow={t('agreements.detailEyebrow', { other: v.buyerName })} title={a.id} chip={<StatusChip status={{ mark: status.mark, word: status.short }} />} meta={meta} />;

  let detail;
  if (forced === 'loading') detail = <DetailSkeleton />;
  else if (ready) {
    detail = (
      <DetailColumn
        backHref="/admin/agreements"
        backLabel={t('agreements.back')}
        listTitle={listTitle}
        after={
          <ActionPanel
            layout="bar"
            action={settleAgreementAction}
            hidden={{ agreementId: a.id, batchId: ready.batchId }}
            forcedWorking={forced === 'working'}
            forcedFailure={forced === 'turned-away' ? 'turned_away' : undefined}
            hint={t('agreements.settle.hint')}
            texts={{
              idle: t('agreements.settle.idle', { amount, fpo: v.fpoName }),
              busy: t('agreements.settle.busy'),
              retry: t('agreements.retry'),
              workingLine: t('agreements.settle.working'),
              noAnswer: { title: t('agreements.settle.errTitle'), body: t('agreements.settle.noAnswer', { amount }) },
              turnedAway: { title: t('agreements.settle.errTitle'), body: t('agreements.settle.turnedAway') },
            }}
          >
            <Conditions v={v} facts={{ deliveredKg: ready.deliveredKg, grade: ready.grade, pickings: ready.pickings, verifiedPickings: ready.verifiedPickings }} pending />
            <Terms v={v} side="fpo" />
          </ActionPanel>
        }
      >
        {head}
      </DetailColumn>
    );
  } else {
    const judged = released ?? last;
    detail = (
      <DetailColumn backHref="/admin/agreements" backLabel={t('agreements.back')} listTitle={listTitle}>
        {head}
        {released ? <OutcomeReleased v={v} s={released} /> : last?.outcome === 'not_released' && a.status === 'funded' ? <OutcomeNotReleased v={v} s={last} side="fpo" /> : null}
        {judged ? (
          <Conditions v={v} facts={judged} pending={false} at={istDateTime12(judged.createdAt)} />
        ) : shown ? (
          <Conditions v={v} facts={{ deliveredKg: shown.deliveredKg, grade: shown.grade, pickings: shown.pickings, verifiedPickings: shown.verifiedPickings }} pending />
        ) : null}
        <Terms v={v} side="fpo" />
      </DetailColumn>
    );
  }

  return (
    <RailShell current="batches" me={name ? { name } : undefined}>
      <main className="review agr detail-open" data-state="working" id="main">
        <AgreementList side="fpo" orgName={names.get(me.orgId) ?? ''} items={items} state={forced === 'loading' ? 'loading' : 'data'} currentId={a.id} />
        {detail}
      </main>
    </RailShell>
  );
}
