import { CONFIG } from './config';

// Evidence sentences (technical-plan §6.5, TP3 — resolves GAP-8). English; every sentence names the
// measured value and, where one applies, the threshold (HR1). Units per evaluation-plan §7.4. The
// farmer-facing i18n layer rewrites these in plain words with the same numbers. Checks call these;
// they never build evidence strings themselves.

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** Whole metres: "182 m". */
export const m = (d: number): string => `${Math.round(d) || 0} m`;
/** Whole km/h: "338 km/h". */
export const kmh = (v: number): string => `${Math.round(v) || 0} km/h`;
/** One decimal with a % sign: "9.5%". */
export const pct = (x: number): string => `${(Math.round(x * 10) / 10 || 0).toFixed(1)}%`;
/** Multiple of the reference bound, two decimals: "2.05x". */
export const xu = (r: number): string => `${(Math.round(r * 100) / 100).toFixed(2)}x`;
/** "k of n". */
export const kOfN = (k: number, n: number): string => `${k} of ${n}`;
/** A duration from minutes: `N min` under 120 min, `N h` under 48 h, else `N days` (absolute value). */
export function dur(min: number): string {
  const mins = Math.round(Math.abs(min));
  if (mins < 120) return `${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(mins / 1440)} days`;
}
/** Calendar date in IST (UTC+05:30) by explicit offset, never the host zone. */
export const istDate = (iso: string): string => new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 10);
/** NDVI, two decimals. */
const ndvi = (x: number): string => x.toFixed(2);

const C = CONFIG;
const gpsLimits = `(good under ${m(C.gpsAccuracy.okBelowM)}, limit ${m(C.gpsAccuracy.flagBelowM)})`;
const exifGpsLimit = `(limit ${m(C.exifGps.maxDistanceM)})`;
const lossLine = (p: number) => `${pct(p)} of plot area lost since ${C.deforestation.lossFromYear} (hard fail at ${pct(C.deforestation.hardFailAtPct)})`;
const harvestLine = (x: number) => `Living canopy around the picking date: NDVI ${ndvi(x)} (needs ≥ ${ndvi(C.ndviHarvestWindow.okMin)}`;
const yieldLine = (r: number) =>
  `Season total ${xu(r)} the reference upper bound (flag above ${xu(C.yield.flagAboveU)}, hard fail above ${xu(C.yield.hardFailAboveU)})`;

type TimeGaps = { exifClientMin: number | null; clientServerMin: number };
function timeLine({ exifClientMin, clientServerMin }: TimeGaps): string {
  const clock = `phone clock ${dur(clientServerMin)} from server (limit ${dur(C.exifTime.maxClientServerMin)})`;
  if (exifClientMin === null) return `Photo has no time data; ${clock}`;
  return `Photo time ${dur(exifClientMin)} from capture time (limit ${dur(C.exifTime.maxExifClientMin)}); ${clock}`;
}

type Movement = { first: true } | { speedKmh: number; distanceM: number; minutes: number };
/** The phone's capture time did not move forward since its previous entry: no speed is plausible. */
type ClockStood = { timeDidNotAdvance: true; distanceM: number; minutes: number };
function movementLine(f: Movement | ClockStood): string {
  if ('first' in f) return 'First entry from this phone';
  if ('timeDidNotAdvance' in f)
    return `Capture time did not advance from the previous entry ${m(f.distanceM)} away (${Math.round(f.minutes) || 0} min apart; limit ${kmh(C.movement.maxKmh)})`;
  return `Implied speed ${kmh(f.speedKmh)} from the previous entry ${m(f.distanceM)} away ${Math.round(f.minutes)} min earlier (limit ${kmh(C.movement.maxKmh)})`;
}

type NdviMonths = { min: number; max: number; clearMonths: number };
type ProviderDown = { reason: 'provider'; detail: string };

export const evidence = {
  signature_valid: {
    ok: ({ deviceId }: { deviceId: string }) => `Signed by enrolled phone ${deviceId}`,
    fail: (
      f: { reason: 'bad_signature'; deviceId: string } | { reason: 'revoked'; deviceId: string; revokedAt: string } | { reason: 'unknown_key' },
    ): string => {
      if (f.reason === 'bad_signature') return `Signature does not match phone ${f.deviceId}`;
      if (f.reason === 'revoked') return `Phone ${f.deviceId} was revoked on ${istDate(f.revokedAt)}`;
      return 'Phone key is not enrolled';
    },
  },
  chain_continuity: {
    ok: ({ seq }: { seq: number }) => `Entry ${seq} follows entry ${seq - 1} from this phone`,
    flag: (
      f: { reason: 'out_of_order'; expected: number; prevHash: string; seq: number } | { reason: 'new_device'; priorEntries: number },
    ): string =>
      f.reason === 'out_of_order'
        ? `Expected entry ${f.expected} after ${f.prevHash.slice(0, 8)}, got entry ${f.seq}`
        : `First entry from a new phone; this agent has ${f.priorEntries} earlier entries on another phone`,
  },
  photo_uniqueness: {
    ok: ({ n }: { n: number }) => `${kOfN(n, n)} photos are new`,
    fail: ({ k, n }: { k: number; n: number }) => `${kOfN(k, n)} photos seen before`,
  },
  geofence: {
    ok: ({ distanceM }: { distanceM: number }) => `Inside the plot, ${m(distanceM)} from the edge`,
    flag: ({ distanceM, bufferM }: { distanceM: number; bufferM: number }) =>
      `${m(distanceM)} outside the plot edge, within the ${m(bufferM)} GPS allowance`,
    fail: ({ distanceM, bufferM }: { distanceM: number; bufferM: number }) => `${m(distanceM)} outside the plot edge (allowance ${m(bufferM)})`,
  },
  gps_accuracy: {
    ok: ({ accuracyM }: { accuracyM: number }) => `GPS accuracy ${m(accuracyM)} ${gpsLimits}`,
    flag: ({ accuracyM }: { accuracyM: number }) => `GPS accuracy ${m(accuracyM)} ${gpsLimits}`,
    fail: ({ accuracyM }: { accuracyM: number }) => `GPS accuracy ${m(accuracyM)} ${gpsLimits}`,
  },
  exif_gps_agreement: {
    ok: ({ distanceM }: { distanceM: number }) => `Photo location ${m(distanceM)} from phone location ${exifGpsLimit}`,
    flag: () => 'Photo has no location data',
    fail: ({ distanceM }: { distanceM: number }) => `Photo location ${m(distanceM)} from phone location ${exifGpsLimit}`,
  },
  exif_time_agreement: {
    ok: (f: TimeGaps) => timeLine(f),
    flag: (f: TimeGaps) => timeLine(f),
    fail: (f: TimeGaps) => `${timeLine(f)} (fail over ${dur(C.exifTime.failAfterMin)})`,
  },
  movement_plausibility: {
    ok: (f: Movement) => movementLine(f),
    fail: (f: { speedKmh: number; distanceM: number; minutes: number } | ClockStood) => movementLine(f),
  },
  deforestation_overlap: {
    ok: ({ lossPct }: { lossPct: number }) => lossLine(lossPct),
    flag: ({ lossPct }: { lossPct: number }) => lossLine(lossPct),
    fail: ({ lossPct }: { lossPct: number }) => lossLine(lossPct),
    unavailable: ({ reason }: { reason: string }) => `Forest-loss data unavailable: ${reason}; an admin re-run will retry`,
  },
  ndvi_cultivation: {
    ok: ({ min, max, clearMonths }: NdviMonths) =>
      `Canopy all year: monthly NDVI ${ndvi(min)}–${ndvi(max)} over ${clearMonths} clear months (needs ≥ ${ndvi(C.ndviCultivation.canopyMin)}, swing ≤ ${ndvi(C.ndviCultivation.maxSeasonalSwing)})`,
    fail: ({ min, max, clearMonths }: NdviMonths): string => {
      const parts: string[] = [];
      if (min < C.ndviCultivation.canopyMin) parts.push(`lowest month NDVI ${ndvi(min)} (needs ≥ ${ndvi(C.ndviCultivation.canopyMin)})`);
      const swing = Math.round((max - min) * 100) / 100;
      if (swing > C.ndviCultivation.maxSeasonalSwing) parts.push(`seasonal swing ${ndvi(swing)} (limit ${ndvi(C.ndviCultivation.maxSeasonalSwing)})`);
      return `No year-round canopy over ${clearMonths} clear months: ${parts.join('; ')}`;
    },
    unavailable: (f: { reason: 'few_clear_months'; clearMonths: number } | ProviderDown): string =>
      f.reason === 'few_clear_months'
        ? `Only ${f.clearMonths} clear months of satellite data (needs ${C.ndviCultivation.minClearMonths})`
        : `Satellite NDVI data unavailable: ${f.detail}; an admin re-run will retry`,
  },
  ndvi_harvest_window: {
    ok: ({ ndvi: x }: { ndvi: number }) => `${harvestLine(x)})`,
    flag: ({ ndvi: x }: { ndvi: number }) => `${harvestLine(x)})`,
    fail: ({ ndvi: x }: { ndvi: number }) => `${harvestLine(x)}, fail below ${ndvi(C.ndviHarvestWindow.failBelow)})`,
    unavailable: (f: { reason: 'cloud' } | ProviderDown): string =>
      f.reason === 'cloud'
        ? `Satellite view blocked by cloud for ±${C.ndviHarvestWindow.windowDays} days`
        : `Satellite NDVI data unavailable: ${f.detail}; an admin re-run will retry`,
  },
  yield_plausibility: {
    ok: ({ ratio }: { ratio: number }) => yieldLine(ratio),
    flag: ({ ratio }: { ratio: number }) => yieldLine(ratio),
    fail: ({ ratio }: { ratio: number }) => yieldLine(ratio),
    unavailable: ({ crop }: { crop: string }) => `No yield reference for ${crop}`,
  },
  /** Any check · unavailable because it threw (§7 rule 4, EVAL-018). */
  threw: (errorClass: string) => `Check could not run: ${errorClass}`,
};
