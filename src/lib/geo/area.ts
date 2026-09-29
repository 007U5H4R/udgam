import { area } from '@turf/turf';
import { jcs, sha256Hex } from '../crypto';
import type { PlotPolygon } from './types';

// Plot area and identity (TSK-06.2, TC-027). The area comes from @turf/area, which measures on a sphere
// (radius 6 371 008.8 m), not on the WGS84 ellipsoid: at Kodagu's latitude (about 12.4°N) it reads about
// 0.39 % above the ellipsoidal area (TC-027 allows 0.5 %). It is always computed on the server from the
// geometry, never taken from a client.

/** Spherical area in hectares, not rounded. */
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
