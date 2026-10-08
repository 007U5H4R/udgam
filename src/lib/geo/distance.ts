import { lineString, point, pointToLineDistance } from '@turf/turf';
import type { LatLng, PlotPolygon, Position } from './types';

const R = 6_371_008.8; // mean earth radius, metres (turf's default)
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Every ring (outer boundaries and holes) of a polygon or multipolygon. */
export function ringsOf(polygon: PlotPolygon): Position[][] {
  return polygon.type === 'Polygon' ? polygon.coordinates : polygon.coordinates.flat();
}

/** Distance in metres from a point to the nearest polygon edge (any ring), inside or outside. */
export function distanceToEdgeM(p: LatLng, polygon: PlotPolygon): number {
  const pt = point([p.lng, p.lat]);
  let best = Infinity;
  for (const ring of ringsOf(polygon)) {
    best = Math.min(best, pointToLineDistance(pt, lineString(ring), { units: 'meters' }));
  }
  return best;
}
