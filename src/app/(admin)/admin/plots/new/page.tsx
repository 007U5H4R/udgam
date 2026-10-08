import type { Metadata } from 'next';
import { throwIfForced } from '../../../../../lib/config/test-surfaces';
import { getDbReady } from '../../../../../lib/db/client';
import { userName } from '../../../../../lib/enrolment/phones';
import { tileLayerConfig } from '../../../../../lib/geo/tiles';
import { listFarmers } from '../../../../../lib/plots/farmers';
import { listPlots } from '../../../../../lib/plots/plots';
import { requireSession } from '../../../../_auth/require';
import { NewPlotForm } from '../NewPlotForm';
import { adminName, loadList, PlotsScreen } from '../PlotsScreen';
import { forcedState } from '../state';
import s from '../plots.module.css';

// /admin/plots/new (TKT-06): pick or create a farmer, pick the crop, then draw the boundary or upload a
// GeoJSON/KML file. The server computes the area and anchors plot_registered.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Add a plot · Udgam' };

export default async function NewPlotPage({ searchParams }: { searchParams: Promise<{ state?: string | string[] }> }) {
  const { orgId, userId } = await requireSession('admin');
  const { state } = await searchParams;
  throwIfForced(state); // dev and e2e only: shows the /admin error boundary (CR-100)
  const db = await getDbReady();
  const list = await loadList(forcedState(state), () => listPlots(db, orgId));
  const me = await adminName(() => userName(db, userId));
  const farmers = await listFarmers(db, orgId);
  return (
    <PlotsScreen me={me} list={list} detailOpen primaryAdd={false}>
      <header>
        <p className={s.eyebrow}>Plots · New</p>
        <div className={s.dTitle}>
          <h2 id="new-h">Add a plot</h2>
        </div>
        <p className={s.dMeta}>The area is worked out from the boundary. Saving records the plot permanently.</p>
      </header>
      <NewPlotForm farmers={farmers} tiles={tileLayerConfig()} />
    </PlotsScreen>
  );
}
