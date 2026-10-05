import type { Metadata } from 'next';
import { AgreementList } from '../../../../components/agreements/AgreementList';
import { DetailSkeleton, PickHint } from '../../../../components/agreements/parts';
import { RailShell } from '../../../../components/ui/Rail';
import { listFpoAgreements } from '../../../../lib/agreements/read';
import { forcedAgreementState } from '../../../../lib/agreements/view-state';
import { orgNames } from '../../../../lib/batches/read';
import { getDbReady } from '../../../../lib/db/client';
import { userName } from '../../../../lib/enrolment/phones';
import { t } from '../../../../lib/i18n';
import { requireSession } from '../../../_auth/require';

// /admin/agreements (TSK-25.8, the TKT-23 follow-up; Design.md §28.1 screen 5): the FPO's agreements
// with buyers, under Batches (rail current = Batches; the header links back). `?state=loading|empty|error`
// forces a state for e2e (technical-plan §11).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Agreements · Udgam' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminAgreementsPage({ searchParams }: Props) {
  const me = await requireSession('admin');
  const forced = forcedAgreementState((await searchParams).state);
  const state = forced === 'working' || forced === 'turned-away' ? null : forced;
  const db = await getDbReady();
  const [items, names, name] = await Promise.all([state ? [] : listFpoAgreements(db, me.orgId), orgNames(db, [me.orgId]), userName(db, me.userId)]);
  const listState = state ?? (items.length ? 'data' : 'empty');
  return (
    <RailShell current="batches" me={name ? { name } : undefined}>
      <main className="review agr" data-state={listState === 'data' ? 'working' : listState} id="main">
        <AgreementList side="fpo" orgName={names.get(me.orgId) ?? ''} items={items} state={listState} />
        {listState === 'loading' ? <DetailSkeleton /> : listState === 'data' ? <PickHint text={t('agreements.fpo.pick')} /> : null}
      </main>
    </RailShell>
  );
}
