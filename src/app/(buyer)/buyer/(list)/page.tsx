import type { Metadata } from 'next';
import screen from '../../../../components/buyer/BatchScreen.module.css';
import { GlassCard } from '../../../../components/ui/GlassCard';
import { listBuyerBatches } from '../../../../lib/batches/buyer';
import { orgNames } from '../../../../lib/batches/read';
import { forcedViewState } from '../../../../lib/batches/view-state';
import { getDbReady } from '../../../../lib/db/client';
import { t } from '../../../../lib/i18n';
import { requireSession } from '../../../_auth/require';
import { BuyerList } from '../BuyerList';

// /buyer (TSK-14.6, TC-060, EVAL-080): only the batches whose latest custody transfer is to the
// buyer's organisation (from the session). No mockup: the admin list/detail grammar (TP17).
// `?state=loading|empty|error` forces a state for e2e (§11).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Batches · Udgam' };

type Props = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function BuyerHome({ searchParams }: Props = {}) {
  const me = await requireSession('buyer');
  const state = forcedViewState((await searchParams)?.state);
  const db = await getDbReady();
  const [batches, names] = await Promise.all([state ? [] : listBuyerBatches(db, me.orgId), orgNames(db, [me.orgId])]);
  return (
    <main className={screen.main}>
      <BuyerList orgName={names.get(me.orgId) ?? ''} batches={batches} state={state} />
      <section className={screen.detail} aria-label={t('buyer.pick')}>
        <div className={screen.dBody}>
          <GlassCard className={screen.hint}>
            <p>{t('buyer.pick')}</p>
          </GlassCard>
        </div>
      </section>
    </main>
  );
}
