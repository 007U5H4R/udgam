import { booleanPointInPolygon, point } from '@turf/turf';
import { distanceToEdgeM } from './distance';
import type { LatLng, PlotPolygon } from './types';

export type GeofenceResult = { status: 'ok' | 'flag' | 'fail'; distanceM: number; bufferM: number };

/**
 * technical-plan §6.3 geofence: ok inside the polygon (holes are outside); flag outside when the
 * distance to the edge is ≤ min(accuracy, maxBuffer); fail beyond that buffer.
 */
export function geofenceStatus(p: LatLng, polygon: PlotPolygon, accuracyM: number, maxBufferM: number): GeofenceResult {
  const bufferM = Math.min(accuracyM, maxBufferM);
  const distanceM = distanceToEdgeM(p, polygon);
  if (booleanPointInPolygon(point([p.lng, p.lat]), polygon)) return { status: 'ok', distanceM, bufferM };
  return { status: distanceM <= bufferM ? 'flag' : 'fail', distanceM, bufferM };
}
