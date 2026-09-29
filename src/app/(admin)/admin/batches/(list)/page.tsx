import type { Metadata } from 'next';
import { GlassCard } from '../../../../../components/ui/GlassCard';
import { RailShell } from '../../../../../components/ui/Rail';
import screen from '../../../../../components/buyer/BatchScreen.module.css';
import { listOrgBatches, orgNames } from '../../../../../lib/batches/read';
import { forcedViewState } from '../../../../../lib/batches/view-state';
import { getDbReady } from '../../../../../lib/db/client';
import { userName } from '../../../../../lib/enrolment/phones';
import { t } from '../../../../../lib/i18n';
import { requireSession } from '../../../../_auth/require';
import { BatchList } from '../BatchList';

// /admin/batches (TSK-14.5): the org's batches beside an empty detail pane. No mockup: composed from the
// admin rail/list/detail grammar (TP17). `?state=loading|empty|error` forces a state for e2e (§11).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Batches · Udgam' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BatchesPage({ searchParams }: Props) {
  const me = await requireSession('admin');
  const state = forcedViewState((await searchParams).state);
  const db = await getDbReady();
  const [batches, names, name] = await Promise.all([state ? [] : listOrgBatches(db, me.orgId), orgNames(db, [me.orgId]), userName(db, me.userId)]);
  return (
    <RailShell current="batches" me={name ? { name } : undefined}>
      <main className={screen.main}>
        <BatchList orgName={names.get(me.orgId) ?? ''} batches={batches} state={state} primary />
        <section className={screen.detail} aria-label={t('batches.pick')}>
          <div className={screen.dBody}>
            <GlassCard className={screen.hint}>
              <p>{t('batches.pick')}</p>
            </GlassCard>
          </div>
        </section>
      </main>
    </RailShell>
  );
}
