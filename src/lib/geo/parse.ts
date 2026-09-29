import { kml } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import type { MultiPolygon, PlotPolygon, Polygon, Position } from './types';

// Plot boundary uploads (TSK-06.1, TC-026, F1). A GeoJSON or KML file becomes one WGS84 Polygon or
// MultiPolygon with [lng, lat] positions rounded to 6 dp, or a reason the admin can act on. Rules
// follow the EU Information System: closed rings (never closed for the admin: an open ring is an error,
// so they know), at least 4 positions per ring, no holes (the EU system ignores inner rings), at most
// 1000 vertices, no duplicate consecutive vertices after rounding, no self-intersection.

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

export type ParsedPlot = { ok: true; geometry: PlotPolygon } | { ok: false; reason: PlotGeomError };

const fail = (reason: PlotGeomError): ParsedPlot => ({ ok: false, reason });

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parse an uploaded plot file (GeoJSON by default; KML by a `.kml` name or XML content). */
export function parsePlotFile(name: string, text: string): ParsedPlot {
  if (text.trim() === '') return fail('empty');
  const isKml = /\.kml$/i.test(name) || text.trimStart().startsWith('<');
  let root: unknown;
  if (isKml) {
    root = kmlToGeoJson(text);
    if (root === null) return fail('not_polygon');
  } else {
    try {
      root = JSON.parse(text);
    } catch {
      return fail('not_polygon');
    }
  }
  const raw = extractGeometry(root);
  if (typeof raw === 'string') return fail(raw);
  const geometry = normaliseGeometry(raw);
  if (typeof geometry === 'string') return fail(geometry);
  const err = structuralError(geometry);
  return err ? fail(err) : { ok: true, geometry };
}

/** KML text → a GeoJSON FeatureCollection, or null when it is not well-formed XML. */
function kmlToGeoJson(text: string): unknown {
  try {
    const doc = new DOMParser({ onError: () => undefined }).parseFromString(text, 'text/xml');
    // togeojson reads the DOM through the standard interfaces that xmldom implements.
    return kml(doc as unknown as Document);
  } catch {
    return null;
  }
}

/** The one plot geometry in a FeatureCollection, Feature or Geometry, or why there is none. */
function extractGeometry(root: unknown): Json | 'empty' | 'not_polygon' {
  if (!isObject(root)) return 'not_polygon';
  switch (root.type) {
    case 'FeatureCollection': {
      if (!Array.isArray(root.features)) return 'not_polygon';
      const geometries = root.features.map((f) => (isObject(f) ? f.geometry : undefined)).filter((g) => g !== null && g !== undefined);
      if (geometries.length === 0) return 'empty';
      // One plot per file: several features are several plots.
      if (geometries.length > 1) return 'not_polygon';
      return extractGeometry(geometries[0]);
    }
    case 'Feature':
      if (root.geometry === null || root.geometry === undefined) return 'empty';
      return extractGeometry(root.geometry);
    case 'GeometryCollection': {
      // A KML MultiGeometry of polygons is one plot in several parts.
      if (!Array.isArray(root.geometries)) return 'not_polygon';
      const parts = root.geometries.map(extractGeometry);
      if (parts.length === 0) return 'empty';
      if (parts.some((p) => typeof p === 'string' || p.type !== 'Polygon')) return 'not_polygon';
      return { type: 'MultiPolygon', coordinates: (parts as Json[]).map((p) => p.coordinates) };
    }
    case 'Polygon':
    case 'MultiPolygon':
      return root;
    default:
      return 'not_polygon';
  }
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function normalisePosition(p: unknown): Position | null {
  if (!Array.isArray(p) || p.length < 2) return null;
  const [lng, lat] = p as unknown[];
  if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  // 2D only: any altitude is dropped.
  return [round6(lng), round6(lat)];
}

function normaliseRings(rings: unknown): Position[][] | null {
  if (!Array.isArray(rings)) return null;
  const out: Position[][] = [];
  for (const ring of rings) {
    if (!Array.isArray(ring)) return null;
    const positions: Position[] = [];
    for (const p of ring) {
      const n = normalisePosition(p);
      if (!n) return null;
      positions.push(n);
    }
    out.push(positions);
  }
  return out;
}

/** Positions rounded to 6 dp and reduced to [lng, lat]; the shape must be a (Multi)Polygon's. */
function normaliseGeometry(g: Json): PlotPolygon | 'empty' | 'not_polygon' {
  if (g.type === 'Polygon') {
    const rings = normaliseRings(g.coordinates);
    if (!rings) return 'not_polygon';
    if (rings.length === 0) return 'empty';
    return { type: 'Polygon', coordinates: rings } satisfies Polygon;
  }
  if (!Array.isArray(g.coordinates)) return 'not_polygon';
  const polygons: Position[][][] = [];
  for (const part of g.coordinates) {
    const rings = normaliseRings(part);
    if (!rings) return 'not_polygon';
    if (rings.length === 0) return 'empty';
    polygons.push(rings);
  }
  if (polygons.length === 0) return 'empty';
  return { type: 'MultiPolygon', coordinates: polygons } satisfies MultiPolygon;
}

const MAX_VERTICES = 1000;
const samePosition = (a: Position, b: Position) => a[0] === b[0] && a[1] === b[1];

/** The first EU-rule violation of a normalised geometry, or null. */
function structuralError(g: PlotPolygon): PlotGeomError | null {
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const rings = polygons.flat();
  if (rings.some((r) => r.some(([lng, lat]) => Math.abs(lng!) > 180 || Math.abs(lat!) > 90))) return 'not_wgs84';
  if (polygons.some((p) => p.length > 1)) return 'has_holes';
  for (const ring of rings) {
    if (ring.length === 0) return 'too_few_positions';
    if (!samePosition(ring[0]!, ring.at(-1)!)) return 'open_ring';
    if (ring.length < 4) return 'too_few_positions';
  }
  // Vertices exclude each ring's closing position.
  if (rings.reduce((n, r) => n + r.length - 1, 0) > MAX_VERTICES) return 'too_many_vertices';
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) if (samePosition(ring[i - 1]!, ring[i]!)) return 'duplicate_vertices';
  }
  return null;
}
