import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { area } from '@turf/turf';
import { toLngLat } from '../../evals/harness/fixtures';
import type { AttackId } from '../../src/lib/demo/manifest';
import { locate } from '../../src/lib/geo/geofence';
import type { Polygon } from '../../src/lib/geo/types';
import { DEMO_ACCOUNTS, DEMO_ORGS } from '../seed-accounts';

// The Kodagu demo data set (technical-plan TSK-20.1, TC-077): the Hosahalli Coffee Growers FPO, its
// buyer, four accounts, twelve plots, about thirty honest pickings and four staged attacks. Plain data;
// scripts/seed/run.ts writes it through the app's own functions.
//
// Plots P01–P10 and X01 reuse the evaluation fixtures' polygons (evals/fixtures/plots, made by the
// evals/harness/fixtures.ts generator), so the fixture satellite provider answers each with its profile
// by geometry hash: P09's harvest window is cloud-blocked, X01 lost 25 % of its canopy after 2020. Y01 is
// a small plot drawn here with the same generator's projection; the fixture provider answers it with its
// demo fallback (an honest perennial plot, every line labelled "(demo data)", EXE12).
//
// Farmer names and identifiers are fictional and only ever reach the farmers table: everything that
// feeds a ledger payload carries the producer ID the app assigns (EV16).

export type SeedCrop = 'arabica' | 'robusta';
export type SeedDistrict = 'Kodagu' | 'Chikkamagaluru';
export type AgentKey = 'agent1' | 'agent2';
export type UserKey = 'admin' | AgentKey | 'buyer';

export type SeedUser = { key: UserKey; id: string; email: string; name: string; role: 'admin' | 'agent' | 'buyer'; org: 'fpo' | 'buyer' };

export type SeedPlot = {
  /** The data set's key (the app assigns its own PL- ID at registration). */
  id: string;
  farmer: { name: string; identifier: string | null };
  crop: SeedCrop;
  district: SeedDistrict;
  place: string;
  /** A point well inside the polygon, [lng, lat]: where the agent stands to record. */
  centre: [number, number];
  areaHa: number;
  shape: 'convex' | 'irregular' | 'concave_L';
  /** The fixture remote-sensing profile that answers this plot (P01 is the demo fallback). */
  profile: string;
  /** Post-2020 canopy loss inside the plot, % (the fixture profile's). */
  lossPct: number;
  geometry: Polygon;
  /** The agents assigned to record here. */
  agents: AgentKey[];
};

export type SeedPicking = {
  plot: string;
  agent: AgentKey;
  kg: number;
  photos: 1 | 2 | 3;
  /** The verdict the checks give it. */
  expect: 'Verified' | 'Needs Review';
  /** An office decision after review (TKT-12): signed and anchored like any override. */
  override?: { verdict: 'Verified'; reason: string };
};

export type { AttackId };

export type SeedAttack = {
  id: AttackId;
  title: string;
  /** What the attack tries, for the demo card. */
  story: string;
  plot: string;
  kg: number;
  photos: 1 | 2 | 3;
  /** gps-spoof: the phone reports a point this many metres outside the plot edge. */
  outsideM?: number;
  /** replay: the photos are the exact bytes of this earlier honest picking (index into `history`). */
  photosOf?: number;
  expected: { verdict: 'Needs Review' | 'Rejected'; check: string; evidence: string };
};

const PLOTS_DIR = fileURLToPath(new URL('../../evals/fixtures/plots/', import.meta.url));

type FixtureFeature = { properties: { id: string; area_ha: number; anchor: { place: string; lat: number; lng: number } }; geometry: Polygon };

/** A point at least `marginM` inside `g`: its anchor, else the vertex average moved towards a corner. */
function insidePoint(g: Polygon, start: { lat: number; lng: number }, marginM = 15): [number, number] {
  const r7 = (n: number) => Math.round(n * 1e7) / 1e7;
  const ring = g.coordinates[0]!.slice(0, -1);
  const avg = { lng: ring.reduce((s, p) => s + p[0]!, 0) / ring.length, lat: ring.reduce((s, p) => s + p[1]!, 0) / ring.length };
  for (const c of [start, avg]) {
    for (let t = 0; t < 1; t += 0.05) {
      const p = { lat: r7(c.lat + (ring[0]![1]! - c.lat) * t), lng: r7(c.lng + (ring[0]![0]! - c.lng) * t) };
      const at = locate(p, g);
      if (at.inside && at.distanceToEdgeM > marginM) return [p.lng, p.lat];
    }
  }
  throw new Error('no inside point found');
}

function fixturePlot(id: string): Pick<SeedPlot, 'geometry' | 'areaHa' | 'centre' | 'place'> {
  const f = JSON.parse(readFileSync(`${PLOTS_DIR}${id}.geojson`, 'utf8')) as FixtureFeature;
  return { geometry: f.geometry, areaHa: f.properties.area_ha, centre: insidePoint(f.geometry, f.properties.anchor), place: f.properties.anchor.place };
}

/** Y01: a 0.4 ha rectangle (1.6:1, long side east–west) near Kottigehara, Chikkamagaluru. */
function y01(): Pick<SeedPlot, 'geometry' | 'areaHa' | 'centre' | 'place'> {
  const anchor = { lat: 13.1172, lng: 75.5183 };
  const ring = (k: number): Polygon => {
    const w = 1.6 * k;
    const h = k;
    const corners: [number, number][] = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ];
    const pts = corners.map((c) => toLngLat(anchor, c));
    return { type: 'Polygon', coordinates: [[...pts, pts[0]!]] };
  };
  let k = Math.sqrt(4_000 / 1.6);
  for (let i = 0; i < 4; i++) k *= Math.sqrt(4_000 / area(ring(k)));
  const geometry = ring(k);
  return { geometry, areaHa: 0.4, centre: insidePoint(geometry, anchor), place: 'Kottigehara, Chikkamagaluru' };
}

/** The second field agent (EXE13: an opaque fixed ID like every seeded user). */
export const AGENT2_ID = 'USR-5W3KDT9N';

const plot = (
  id: string,
  farmer: SeedPlot['farmer'],
  crop: SeedCrop,
  district: SeedDistrict,
  shape: SeedPlot['shape'],
  agents: AgentKey[],
  o: { profile?: string; lossPct?: number } = {},
): SeedPlot => ({
  id,
  farmer,
  crop,
  district,
  shape,
  agents,
  profile: o.profile ?? id,
  lossPct: o.lossPct ?? 0,
  ...(id === 'Y01' ? y01() : fixturePlot(id)),
});

const MOVED_ON = 'Scale photo and the day’s pile checked by the office: a heavy final round';

export const SEED = {
  fpo: { id: DEMO_ORGS.fpoA.id, name: 'Hosahalli Coffee Growers FPO' },
  buyer: { id: DEMO_ORGS.buyerA.id, name: 'Western Ghats Green Coffee (demo buyer)' },
  users: [
    { key: 'admin', id: DEMO_ACCOUNTS.adminA.id, email: DEMO_ACCOUNTS.adminA.email, name: 'Hosahalli FPO office', role: 'admin', org: 'fpo' },
    { key: 'agent1', id: DEMO_ACCOUNTS.agentA.id, email: DEMO_ACCOUNTS.agentA.email, name: 'Field agent, Madikeri round', role: 'agent', org: 'fpo' },
    { key: 'agent2', id: AGENT2_ID, email: 'agent2@hosahalli.udgam.test', name: 'Field agent, Chikkamagaluru round', role: 'agent', org: 'fpo' },
    { key: 'buyer', id: DEMO_ACCOUNTS.buyerA.id, email: DEMO_ACCOUNTS.buyerA.email, name: 'Green coffee buyer', role: 'buyer', org: 'buyer' },
  ] satisfies SeedUser[],
  plots: [
    plot('P01', { name: 'Bopanna Machimada (demo)', identifier: 'DEMO-KGU-0101' }, 'arabica', 'Kodagu', 'convex', ['agent1', 'agent2']),
    plot('P02', { name: 'Kaveri Palanganda (demo)', identifier: null }, 'arabica', 'Kodagu', 'irregular', ['agent1']),
    plot('P03', { name: 'Chengappa Ajjikuttira (demo)', identifier: 'DEMO-KGU-0303' }, 'robusta', 'Kodagu', 'irregular', ['agent1']),
    plot('P04', { name: 'Muthamma Biddanda (demo)', identifier: null }, 'arabica', 'Kodagu', 'concave_L', ['agent1']),
    plot('P05', { name: 'Ganapathy Chendira (demo)', identifier: null }, 'robusta', 'Kodagu', 'convex', ['agent1']),
    plot('P06', { name: 'Seetha Devaiah (demo)', identifier: null }, 'arabica', 'Kodagu', 'convex', ['agent1', 'agent2']),
    plot('P07', { name: 'Nanjappa Kodira (demo)', identifier: null }, 'arabica', 'Kodagu', 'irregular', ['agent1']),
    plot('P08', { name: 'Ponnamma Thimmaiah (demo)', identifier: null }, 'robusta', 'Kodagu', 'convex', ['agent1']),
    plot('P09', { name: 'Kariappa Somaiah (demo)', identifier: null }, 'arabica', 'Kodagu', 'convex', ['agent1']),
    plot('P10', { name: 'Rajeshwari Hemmige (demo)', identifier: null }, 'robusta', 'Kodagu', 'convex', ['agent1']),
    plot('X01', { name: 'Shankar Gowda Ramanna (demo)', identifier: null }, 'arabica', 'Chikkamagaluru', 'convex', ['agent2'], { lossPct: 25 }),
    plot('Y01', { name: 'Lakshmi Nagaraj (demo)', identifier: null }, 'arabica', 'Chikkamagaluru', 'convex', ['agent1', 'agent2'], { profile: 'P01' }),
  ],
  /**
   * Honest pickings, oldest first, all on agent 1's phone. Every one is Verified except P09's (the
   * satellite view of the harvest window is cloud-blocked: Needs Review) and Y01's last: 3 300 kg on
   * 0.4 ha is 1.76x the reference bound, a flag the office cleared after review.
   */
  history: [
    { plot: 'P01', agent: 'agent1', kg: 62.5, photos: 3, expect: 'Verified' },
    { plot: 'P02', agent: 'agent1', kg: 38.5, photos: 2, expect: 'Verified' },
    { plot: 'P07', agent: 'agent1', kg: 22.5, photos: 1, expect: 'Verified' },
    { plot: 'P05', agent: 'agent1', kg: 96, photos: 3, expect: 'Verified' },
    { plot: 'P08', agent: 'agent1', kg: 84, photos: 2, expect: 'Verified' },
    { plot: 'P03', agent: 'agent1', kg: 120, photos: 3, expect: 'Verified' },
    { plot: 'P09', agent: 'agent1', kg: 57, photos: 2, expect: 'Needs Review' },
    { plot: 'P04', agent: 'agent1', kg: 48, photos: 2, expect: 'Verified' },
    { plot: 'P06', agent: 'agent1', kg: 44, photos: 1, expect: 'Verified' },
    { plot: 'P10', agent: 'agent1', kg: 140, photos: 3, expect: 'Verified' },
    { plot: 'P01', agent: 'agent1', kg: 58, photos: 2, expect: 'Verified' },
    { plot: 'P02', agent: 'agent1', kg: 41, photos: 1, expect: 'Verified' },
    { plot: 'P07', agent: 'agent1', kg: 19, photos: 2, expect: 'Verified' },
    { plot: 'P05', agent: 'agent1', kg: 88.5, photos: 2, expect: 'Verified' },
    { plot: 'P08', agent: 'agent1', kg: 91, photos: 3, expect: 'Verified' },
    { plot: 'P03', agent: 'agent1', kg: 135.5, photos: 2, expect: 'Verified' },
    { plot: 'P09', agent: 'agent1', kg: 60.5, photos: 3, expect: 'Needs Review' },
    { plot: 'P04', agent: 'agent1', kg: 52.5, photos: 1, expect: 'Verified' },
    { plot: 'P06', agent: 'agent1', kg: 39.5, photos: 2, expect: 'Verified' },
    { plot: 'P10', agent: 'agent1', kg: 152.5, photos: 2, expect: 'Verified' },
    { plot: 'P01', agent: 'agent1', kg: 71.5, photos: 3, expect: 'Verified' },
    { plot: 'P03', agent: 'agent1', kg: 128, photos: 1, expect: 'Verified' },
    // Y01, the small plot near Kottigehara: a long, heavy season, all in the current one (run.ts).
    { plot: 'Y01', agent: 'agent1', kg: 400, photos: 3, expect: 'Verified' },
    { plot: 'Y01', agent: 'agent1', kg: 400, photos: 2, expect: 'Verified' },
    { plot: 'Y01', agent: 'agent1', kg: 400, photos: 2, expect: 'Verified' },
    { plot: 'Y01', agent: 'agent1', kg: 400, photos: 3, expect: 'Verified' },
    { plot: 'Y01', agent: 'agent1', kg: 400, photos: 1, expect: 'Verified' },
    { plot: 'Y01', agent: 'agent1', kg: 400, photos: 2, expect: 'Verified' },
    { plot: 'Y01', agent: 'agent1', kg: 400, photos: 3, expect: 'Verified' },
    { plot: 'Y01', agent: 'agent1', kg: 500, photos: 3, expect: 'Needs Review', override: { verdict: 'Verified', reason: MOVED_ON } },
  ] satisfies SeedPicking[],
  /** The agent whose phone signs the staged attacks (the demo's second phone). */
  attackAgent: 'agent2' as AgentKey,
  /**
   * The four staged attacks (scenarios 1–4, F15), signed at seed time by agent 2's phone in this order,
   * two hours apart so the phone's own moves stay plausible. Submitted from /admin/demo.
   */
  attacks: [
    {
      id: 'gps-spoof',
      title: 'Recorded away from the plot',
      story: 'The phone was 320 m outside the farm it names.',
      plot: 'P06',
      kg: 41.5,
      photos: 2,
      outsideM: 320,
      expected: { verdict: 'Needs Review', check: 'geofence', evidence: 'm outside the plot edge' },
    },
    {
      id: 'replay',
      title: 'Old photos sent again',
      story: 'The photos of an earlier picking on this farm, sent as a new one.',
      plot: 'P01',
      kg: 60,
      photos: 3,
      photosOf: 0,
      expected: { verdict: 'Rejected', check: 'photo_uniqueness', evidence: 'photos seen before' },
    },
    {
      id: 'yield-inflation',
      title: 'More cherry than the plot can grow',
      story: 'Another 500 kg on a 0.4 ha plot that has already given 3 300 kg this season.',
      plot: 'Y01',
      kg: 500,
      photos: 3,
      expected: { verdict: 'Rejected', check: 'yield_plausibility', evidence: 'x the reference upper bound' },
    },
    {
      id: 'plot-laundering',
      title: 'Cherry from cleared forest',
      story: 'A picking on a plot that lost a quarter of its canopy after 2020.',
      plot: 'X01',
      kg: 60,
      photos: 2,
      expected: { verdict: 'Rejected', check: 'deforestation_overlap', evidence: '% of plot area lost since 2021' },
    },
  ] satisfies SeedAttack[],
} as const;
