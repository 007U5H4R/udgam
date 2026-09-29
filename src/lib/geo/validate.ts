import { kinks } from '@turf/turf';
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
  | 'duplicate_vertices';

export const MAX_VERTICES = 1000;

const samePosition = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

/**
 * The first rule the geometry breaks, or null. In order: WGS84 range, no holes, closed rings (never
 * closed for the admin), ≥ 4 positions per ring, ≤ 1000 vertices (closing positions excluded), no
 * duplicate consecutive vertices, no self-intersection (@turf/kinks).
 */
export function validatePolygon(g: PlotPolygon): PlotGeomError | null {
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  if (polygons.length === 0 || polygons.some((p) => p.length === 0)) return 'empty';
  const rings = polygons.flat();
  if (rings.some((r) => r.some(([lng, lat]) => !(Math.abs(lng!) <= 180 && Math.abs(lat!) <= 90)))) return 'not_wgs84';
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
  return null;
}
