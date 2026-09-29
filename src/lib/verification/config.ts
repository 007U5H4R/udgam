import { jcs, sha256Hex } from '../crypto';
import type { CheckId } from './types';

// cfg-1 (technical-plan §6.2, TP2 — resolves GAP-5). Every weight, threshold and verdict rule lives
// here as data. Changing any of it after baseline-v1 needs a TP/EV decision and two new attack cases
// per affected scenario first (EV13, CF-13); score.test.ts pins CONFIG_HASH so a change cannot slip in.

export type VerifyConfig = {
  readonly version: string;
  readonly statusScore: { readonly ok: number; readonly flag: number; readonly fail: number };
  readonly weights: Readonly<Record<CheckId, number>>;
  readonly verdict: { readonly verifiedMin: number; readonly reviewMin: number };
  readonly caps: { readonly anyFail: boolean; readonly flagCaps: readonly CheckId[]; readonly anyUnavailable: boolean };
  readonly geofence: { readonly maxBufferM: number };
  readonly gpsAccuracy: { readonly okBelowM: number; readonly flagBelowM: number };
  readonly exifGps: { readonly maxDistanceM: number };
  readonly exifTime: { readonly maxExifClientMin: number; readonly maxClientServerMin: number; readonly failAfterMin: number };
  readonly movement: { readonly maxKmh: number };
  readonly deforestation: {
    readonly flagAbovePct: number;
    readonly hardFailAtPct: number;
    readonly lossFromYear: number;
    readonly canopyDensityPct: number;
    readonly gfwDatasetVersion: string;
  };
  readonly ndviCultivation: { readonly minClearMonths: number; readonly canopyMin: number; readonly maxSeasonalSwing: number };
  readonly ndviHarvestWindow: { readonly windowDays: number; readonly okMin: number; readonly failBelow: number };
  readonly yield: { readonly flagAboveU: number; readonly hardFailAboveU: number };
  readonly providers: { readonly timeoutMs: number; readonly remotePhaseCapMs: number };
};

export const CONFIG = {
  version: 'cfg-1',
  statusScore: { ok: 1, flag: 0.5, fail: 0 }, // 'unavailable' is excluded from the mean
  // equal weights: nothing is tuned to the eval set (EV13)
  weights: {
    signature_valid: 1,
    chain_continuity: 1,
    photo_uniqueness: 1,
    geofence: 1,
    gps_accuracy: 1,
    exif_gps_agreement: 1,
    exif_time_agreement: 1,
    movement_plausibility: 1,
    deforestation_overlap: 1,
    ndvi_cultivation: 1,
    ndvi_harvest_window: 1,
    yield_plausibility: 1,
  },
  verdict: { verifiedMin: 80, reviewMin: 50 },
  caps: { anyFail: true, flagCaps: ['deforestation_overlap', 'yield_plausibility'], anyUnavailable: true }, // S10
  geofence: { maxBufferM: 25 },
  gpsAccuracy: { okBelowM: 30, flagBelowM: 100 },
  exifGps: { maxDistanceM: 50 },
  exifTime: { maxExifClientMin: 10, maxClientServerMin: 1440, failAfterMin: 10080 }, // TP4
  movement: { maxKmh: 120 },
  deforestation: { flagAbovePct: 0, hardFailAtPct: 10, lossFromYear: 2021, canopyDensityPct: 10, gfwDatasetVersion: 'v1.13' }, // S5, TP11
  ndviCultivation: { minClearMonths: 6, canopyMin: 0.5, maxSeasonalSwing: 0.35 }, // TP11
  ndviHarvestWindow: { windowDays: 30, okMin: 0.45, failBelow: 0.3 }, // TP11
  yield: { flagAboveU: 1.5, hardFailAboveU: 2.0 },
  providers: { timeoutMs: 8000, remotePhaseCapMs: 10000 },
} as const satisfies VerifyConfig;

/** SHA-256 of the RFC 8785 form of CONFIG; computed once at module load (top-level await). */
export const CONFIG_HASH: string = await sha256Hex(jcs(CONFIG));
