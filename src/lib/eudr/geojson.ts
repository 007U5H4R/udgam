import { booleanPointInPolygon, pointOnFeature } from '@turf/turf';
import { districtOf, STATE } from '../certificate/district';
import { certificateUrl } from '../certificate/qr';
import { buildCertificateView, type CertPlot } from '../certificate/view-model';
import { env } from '../config/env';
import { areaHa } from '../geo/area';
import type { PlotPolygon, Position } from '../geo/types';
import type { ProofFeedV1 } from '../ledger/proof';

// The EUDR geolocation file (TSK-17.1, technical-plan §12, TP24; format and sources in docs/eudr-geojson.md,
// validated by docs/eudr-geojson.schema.json). A WGS84 FeatureCollection, one Feature per plot of the
// batch, shaped to the European Commission's EUDR GeoJson File Description v1.5 (5 May 2025):
//   - [longitude, latitude] at 6 decimals, consecutive duplicates removed after rounding;
//   - rings follow RFC 7946's right-hand rule: an exterior ring counter-clockwise (a hole clockwise);
//   - a plot of 4 ha or more is its Polygon (outer ring only, closed); a smaller plot is a Point on its
//     surface with its `Area` in hectares, or, when it was anchored as several parts, a MultiPoint with
//     one interior point per part, in part order (EXE26);
//   - EU properties ProducerName (the pseudonymous producer ID, never a name: EV16), ProducerCountry,
//     ProductionPlace (district, Karnataka) and Area; Udgam's extras, which the EU system ignores.
// Built from the proof feed's payloads alone, through the certificate's view model (TP16): each plot's
// polygon and area are those of its latest plot_registered / plot_edited entry. Pure apart from the
// default base URL (env.PUBLIC_BASE_URL) for `certificate_url`.

/** A plot of this many hectares or more exports as a Polygon (TP24; the Regulation allows a Point up to 4 ha). */
export const POLYGON_FROM_HA = 4;
/** Decimal places of every coordinate (about 0.11 m at the equator). */
export const COORD_DECIMALS = 6;
export const HS_CODE = '0901 11';
export const COMMODITY = 'coffee';
export const PRODUCER_COUNTRY = 'IN';

export type EudrGeometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'MultiPoint'; coordinates: Position[] }
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };

export type EudrProperties = {
  ProducerName: string;
  ProducerCountry: typeof PRODUCER_COUNTRY;
  ProductionPlace: string;
  /** Hectares, two decimals; Points and MultiPoints only. */
  Area?: number;
  commodity: typeof COMMODITY;
  hs_code: typeof HS_CODE;
  /** The whole batch's fresh-cherry kilograms (the same on every Feature). */
  quantity_kg_cherry: number;
  crop: string;
  batch_id: string;
  certificate_url: string;
};

export type EudrFeature = { type: 'Feature'; geometry: EudrGeometry; properties: EudrProperties };
export type EudrFeatureCollection = { type: 'FeatureCollection'; features: EudrFeature[] };

const SCALE = 10 ** COORD_DECIMALS;
const round6 = (n: number): number => Math.round(n * SCALE) / SCALE;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const pos6 = (p: Position): Position => [round6(p[0]!), round6(p[1]!)];
const samePos = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

/** A plot's geometry that cannot be exported under TP24 (a registered plot cannot reach it); the route logs its class. */
export class EudrGeometryError extends Error {
  override name = 'EudrGeometryError';
}

/**
 * Twice the signed area of a closed ring in lon/lat (shoelace): positive when counter-clockwise. Every
 * position is taken relative to the first, so a small ring far from (0, 0) keeps its sign instead of
 * cancelling away in terms of the size of the absolute coordinates (Q8).
 */
function signedArea2(ring: Position[]): number {
  const [x0, y0] = ring[0] as [number, number];
  let sum = 0;
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = [ring[i - 1]![0]! - x0, ring[i - 1]![1]! - y0];
    const [bx, by] = [ring[i]![0]! - x0, ring[i]![1]! - y0];
    sum += ax * by - bx * ay;
  }
  return sum;
}

/** A closed ring reversed when its winding is not the wanted one (first and last positions stay equal). */
const wound = (ring: Position[], ccw: boolean): Position[] => (signedArea2(ring) > 0 === ccw ? ring : [...ring].reverse());

/** A polygon's rings under RFC 7946 §3.1.6: the exterior ring counter-clockwise, every hole clockwise. */
export function orientRings(rings: Position[][]): Position[][] {
  return rings.map((r, i) => wound(r, i === 0));
}

/** An outer ring at 6 decimals: consecutive duplicates dropped, closed. Null when fewer than 4 positions remain. */
function cleanRing(ring: Position[]): Position[] | null {
  const out: Position[] = [];
  for (const p of ring) {
    const r = pos6(p);
    if (out.length === 0 || !samePos(out.at(-1)!, r)) out.push(r);
  }
  if (out.length > 1 && samePos(out[0]!, out.at(-1)!)) out.pop();
  if (out.length < 3) return null;
  out.push(out[0]!);
  return out;
}

const outerRings = (g: PlotPolygon): Position[][] => (g.type === 'Polygon' ? [g.coordinates[0] ?? []] : g.coordinates.map((p) => p[0] ?? []));

/**
 * A point strictly inside the plot, at 6 decimals: turf's point on the surface when it is strictly inside
 * after rounding, else the middle of the widest stretch of a horizontal line across the plot (a concave
 * plot's centre can sit in its notch, and turf then falls back to a vertex, which is on the edge).
 */
export function interiorPoint(g: PlotPolygon): Position {
  const inside = (p: Position) => booleanPointInPolygon(p, g, { ignoreBoundary: true });
  const turfPoint = pos6(pointOnFeature(g).geometry.coordinates);
  if (inside(turfPoint)) return turfPoint;
  const rings = outerRings(g);
  const lats = rings.flat().map((p) => p[1]!);
  const [south, north] = [Math.min(...lats), Math.max(...lats)];
  for (const f of [0.5, 0.25, 0.75, 0.375, 0.625, 0.125, 0.875]) {
    const y = south + (north - south) * f;
    const xs: number[] = [];
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i++) {
        const [x1, y1] = ring[i - 1]! as [number, number];
        const [x2, y2] = ring[i]! as [number, number];
        if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    let best: Position | null = null;
    let width = 0;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1]! - xs[i]! > width) {
        width = xs[i + 1]! - xs[i]!;
        best = pos6([(xs[i]! + xs[i + 1]!) / 2, y]);
      }
    }
    if (best && inside(best)) return best;
  }
  return turfPoint;
}

/**
 * The plot's geometry under TP24: at 4 ha or more (on the area at two decimals, as the product shows it) a
 * Polygon, or a MultiPolygon for a plot anchored as several parts, each with its outer ring only, oriented
 * counter-clockwise; else a Point on its surface and its area, or for a plot anchored as several parts a
 * MultiPoint with one interior point per part, in part order, and the plot's area (EXE26: every parcel is
 * located). A plot of 4 ha or more is never downgraded to a Point: a ring that collapses under rounding is
 * an impossible state for a registered plot, so it throws an EudrGeometryError.
 */
function geometryOf(plot: CertPlot): { geometry: EudrGeometry; area?: number } {
  const area = round2(plot.areaHa ?? areaHa(plot.polygon));
  if (area >= POLYGON_FROM_HA) {
    const rings = outerRings(plot.polygon).map(cleanRing);
    if (!rings.every((r): r is Position[] => r !== null)) {
      throw new EudrGeometryError(`EUDR export: plot ${plot.plotId} is ${area} ha but a ring has fewer than 4 positions after rounding to ${COORD_DECIMALS} decimals`);
    }
    const parts = rings.map((r) => orientRings([r]));
    return parts.length === 1 ? { geometry: { type: 'Polygon', coordinates: parts[0]! } } : { geometry: { type: 'MultiPolygon', coordinates: parts } };
  }
  const g = plot.polygon;
  if (g.type === 'MultiPolygon' && g.coordinates.length > 1) {
    const points = g.coordinates.map((coordinates) => interiorPoint({ type: 'Polygon', coordinates }));
    return { geometry: { type: 'MultiPoint', coordinates: points }, area };
  }
  return { geometry: { type: 'Point', coordinates: interiorPoint(g) }, area };
}

/** "Kodagu, Karnataka" (district only, never a village); "Karnataka" for a plot outside the listed districts. */
export function productionPlace(polygon: PlotPolygon): string {
  const district = districtOf([polygon]);
  return district === STATE ? STATE : `${district}, ${STATE}`;
}

/** The EUDR geolocation FeatureCollection of a batch, from its proof feed. */
export function buildEudrGeoJson(feed: ProofFeedV1, baseUrl: string = env.PUBLIC_BASE_URL): EudrFeatureCollection {
  const view = buildCertificateView(feed);
  const url = certificateUrl(view.batchId, view.shortHash, baseUrl);
  const features = view.plots.map((plot): EudrFeature => {
    const { geometry, area } = geometryOf(plot);
    return {
      type: 'Feature',
      geometry,
      properties: {
        ProducerName: plot.producerId,
        ProducerCountry: PRODUCER_COUNTRY,
        ProductionPlace: productionPlace(plot.polygon),
        ...(area !== undefined ? { Area: area } : {}),
        commodity: COMMODITY,
        hs_code: HS_CODE,
        quantity_kg_cherry: view.headline.quantityKg,
        crop: view.headline.crop,
        batch_id: view.batchId,
        certificate_url: url,
      },
    };
  });
  return { type: 'FeatureCollection', features };
}

/** Coordinates (a position or nested arrays of them) as JSON text, every number with exactly 6 decimals. */
function coordinatesText(c: unknown): string {
  if (typeof c === 'number') return c.toFixed(COORD_DECIMALS);
  if (Array.isArray(c)) return `[${c.map(coordinatesText).join(',')}]`;
  throw new TypeError('EUDR export: a coordinate is neither a number nor an array');
}

/**
 * The file's bytes: JSON with every coordinate written with exactly 6 decimals ("12.420000", not "12.42"),
 * so a validator counting decimal digits sees the full precision. Geometry is written by hand; everything
 * else goes through JSON.stringify untouched. Parses back to the same object.
 */
export function serializeEudrGeoJson(fc: EudrFeatureCollection): string {
  const feature = (f: EudrFeature) =>
    `{"type":"Feature","geometry":{"type":${JSON.stringify(f.geometry.type)},"coordinates":${coordinatesText(f.geometry.coordinates)}},"properties":${JSON.stringify(f.properties)}}`;
  return `{"type":"FeatureCollection","features":[${fc.features.map(feature).join(',')}]}`;
}
