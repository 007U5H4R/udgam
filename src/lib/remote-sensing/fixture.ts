import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { geometryHash } from '../geo/area';
import type { PlotPolygon } from '../geo/types';
import { ProviderError, type CallOptions, type PlotGeom, type ProviderName, type RemoteSensingProvider } from './types';

// The fixture remote-sensing adapter (technical-plan §7, TSK-07.1): the default provider, offline and
// keyless. It answers from per-plot profiles (evals/fixtures/remote-sensing/<plotId>.json, generated
// from the dataset by evals/harness/fixtures.ts). Fault injection and delays come only from the
// constructor option — the harness passes a case's `provider_fault` mutations — never from env.

/** What the fixture provider answers for one plot. */
export type RsProfile = {
  plotId: string;
  forestLoss: { lossPct: number; lossHa: number; yearsFrom: number; dataYear: number; lossAdjacentOutside: boolean };
  /** One entry per calendar month (1–12). A month with no clear observation has mean null. */
  ndviHistory: {
    profile: 'perennial_canopy' | 'annual_crop' | 'cleared_then_planted';
    byCalendarMonth: { month: number; mean: number | null; clearFraction: number }[];
  };
  ndviWindow: { profile: 'living_canopy' | 'bare' | 'cloud_blocked'; mean: number | null; clearObservations: number };
};

export type FaultMode = 'timeout' | 'http_500' | 'malformed';
export type ProviderFault = { provider: ProviderName; mode: FaultMode; cacheEmpty?: boolean };
export type FixtureCall = 'forestLoss' | 'ndviHistory' | 'ndviWindow';

export type FixtureProviderOptions = {
  /** Profiles by plot ID (the harness: dataset plot IDs). */
  profiles: Record<string, RsProfile>;
  faults?: ProviderFault[];
  /** Answer each call kind only after this many ms (the remote-phase cap test); the caller's signal still aborts. */
  delayMs?: Partial<Record<FixtureCall, number>>;
  /** Profiles by geometry hash, for plots registered in the app with a fixture geometry (TC-028). */
  byGeometryHash?: Record<string, RsProfile>;
  /** The answer for any other plot. Without it an unknown plot is an error (the check becomes unavailable). */
  fallback?: RsProfile;
};

/** 'YYYY-MM' of the month `back` months before `endMonth`. */
function monthBefore(endMonth: string, back: number): { key: string; calendarMonth: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(endMonth);
  if (!m) throw new TypeError(`endMonth must be YYYY-MM, got ${endMonth}`);
  const index = Number(m[1]) * 12 + (Number(m[2]) - 1) - back;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { key: `${year}-${String(month).padStart(2, '0')}`, calendarMonth: month };
}

const PROVIDER_OF: Record<FixtureCall, ProviderName> = { forestLoss: 'gfw', ndviHistory: 'sentinel-hub', ndviWindow: 'sentinel-hub' };

export class FixtureProvider implements RemoteSensingProvider {
  readonly name = 'fixture' as const;
  readonly faults: readonly ProviderFault[];
  private readonly profiles: Record<string, RsProfile>;
  private readonly byGeometryHash: Record<string, RsProfile>;
  private readonly fallback: RsProfile | undefined;
  private readonly delayMs: Partial<Record<FixtureCall, number>>;

  constructor(opts: FixtureProviderOptions) {
    this.profiles = opts.profiles;
    this.faults = opts.faults ?? [];
    this.byGeometryHash = opts.byGeometryHash ?? {};
    this.fallback = opts.fallback;
    this.delayMs = opts.delayMs ?? {};
  }

  private profile(plot: PlotGeom): RsProfile {
    const p = (Object.hasOwn(this.profiles, plot.id) ? this.profiles[plot.id] : undefined) ??
      (Object.hasOwn(this.byGeometryHash, plot.geometryHash) ? this.byGeometryHash[plot.geometryHash] : undefined) ??
      this.fallback;
    if (!p) throw new Error(`no remote-sensing fixture profile for plot ${plot.id}`);
    return p;
  }

  /** Apply an injected fault or delay for this call, if any; otherwise answer. */
  private async answer<T>(call: FixtureCall, opts: CallOptions | undefined, body: () => T): Promise<T> {
    const provider = PROVIDER_OF[call];
    const fault = this.faults.find((f) => f.provider === provider);
    if (fault?.mode === 'http_500') throw new ProviderError(provider, 500);
    if (fault?.mode === 'malformed') throw new ProviderError(provider, 'malformed');
    const delay = fault?.mode === 'timeout' ? Infinity : (this.delayMs[call] ?? 0);
    if (delay > 0) await waitOrAbort(provider, delay, opts?.signal);
    return body();
  }

  forestLoss(plot: PlotGeom, opts?: CallOptions) {
    return this.answer('forestLoss', opts, () => {
      const { lossHa, lossPct, yearsFrom, dataYear } = this.profile(plot).forestLoss;
      return { lossHa, lossPct, yearsFrom, dataYear };
    });
  }

  ndviHistory(plot: PlotGeom, endMonth: string, opts?: CallOptions) {
    return this.answer('ndviHistory', opts, () => {
      const byMonth = this.profile(plot).ndviHistory.byCalendarMonth;
      const months = Array.from({ length: 12 }, (_, i) => {
        const { key, calendarMonth } = monthBefore(endMonth, 11 - i);
        const m = byMonth.find((x) => x.month === calendarMonth);
        return { month: key, mean: m?.mean ?? null, clearFraction: m?.clearFraction ?? 0 };
      });
      return { months };
    });
  }

  ndviWindow(plot: PlotGeom, _centreDate: string, _days: number, opts?: CallOptions) {
    return this.answer('ndviWindow', opts, () => {
      const { mean, clearObservations } = this.profile(plot).ndviWindow;
      return { mean, clearObservations };
    });
  }
}

/**
 * Wait `ms` (Infinity = never answer on its own), rejecting with a timeout ProviderError as soon as the
 * caller's signal aborts — the 8 s per-call timeout or the 10 s remote-phase cap.
 */
function waitOrAbort(provider: ProviderName, ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new ProviderError(provider, 'timeout'));
    const timer = Number.isFinite(ms) ? setTimeout(done, ms) : undefined;
    function onAbort() {
      clearTimeout(timer);
      reject(new ProviderError(provider, 'timeout'));
    }
    function done() {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** technical-plan TSK-07.1: the fixture adapter. */
export function createFixtureProvider(opts: FixtureProviderOptions): FixtureProvider {
  return new FixtureProvider(opts);
}

export type FixtureSet = Required<Pick<FixtureProviderOptions, 'profiles' | 'byGeometryHash'>>;

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const profileOf = ({ plotId, forestLoss, ndviHistory, ndviWindow }: RsProfile): RsProfile => ({ plotId, forestLoss, ndviHistory, ndviWindow });
type GeoDoc = { type: 'FeatureCollection'; features: { geometry: PlotPolygon }[] } | { type: 'Feature'; geometry: PlotPolygon } | PlotPolygon;
const geometryOf = (doc: GeoDoc): PlotPolygon =>
  doc.type === 'FeatureCollection' ? doc.features[0]!.geometry : doc.type === 'Feature' ? doc.geometry : doc;

/**
 * The committed fixture set under `root` (default `<cwd>/evals/fixtures`): every
 * `remote-sensing/<plotId>.json` by plot ID and, through `plots/<plotId>.geojson`, by geometry hash;
 * plus `remote-sensing/geometry/*.json`, profiles for non-dataset geometries named by `geometryFile`.
 */
export async function loadFixtureSet(root: string = join(process.cwd(), 'evals', 'fixtures')): Promise<FixtureSet> {
  const rsDir = join(root, 'remote-sensing');
  const profiles: Record<string, RsProfile> = {};
  const byGeometryHash: Record<string, RsProfile> = {};
  for (const file of readdirSync(rsDir).filter((f) => f.endsWith('.json')).sort()) {
    const p = profileOf(readJson<RsProfile>(join(rsDir, file)));
    profiles[p.plotId] = p;
    const plotFile = join(root, 'plots', `${p.plotId}.geojson`);
    if (existsSync(plotFile)) byGeometryHash[await geometryHash(geometryOf(readJson<GeoDoc>(plotFile)))] = p;
  }
  const geomDir = join(rsDir, 'geometry');
  if (existsSync(geomDir)) {
    for (const file of readdirSync(geomDir).filter((f) => f.endsWith('.json')).sort()) {
      const doc = readJson<RsProfile & { geometryFile: string }>(join(geomDir, file));
      byGeometryHash[await geometryHash(geometryOf(readJson<GeoDoc>(join(root, doc.geometryFile))))] = profileOf(doc);
    }
  }
  return { profiles, byGeometryHash };
}
