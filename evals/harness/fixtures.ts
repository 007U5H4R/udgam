import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { area } from '@turf/turf';
import type { Polygon, Position } from '../../src/lib/geo/types';
import type { RsProfile } from '../../src/lib/remote-sensing/fixture';
import { EVALS_DIR, loadDataset, type Dataset, type PlotSpec } from './dataset';

// Plot and remote-sensing fixtures (technical-plan §13, §22 TSK-03.2; evaluation-plan §7.2). The
// dataset describes plots by role, area, shape and remote-sensing profile, never by coordinates; this
// module turns them into deterministic polygons near real Kodagu/Chikkamagaluru places, and into the
// fixture provider's profiles. Regenerate with `tsx evals/harness/fixtures.ts --write`; the committed
// files must stay byte-identical to a regeneration (fixtures.test.ts).

export const PLOTS_DIR = join(EVALS_DIR, 'fixtures', 'plots');
export const RS_DIR = join(EVALS_DIR, 'fixtures', 'remote-sensing');
const GENERATOR = 'evals/harness/fixtures.ts';

/** Mean-earth-radius metres per degree of latitude (R = 6 371 008.8 m, turf's default). */
export const M_PER_DEG = 111_195.08;
const DP = 1e7; // 7 dp ≈ 1 cm, the capture payload's precision

/** Real coffee places (approximate town coordinates) that anchor each plot; the polygon is centred there. */
const ANCHORS: Record<string, { place: string; lat: number; lng: number }> = {
  P01: { place: 'Madikeri, Kodagu', lat: 12.4211, lng: 75.7392 },
  P02: { place: 'Suntikoppa, Kodagu', lat: 12.4563, lng: 75.8251 },
  P03: { place: 'Somwarpet, Kodagu', lat: 12.5968, lng: 75.8497 },
  P04: { place: 'Virajpet, Kodagu', lat: 12.1963, lng: 75.8049 },
  P05: { place: 'Siddapura, Kodagu', lat: 12.3051, lng: 75.8498 },
  P06: { place: 'Gonikoppal, Kodagu', lat: 12.1832, lng: 75.9296 },
  P07: { place: 'Napoklu, Kodagu', lat: 12.3082, lng: 75.6664 },
  P08: { place: 'Chettalli, Kodagu', lat: 12.3714, lng: 75.8279 },
  P09: { place: 'Bhagamandala, Kodagu', lat: 12.3869, lng: 75.5335 },
  P10: { place: 'Srimangala, Kodagu', lat: 12.0272, lng: 75.9959 },
  E01: { place: 'Ammathi, Kodagu', lat: 12.2661, lng: 75.8779 },
  X01: { place: 'Chikkamagaluru', lat: 13.3161, lng: 75.7720 },
  X02: { place: 'Mudigere, Chikkamagaluru', lat: 13.1353, lng: 75.6405 },
  X03: { place: 'Aldur, Chikkamagaluru', lat: 13.2230, lng: 75.6450 },
  X04: { place: 'Balehonnur, Chikkamagaluru', lat: 13.3480, lng: 75.4600 },
  X05: { place: 'Koppa, Chikkamagaluru', lat: 13.5310, lng: 75.3580 },
  X06: { place: 'Kalasa, Chikkamagaluru', lat: 13.2360, lng: 75.3540 },
  X07: { place: 'Baba Budangiri foothills, Chikkamagaluru', lat: 13.4200, lng: 75.7500 },
};

export type PlotFeature = {
  type: 'Feature';
  properties: {
    id: string;
    role: PlotSpec['role'];
    area_ha: number;
    shape: PlotSpec['shape'];
    anchor: { place: string; lat: number; lng: number };
    /** Index of the edge (ring[i] → ring[i+1]) that gps_place measures from by default. */
    anchorEdge: number;
    /** concave_L only: the edge of the notch the mutation engine uses for inside_near_edge. */
    notchEdge?: number;
    /** concave_L only: the notch (inside the bounding box, outside the polygon). */
    notch?: Polygon;
    generator: string;
    seed: number;
  };
  geometry: Polygon;
};

type XY = [number, number];

/** FNV-1a (32-bit) of a string: the per-plot seed. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: a small deterministic PRNG in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round7 = (x: number) => Math.round(x * DP) / DP;

/** Local metres (x east, y north) around an anchor → [lng, lat] rounded to 7 dp. */
export function toLngLat(anchor: { lat: number; lng: number }, [x, y]: XY): Position {
  const cos = Math.cos((anchor.lat * Math.PI) / 180);
  return [round7(anchor.lng + x / (M_PER_DEG * cos)), round7(anchor.lat + y / M_PER_DEG)];
}

/** [lng, lat] → local metres around an anchor. */
export function toLocal(anchor: { lat: number; lng: number }, [lng, lat]: Position): XY {
  const cos = Math.cos((anchor.lat * Math.PI) / 180);
  return [(lng! - anchor.lng) * M_PER_DEG * cos, (lat! - anchor.lat) * M_PER_DEG];
}

const closed = (pts: XY[]): XY[] => [...pts, pts[0]!];

/** A rectangle with aspect 1.6:1, rotated by a seeded angle; edge 0 is a long edge. Unit area. */
function rotatedRectangle(rand: () => number): XY[] {
  const h = Math.sqrt(1 / 1.6);
  const w = 1.6 * h;
  const theta = rand() * (Math.PI / 2);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const corners: XY[] = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
  return corners.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

/** A seeded star-shaped 7-gon (angles increase, so the ring is simple and counter-clockwise). */
function sevenGon(rand: () => number): XY[] {
  const offset = rand() * 2 * Math.PI;
  return Array.from({ length: 7 }, (_, k) => {
    const a = offset + (2 * Math.PI * k) / 7 + (rand() - 0.5) * 0.35;
    const r = 0.75 + rand() * 0.5;
    return [r * Math.cos(a), r * Math.sin(a)] as XY;
  });
}

/**
 * An axis-aligned L: a square of side 1 with its north-east quarter removed (the notch). Ring:
 * v0 SW, v1 SE, v2, v3 (inner corner), v4, v5 NW; edge 2 (v2→v3) borders the notch.
 */
function lShape(): { ring: XY[]; notch: XY[] } {
  const s = 1;
  const o = -s / 2;
  const ring: XY[] = [
    [o, o],
    [o + s, o],
    [o + s, o + s / 2],
    [o + s / 2, o + s / 2],
    [o + s / 2, o + s],
    [o, o + s],
  ];
  const notch: XY[] = [
    [o + s / 2, o + s / 2],
    [o + s, o + s / 2],
    [o + s, o + s],
    [o + s / 2, o + s],
  ];
  return { ring, notch };
}

function polygonOf(anchor: { lat: number; lng: number }, ring: XY[]): Polygon {
  return { type: 'Polygon', coordinates: [closed(ring).map((p) => toLngLat(anchor, p))] };
}

/** Scale a unit shape so the geodesic area (turf) of the rounded polygon matches `areaHa`. */
function sized(anchor: { lat: number; lng: number }, unit: XY[], areaHa: number): number {
  let k = Math.sqrt(areaHa * 10_000);
  for (let i = 0; i < 4; i++) {
    const m2 = area(polygonOf(anchor, unit.map(([x, y]) => [x * k, y * k])));
    k *= Math.sqrt((areaHa * 10_000) / m2);
  }
  return k;
}

function plotFeature(spec: PlotSpec): PlotFeature {
  const anchor = ANCHORS[spec.id];
  if (!anchor) throw new Error(`no anchor point for plot ${spec.id}`);
  const seed = fnv1a(spec.id);
  const rand = mulberry32(seed);
  let unit: XY[];
  let notchUnit: XY[] | undefined;
  if (spec.shape === 'convex') unit = rotatedRectangle(rand);
  else if (spec.shape === 'irregular') unit = sevenGon(rand);
  else ({ ring: unit, notch: notchUnit } = lShape());
  const k = sized(anchor, unit, spec.area_ha);
  const scale = (pts: XY[]) => pts.map(([x, y]) => [x * k, y * k] as XY);
  return {
    type: 'Feature',
    properties: {
      id: spec.id,
      role: spec.role,
      area_ha: spec.area_ha,
      shape: spec.shape,
      anchor,
      anchorEdge: 0,
      ...(notchUnit ? { notchEdge: 2, notch: polygonOf(anchor, scale(notchUnit)) } : {}),
      generator: GENERATOR,
      seed,
    },
    geometry: polygonOf(anchor, scale(unit)),
  };
}

export type GeneratedPlot = { feature: PlotFeature; text: string };

/** Every dataset plot as a GeoJSON Feature plus its exact file text. Pure and deterministic. */
export function generatePlotFixtures(ds: Dataset): GeneratedPlot[] {
  return ds.fixtures.plots.map((spec) => {
    const feature = plotFeature(spec);
    return { feature, text: `${JSON.stringify(feature, null, 2)}\n` };
  });
}

// ── Remote sensing ────────────────────────────────────────────────────────────────────────────────

export type NdviHistoryProfile = PlotSpec['remote_sensing']['ndvi_history'];
export type NdviWindowProfile = PlotSpec['remote_sensing']['ndvi_harvest_window'];

export type { RsProfile };

// Values follow technical-plan TSK-07.1 (perennial 0.62–0.81 over 11 clear months; cleared then
// planted dips to 0.21; annual crop 0.28–0.74; living canopy 0.71 over 4; bare 0.22 over 3; cloud 0).
// Monthly NDVI means by calendar month, Jan–Dec; null = no clear observation (monsoon July).
const HISTORY: Record<NdviHistoryProfile, (number | null)[]> = {
  perennial_canopy: [0.7, 0.66, 0.62, 0.64, 0.69, 0.76, null, 0.81, 0.8, 0.78, 0.75, 0.72],
  cleared_then_planted: [0.21, 0.24, 0.26, 0.3, 0.35, 0.41, null, 0.48, 0.52, 0.55, 0.57, 0.58],
  annual_crop: [0.45, 0.34, 0.28, 0.29, 0.38, 0.55, null, 0.7, 0.74, 0.66, 0.52, 0.47],
};
const CLEAR_FRACTION = [0.95, 0.97, 0.98, 0.96, 0.9, 0.72, 0, 0.64, 0.8, 0.88, 0.93, 0.96];
const WINDOW: Record<NdviWindowProfile, { mean: number | null; clearObservations: number }> = {
  living_canopy: { mean: 0.71, clearObservations: 4 },
  bare: { mean: 0.22, clearObservations: 3 },
  cloud_blocked: { mean: null, clearObservations: 0 },
};
const LOSS_FROM_YEAR = 2021;
const LOSS_DATA_YEAR = 2025;

/** The remote-sensing profile of one dataset plot, from its `remote_sensing` block. */
export function remoteSensingProfile(ds: Dataset, plotId: string): RsProfile {
  const spec = ds.fixtures.plots.find((p) => p.id === plotId);
  if (!spec) throw new Error(`no plot ${plotId} in the dataset fixtures`);
  const rs = spec.remote_sensing;
  const pct = rs.deforestation_loss_pct_inside;
  return {
    plotId,
    forestLoss: {
      lossPct: pct,
      lossHa: Math.round(((pct * spec.area_ha) / 100) * 10_000) / 10_000,
      yearsFrom: LOSS_FROM_YEAR,
      dataYear: LOSS_DATA_YEAR,
      lossAdjacentOutside: rs.loss_adjacent_outside ?? false,
    },
    ndviHistory: {
      profile: rs.ndvi_history,
      byCalendarMonth: HISTORY[rs.ndvi_history].map((mean, i) => ({ month: i + 1, mean, clearFraction: mean === null ? 0 : CLEAR_FRACTION[i]! })),
    },
    ndviWindow: { profile: rs.ndvi_harvest_window, ...WINDOW[rs.ndvi_harvest_window] },
  };
}

export type GeneratedProfile = { profile: RsProfile; text: string };

export function generateRemoteSensingFixtures(ds: Dataset): GeneratedProfile[] {
  return ds.fixtures.plots.map((p) => {
    const profile = remoteSensingProfile(ds, p.id);
    const file = { ...profile, generator: GENERATOR, source: 'synthetic profile from evals/eval-dataset.json fixtures.plots[].remote_sensing' };
    return { profile, text: `${JSON.stringify(file, null, 2)}\n` };
  });
}

function main(argv: string[]): number {
  if (!argv.includes('--write')) {
    console.error('usage: tsx evals/harness/fixtures.ts --write');
    return 2;
  }
  const ds = loadDataset();
  mkdirSync(PLOTS_DIR, { recursive: true });
  mkdirSync(RS_DIR, { recursive: true });
  for (const p of generatePlotFixtures(ds)) writeFileSync(join(PLOTS_DIR, `${p.feature.properties.id}.geojson`), p.text);
  for (const r of generateRemoteSensingFixtures(ds)) writeFileSync(join(RS_DIR, `${r.profile.plotId}.json`), r.text);
  console.log(`wrote ${ds.fixtures.plots.length} plot and ${ds.fixtures.plots.length} remote-sensing fixtures`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
