import type { Metadata } from 'next';
import { GlassCard } from '../../../../components/ui/GlassCard';
import { throwIfForced } from '../../../../lib/config/test-surfaces';
import { getDbReady } from '../../../../lib/db/client';
import { userName } from '../../../../lib/enrolment/phones';
import { listPlots } from '../../../../lib/plots/plots';
import { requireSession } from '../../../_auth/require';
import { adminName, loadList, PlotsScreen } from './PlotsScreen';
import { forcedState } from './state';
import s from './plots.module.css';

// /admin/plots (technical-plan §3.2, TKT-06): the org's registered plots with farmer, producer ID,
// crop, area and registration status. Composed from ported admin.html parts (TP17).
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Plots · Udgam' };

export default async function PlotsPage({ searchParams }: { searchParams: Promise<{ state?: string | string[] }> }) {
  const { orgId, userId } = await requireSession('admin');
  const { state } = await searchParams;
  throwIfForced(state); // dev and e2e only: shows the /admin error boundary (CR-100)
  const forced = forcedState(state);
  const list = await loadList(forced, async () => listPlots(await getDbReady(), orgId));
  const me = await adminName(async () => userName(await getDbReady(), userId));
  return (
    <PlotsScreen me={me} list={list} detailOpen={false} primaryAdd>
      {list.state === 'working' ? (
        <GlassCard as="section" className={s.hint} aria-label="No plot chosen">
          <p>
            <b>Choose a plot to see its boundary.</b>
          </p>
          <p>Or add a plot for a farmer.</p>
        </GlassCard>
      ) : null}
    </PlotsScreen>
  );
}
