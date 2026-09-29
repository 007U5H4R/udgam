import { area, booleanPointInPolygon, kinks, point, polygon } from '@turf/turf';
import type { PlotPolygon, Position } from './types';

// EU Information System geometry rules for a plot (TSK-06.2), shared by uploads (parse.ts), the Server
// Actions and the map editor. Input is a normalised geometry: [lng, lat] positions, 6 dp.

export type PlotGeomError =
  | 'empty'
  | 'not_polygon'
  | 'open_ring'
  | 'too_few_positions'
  | 'self_intersection'
  | 'has_holes'
  | 'not_wgs84'
  | 'too_many_vertices'
  | 'duplicate_vertices'
  /** A ring with (almost) no area: collinear points or a sliver under MIN_PART_AREA_M2. */
  | 'degenerate'
  /** Outside PLOT_REGION, or wider than it allows: catches swapped lat/lng and antimeridian rings. */
  | 'out_of_region'
  /** A KML file with a DOCTYPE (entities are never needed and never expanded). */
  | 'unsupported_kml';

export const MAX_VERTICES = 1000;

/**
 * Plausibility bounds for a plot (TKT-06 fix round 1). Udgam registers coffee plots in India, so every
 * vertex must lie inside India's bounding box, and no ring may span more than `maxSpanDeg` degrees in
 * latitude or longitude (about 110 km: far larger than any smallholding). This refuses swapped
 * latitude/longitude, rings across the antimeridian or round a pole, and projected coordinates that
 * happen to fall inside ±180/±90. Config as data: widen here if Udgam ever registers plots elsewhere.
 */
export const PLOT_REGION = { minLat: 6, maxLat: 37, minLng: 68, maxLng: 98, maxSpanDeg: 1 } as const;

/** Below this a part is a line or a sliver, not a plot (square metres). */
export const MIN_PART_AREA_M2 = 1;

const samePosition = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

function outOfRegion(ring: Position[]): boolean {
  const lngs = ring.map((p) => p[0]!);
  const lats = ring.map((p) => p[1]!);
  const r = PLOT_REGION;
  if (lngs.some((x) => x < r.minLng || x > r.maxLng) || lats.some((y) => y < r.minLat || y > r.maxLat)) return true;
  return Math.max(...lngs) - Math.min(...lngs) > r.maxSpanDeg || Math.max(...lats) - Math.min(...lats) > r.maxSpanDeg;
}

/**
 * True when some part lies inside another part: a hole written as a separate part (common in KML
 * MultiGeometry). kinks has already ruled out crossing edges, so any vertex strictly inside another
 * part means the whole part is inside it.
 */
function hasNestedPart(parts: Position[][][]): boolean {
  if (parts.length < 2) return false;
  const shapes = parts.map((p) => polygon(p));
  return parts.some((part, i) =>
    shapes.some((other, j) => j !== i && part[0]!.some((v) => booleanPointInPolygon(point(v), other, { ignoreBoundary: true }))),
  );
}

/**
 * The first rule the geometry breaks, or null. In order: WGS84 range, the plausible region, no holes,
 * closed rings (never closed for the admin), ≥ 4 positions per ring, ≤ 1000 vertices (closing
 * positions excluded), no duplicate consecutive vertices, no self-intersection (@turf/kinks), no
 * degenerate ring, no part nested in another (reported as a hole).
 */
export function validatePolygon(g: PlotPolygon): PlotGeomError | null {
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  if (polygons.length === 0 || polygons.some((p) => p.length === 0)) return 'empty';
  const rings = polygons.flat();
  if (rings.some((r) => r.some(([lng, lat]) => !(Math.abs(lng!) <= 180 && Math.abs(lat!) <= 90)))) return 'not_wgs84';
  if (rings.some(outOfRegion)) return 'out_of_region';
  if (polygons.some((p) => p.length > 1)) return 'has_holes';
  for (const ring of rings) {
    if (ring.length === 0) return 'too_few_positions';
    if (!samePosition(ring[0]!, ring.at(-1)!)) return 'open_ring';
    if (ring.length < 4) return 'too_few_positions';
  }
  if (rings.reduce((n, r) => n + r.length - 1, 0) > MAX_VERTICES) return 'too_many_vertices';
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) if (samePosition(ring[i - 1]!, ring[i]!)) return 'duplicate_vertices';
  }
  if (kinks(g).features.length > 0) return 'self_intersection';
  // After kinks: a bow-tie's lobes cancel in the signed area, so it must be named a crossing first.
  if (polygons.some((p) => area(polygon(p)) < MIN_PART_AREA_M2)) return 'degenerate';
  if (hasNestedPart(polygons)) return 'has_holes';
  return null;
}
