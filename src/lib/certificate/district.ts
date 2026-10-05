import type { PlotPolygon } from '../geo/types';

// The district a plot lies in, for the certificate's headline and the EUDR "ProductionPlace" (district
// only, never a village; technical-plan §12). Derived from the anchored polygon itself (TP16: nothing
// displayed comes from outside the feed). Udgam's M1 area is two coffee districts of Karnataka, so a
// coarse bounding box per district is enough; anything outside both reads as the state.
// Boxes (WGS84, degrees) enclose each district's administrative area with a small margin; they do not
// overlap. Pure and isomorphic.

type Box = { name: string; south: number; north: number; west: number; east: number };

export const DISTRICT_BOXES: readonly Box[] = [
  { name: 'Kodagu', south: 11.93, north: 12.87, west: 75.37, east: 76.2 },
  { name: 'Chikkamagaluru', south: 12.9, north: 13.9, west: 75.05, east: 76.35 },
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

/** The district name of a point, or null outside the listed districts. */
export function districtAt(p: { lat: number; lng: number }): string | null {
  return DISTRICT_BOXES.find((b) => p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east)?.name ?? null;
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
