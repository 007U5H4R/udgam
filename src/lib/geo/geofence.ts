import { booleanPointInPolygon, point } from '@turf/turf';
import { distanceToEdgeM } from './distance';
import type { LatLng, PlotPolygon } from './types';

export type Location = { inside: boolean; distanceToEdgeM: number };

/**
 * Where a point is relative to a plot: inside by true point-in-polygon (a concave notch or a hole is
 * outside even within the bounding box), and its distance in metres to the nearest ring segment.
 */
export function locate(p: LatLng, polygon: PlotPolygon): Location {
  return { inside: booleanPointInPolygon(point([p.lng, p.lat]), polygon), distanceToEdgeM: distanceToEdgeM(p, polygon) };
}

export type GeofenceResult = { status: 'ok' | 'flag' | 'fail'; distanceM: number; bufferM: number };

/**
 * technical-plan §6.3 geofence: ok inside the polygon (holes are outside); flag outside when the
 * distance to the edge is ≤ min(accuracy, maxBuffer); fail beyond that buffer. Raw metres are
 * compared; only the evidence rounds them.
 */
export function geofenceStatus(p: LatLng, polygon: PlotPolygon, accuracyM: number, maxBufferM: number): GeofenceResult {
  const bufferM = Math.min(accuracyM, maxBufferM);
  const { inside, distanceToEdgeM: distanceM } = locate(p, polygon);
  if (inside) return { status: 'ok', distanceM, bufferM };
  return { status: distanceM <= bufferM ? 'flag' : 'fail', distanceM, bufferM };
}
