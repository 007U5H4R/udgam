import type { Metadata } from 'next';
import { getDbReady } from '../../../../../lib/db/client';
import { listFarmers } from '../../../../../lib/plots/farmers';
import { listPlots } from '../../../../../lib/plots/plots';
import { requireSession } from '../../../../_auth/require';
import { NewPlotForm } from '../NewPlotForm';
import { loadList, PlotsScreen } from '../PlotsScreen';
import { forcedState } from '../state';
import s from '../plots.module.css';

// /admin/plots/new (TKT-06): pick or create a farmer, pick the crop, then draw the boundary or upload a
// GeoJSON/KML file. The server computes the area and anchors plot_registered.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Add a plot · Udgam' };

export default async function NewPlotPage({ searchParams }: { searchParams: Promise<{ state?: string | string[] }> }) {
  const { orgId } = await requireSession('admin');
  const db = await getDbReady();
  const list = await loadList(forcedState((await searchParams).state), () => listPlots(db, orgId));
  const farmers = await listFarmers(db, orgId);
  return (
    <PlotsScreen list={list} detailOpen primaryAdd={false}>
      <header>
        <p className={s.eyebrow}>Plots · New</p>
        <div className={s.dTitle}>
          <h2 id="new-h">Add a plot</h2>
        </div>
        <p className={s.dMeta}>The area is worked out from the boundary. Saving records the plot permanently.</p>
      </header>
      <NewPlotForm farmers={farmers} />
    </PlotsScreen>
  );
}
