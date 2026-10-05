import type { Metadata } from 'next';
import { AgreementList } from '../../../../components/agreements/AgreementList';
import { DetailSkeleton, PickHint } from '../../../../components/agreements/parts';
import { listBuyerAgreements } from '../../../../lib/agreements/read';
import { forcedAgreementState } from '../../../../lib/agreements/view-state';
import { orgNames } from '../../../../lib/batches/read';
import { getDbReady } from '../../../../lib/db/client';
import { t } from '../../../../lib/i18n';
import { requireSession } from '../../../_auth/require';

// /buyer/agreements (TSK-25.8, Design.md §28.1 screen 1): the buyer organisation's agreements with
// their status, beside an empty detail pane (≥ 1100 px). The buyer has no rail (§5): the header links
// back to Batches. `?state=loading|empty|error` forces a state for e2e (technical-plan §11).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Agreements · Udgam' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BuyerAgreementsPage({ searchParams }: Props) {
  const me = await requireSession('buyer');
  const forced = forcedAgreementState((await searchParams).state);
  const state = forced === 'working' || forced === 'turned-away' ? null : forced;
  const db = await getDbReady();
  const [items, names] = await Promise.all([state ? [] : listBuyerAgreements(db, me.orgId), orgNames(db, [me.orgId])]);
  const listState = state ?? (items.length ? 'data' : 'empty');
  return (
    <main className="review agr no-rail" data-state={listState === 'data' ? 'working' : listState} id="main">
      <AgreementList side="buyer" orgName={names.get(me.orgId) ?? ''} items={items} state={listState} primaryNew />
      {listState === 'loading' ? <DetailSkeleton /> : listState === 'data' ? <PickHint text={t('agreements.buyer.pick')} /> : null}
    </main>
  );
}
