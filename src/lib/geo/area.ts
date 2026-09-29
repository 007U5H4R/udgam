import { area } from '@turf/turf';
import { jcs, sha256Hex } from '../crypto';
import type { PlotPolygon } from './types';

// Plot area and identity (TSK-06.2, TC-027). The area is geodesic (@turf/area on the WGS84 ellipsoid
// approximation) and always computed on the server from the geometry, never taken from a client.

/** Geodesic area in hectares, not rounded. */
export function areaHa(g: PlotPolygon): number {
  return area(g) / 10_000;
}

/** Area for display: two decimals and the unit ("2.00 ha"). */
export function formatHa(ha: number): string {
  return `${ha.toFixed(2)} ha`;
}

/**
 * SHA-256 hex of the geometry's canonical JSON (RFC 8785), so key order never matters and any moved
 * vertex changes it. The remote-sensing cache is keyed by it, so an edited polygon misses (§4.1,
 * EVAL-044).
 */
export function geometryHash(g: PlotPolygon): Promise<string> {
  return sha256Hex(jcs({ type: g.type, coordinates: g.coordinates }));
}
