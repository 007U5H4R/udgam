import type { Metadata } from 'next';
import { AgreementList } from '../../../../../components/agreements/AgreementList';
import { NewAgreementForm } from '../../../../../components/agreements/NewAgreementForm';
import { DetailColumn, DetailHead, DetailSkeleton, EmptyCard } from '../../../../../components/agreements/parts';
import { listBuyerAgreements, listFpoOrgs } from '../../../../../lib/agreements/read';
import { forcedAgreementState } from '../../../../../lib/agreements/view-state';
import { orgNames } from '../../../../../lib/batches/read';
import { getDbReady } from '../../../../../lib/db/client';
import { t } from '../../../../../lib/i18n';
import { requireSession } from '../../../../_auth/require';
import { createAgreementAction } from '../actions';

// /buyer/agreements/new (TSK-25.8, Design.md §28.1 screen 2): the FPO, crop, agreed kg, minimum grade,
// amount in mock INR and deadline. Creating records the agreement; funding is the next step. The list's
// "New agreement" pill is a ghost here (one primary per screen). `?state=loading|empty|working` for e2e.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New agreement · Udgam' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NewAgreementPage({ searchParams }: Props) {
  const me = await requireSession('buyer');
  const forced = forcedAgreementState((await searchParams).state);
  const db = await getDbReady();
  const [items, names, fpos] = await Promise.all([forced === 'loading' ? [] : listBuyerAgreements(db, me.orgId), orgNames(db, [me.orgId]), listFpoOrgs(db)]);
  const orgName = names.get(me.orgId) ?? '';
  const noFpo = forced === 'empty' || fpos.length === 0;
  return (
    <main className="review agr no-rail detail-open" data-state="working" id="main">
      <AgreementList side="buyer" orgName={orgName} items={items} state={forced === 'loading' ? 'loading' : items.length ? 'data' : 'empty'} />
      {forced === 'loading' ? (
        <DetailSkeleton listTitle={t('agreements.buyer.title')} />
      ) : (
        <DetailColumn backHref="/buyer/agreements" backLabel={t('agreements.back')} listTitle={t('agreements.buyer.title')}>
          <DetailHead eyebrow={t('agreements.eyebrow', { org: orgName })} title={t('agreements.new.title')} meta={t('agreements.new.meta')} />
          {noFpo ? (
            <EmptyCard title={t('agreements.new.noFpoTitle')} body={t('agreements.new.noFpoBody')} />
          ) : (
            <div style={{ marginTop: 16 }}>
              <NewAgreementForm action={createAgreementAction} fpos={fpos} forcedWorking={forced === 'working'} />
            </div>
          )}
        </DetailColumn>
      )}
    </main>
  );
}
