import { area, booleanPointInPolygon, point } from '@turf/turf';
import { describe, expect, it } from 'vitest';
import { P01_AREA_HA, P01_INSIDE, P01_POLYGON, randomId } from '../scripts/tracer-world';

describe('tracer plot P01', () => {
  it('is 2.0 ha within 1 % (@turf/area)', () => {
    expect(P01_AREA_HA).toBe(2);
    const ha = area(P01_POLYGON) / 10_000;
    expect(Math.abs(ha - 2) / 2).toBeLessThan(0.01);
  });

  it('is a closed, convex, counter-clockwise ring near Madikeri', () => {
    const ring = P01_POLYGON.coordinates[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const pts = ring.slice(0, -1);
    const crosses = pts.map((a, i) => {
      const b = pts[(i + 1) % pts.length]!;
      const c = pts[(i + 2) % pts.length]!;
      return (b[0]! - a[0]!) * (c[1]! - b[1]!) - (b[1]! - a[1]!) * (c[0]! - b[0]!);
    });
    expect(crosses.every((x) => x > 0)).toBe(true);
    for (const [lng, lat] of pts) {
      expect(Math.abs(lat! - 12.42)).toBeLessThan(0.01);
      expect(Math.abs(lng! - 75.74)).toBeLessThan(0.01);
    }
    expect(booleanPointInPolygon(point([P01_INSIDE.lng, P01_INSIDE.lat]), P01_POLYGON)).toBe(true);
  });

  it('makes producer and device IDs of prefix + 8 Crockford base32', () => {
    expect(randomId('PR-')).toMatch(/^PR-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(randomId('DV-')).toMatch(/^DV-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(new Set(Array.from({ length: 50 }, () => randomId('PR-'))).size).toBe(50);
  });
});
