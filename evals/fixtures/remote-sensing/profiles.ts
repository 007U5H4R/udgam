import type { RsProfile } from '../../../src/lib/remote-sensing/fixture';

// The fixture provider's named profiles (technical-plan TSK-07.1). The dataset describes each plot's
// remote sensing by name (`fixtures.plots[].remote_sensing`); these are the numbers behind the names.
// evals/harness/fixtures.ts writes one JSON profile per dataset plot from them (byte-identical on
// regeneration), and the fixture provider answers from those JSON files. No real satellite values.

export type NdviHistoryName = RsProfile['ndviHistory']['profile'];
export type NdviWindowName = RsProfile['ndviWindow']['profile'];

/** Monthly NDVI means by calendar month, Jan–Dec; null = no clear observation (monsoon July). */
export const HISTORY: Record<NdviHistoryName, (number | null)[]> = {
  // 0.62–0.81 over 11 clear months: year-round canopy
  perennial_canopy: [0.7, 0.66, 0.62, 0.64, 0.69, 0.76, null, 0.81, 0.8, 0.78, 0.75, 0.72],
  // dips to 0.21, then regrowth
  cleared_then_planted: [0.21, 0.24, 0.26, 0.3, 0.35, 0.41, null, 0.48, 0.52, 0.55, 0.57, 0.58],
  // 0.28–0.74: a seasonal crop, not a perennial canopy
  annual_crop: [0.45, 0.34, 0.28, 0.29, 0.38, 0.55, null, 0.7, 0.74, 0.66, 0.52, 0.47],
};

/** Share of clear pixels by calendar month (a clear month has a mean; July is fully clouded). */
export const CLEAR_FRACTION = [0.95, 0.97, 0.98, 0.96, 0.9, 0.72, 0, 0.64, 0.8, 0.88, 0.93, 0.96];

/** The ±30-day harvest window. */
export const WINDOW: Record<NdviWindowName, { mean: number | null; clearObservations: number }> = {
  living_canopy: { mean: 0.71, clearObservations: 4 },
  bare: { mean: 0.22, clearObservations: 3 },
  cloud_blocked: { mean: null, clearObservations: 0 },
};

export const LOSS_FROM_YEAR = 2021;
export const LOSS_DATA_YEAR = 2025;

export type ProfileSpec = {
  plotId: string;
  areaHa: number;
  lossPct: number;
  history: NdviHistoryName;
  window: NdviWindowName;
  lossAdjacentOutside?: boolean;
};

/** One plot's profile: `lossHa = lossPct × areaHa / 100` (4 dp). */
export function buildProfile(s: ProfileSpec): RsProfile {
  return {
    plotId: s.plotId,
    forestLoss: {
      lossPct: s.lossPct,
      lossHa: Math.round(((s.lossPct * s.areaHa) / 100) * 10_000) / 10_000,
      yearsFrom: LOSS_FROM_YEAR,
      dataYear: LOSS_DATA_YEAR,
      lossAdjacentOutside: s.lossAdjacentOutside ?? false,
    },
    ndviHistory: {
      profile: s.history,
      byCalendarMonth: HISTORY[s.history].map((mean, i) => ({ month: i + 1, mean, clearFraction: mean === null ? 0 : CLEAR_FRACTION[i]! })),
    },
    ndviWindow: { profile: s.window, ...WINDOW[s.window] },
  };
}

/**
 * Profiles for geometries that are not dataset plots, matched by geometry hash (the fixture provider's
 * `byGeometryHash`). `P01-edited-18pct` is P01 enlarged over cleared land (TC-028, EVAL-044): the edit
 * must re-query and find 18.0 % loss. Its geometry is evals/fixtures/geometry/P01-edited-18pct.geojson.
 */
export const GEOMETRY_PROFILES: ProfileSpec[] = [
  { plotId: 'P01-edited-18pct', areaHa: 2.9, lossPct: 18.0, history: 'perennial_canopy', window: 'living_canopy' },
];
