'use client';

import { useRouter } from 'next/navigation';
import { PlotEditor } from '../../../../components/admin/PlotEditor';
import type { TileLayerConfig } from '../../../../lib/geo/tiles';
import type { PlotPolygon } from '../../../../lib/geo/types';
import { updatePlotGeometryAction } from './actions';
import { REASON_TEXT } from './copy';

// The plot detail's boundary editor: saving anchors plot_edited and marks the registration checks
// stale (TC-028 edit half); the page then re-renders with the server's area and status.

export function EditBoundary({ plotId, geometry, tiles }: { plotId: string; geometry: PlotPolygon; tiles: TileLayerConfig | null }) {
  const router = useRouter();
  return (
    <PlotEditor
      title="Edit the boundary"
      initial={geometry}
      tiles={tiles}
      reasonText={(r) => REASON_TEXT[r]}
      save={{
        label: 'Save boundary',
        run: async (g) => {
          const r = await updatePlotGeometryAction(plotId, JSON.stringify(g));
          if (!r.ok) return REASON_TEXT[r.reason];
          router.refresh();
          return null;
        },
      }}
    />
  );
}
