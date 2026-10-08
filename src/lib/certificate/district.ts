import type { PlotPolygon } from '../geo/types';

// The district a plot lies in, for the certificate's headline and the EUDR "ProductionPlace" (district
// only, never a village; technical-plan §12). Derived from the anchored polygon itself (TP16: nothing
// displayed comes from outside the feed). Pure and isomorphic.
//
// TASK-17 fix round 1: a point-in-polygon test against one simplified area per district, so a plot in a
// neighbouring district (Sakleshpur in Hassan, Sullia in Dakshina Kannada) is never published as Kodagu
// or Chikkamagaluru. The areas are CONSERVATIVE: each lies inside its district, short of every border, and
// none overlaps another; a plot in no area (a border strip, or anywhere else) reads as the state, which
// is never false. Coffee country near a border therefore may read "Karnataka" rather than its district.
//
// Source and licence: the rings were hand-drawn for Udgam (owner's project, no third-party geometry
// copied, so no external licence applies) around taluk headquarters at their public coordinates, kept
// well inside the administrative boundaries. They are not survey boundaries. An official, licensed
// boundary set (for example Survey of India or DataMeet's census districts, CC BY 2.5 IN) was not
// reachable from the build sandbox; swapping one in only replaces DISTRICT_AREAS (TASK-17 report).

/** A district's area: one outer ring of [lng, lat] (WGS84 degrees), not closed. */
export type DistrictArea = { name: string; ring: readonly (readonly [number, number])[] };

export const DISTRICT_AREAS: readonly DistrictArea[] = [
  {
    name: 'Kodagu',
    ring: [
      [75.7, 12.75],
      [75.92, 12.75],
      [75.97, 12.48],
      [76.0, 12.3],
      [76.06, 12.1],
      [76.06, 12.0],
      [75.95, 11.98],
      [75.85, 12.03],
      [75.72, 12.12],
      [75.6, 12.28],
      [75.5, 12.36],
      [75.5, 12.45],
      [75.62, 12.55],
    ],
  },
  {
    name: 'Chikkamagaluru',
    ring: [
      [75.5, 13.1],
      [75.68, 13.08],
      [75.72, 13.24],
      [75.82, 13.28],
      [75.85, 13.45],
      [75.8, 13.6],
      [75.55, 13.62],
      [75.3, 13.55],
      [75.2, 13.4],
      [75.35, 13.2],
    ],
  },
  {
    name: 'Hassan',
    ring: [
      [75.72, 12.95],
      [75.74, 12.88],
      [76.05, 12.85],
      [76.35, 12.85],
      [76.4, 13.0],
      [76.25, 13.25],
      [75.92, 13.22],
      [75.8, 13.08],
    ],
  },
  {
    name: 'Dakshina Kannada',
    // The south-west edge stays north and east of the Kerala border (Kasaragod district: Perla, Adoor,
    // Delampady), conservatively: Sullia and Puttur are inside, Vitla and the border villages read as
    // the state (TASK-17 r2 N1).
    ring: [
      [75.36, 12.52],
      [75.45, 12.5],
      [75.5, 12.7],
      [75.35, 12.95],
      [75.1, 13.05],
      [74.85, 12.95],
      [74.84, 12.82],
      [75.05, 12.79],
      [75.2, 12.73],
      [75.36, 12.66],
    ],
  },
];

export const STATE = 'Karnataka';
export const COUNTRY = 'India';

/** The outer rings' mean vertex (closing position excluded): inside any plot of Udgam's shapes. */
export function plotCentre(g: PlotPolygon): { lat: number; lng: number } | null {
  const rings = g.type === 'Polygon' ? [g.coordinates[0] ?? []] : g.coordinates.map((p) => p[0] ?? []);
  const pts = rings.flatMap((r) => (r.length > 1 ? r.slice(0, -1) : r)).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pts.length === 0) return null;
  return { lng: pts.reduce((s, p) => s + p[0]!, 0) / pts.length, lat: pts.reduce((s, p) => s + p[1]!, 0) / pts.length };
}

/** Whether `p` lies strictly inside the area's ring (even-odd ray casting; a point on an edge may go either way). */
export function areaContains(area: DistrictArea, p: { lat: number; lng: number }): boolean {
  const r = area.ring;
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]!;
    const [xj, yj] = r[j]!;
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The district name of a point, or null outside every listed area. */
export function districtAt(p: { lat: number; lng: number }): string | null {
  return DISTRICT_AREAS.find((a) => areaContains(a, p))?.name ?? null;
}

/**
 * The district of a set of plots: one name when every plot is in it, "A and B" for two, else the state.
 * Plots outside the listed districts, or no plots at all, read as the state.
 */
export function districtOf(polygons: PlotPolygon[]): string {
  const names = new Set<string>();
  for (const g of polygons) {
    const c = plotCentre(g);
    const d = c ? districtAt(c) : null;
    if (!d) return STATE;
    names.add(d);
  }
  const list = [...names];
  if (list.length === 1) return list[0]!;
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return STATE;
}

/** "Kodagu, Karnataka, India" (or "Karnataka, India" when the district is the state). */
export const regionOf = (district: string): string => (district === STATE ? `${STATE}, ${COUNTRY}` : `${district}, ${STATE}, ${COUNTRY}`);
