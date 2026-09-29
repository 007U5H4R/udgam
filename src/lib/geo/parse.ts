import { kml } from '@tmcw/togeojson';
import { DOMParser } from '@xmldom/xmldom';
import type { MultiPolygon, PlotPolygon, Polygon, Position } from './types';
import { validatePolygon, type PlotGeomError } from './validate';

// Plot boundary uploads (TSK-06.1, TC-026, F1). A GeoJSON or KML file becomes one WGS84 Polygon or
// MultiPolygon with [lng, lat] positions rounded to 6 dp, or a reason the admin can act on. The EU
// Information System rules are checked by validatePolygon (validate.ts). Rings are never closed for the
// admin: an open ring is an error, so they know.

export type { PlotGeomError };

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
    // A KML file never needs a DTD. Refusing any DOCTYPE up front keeps entity tricks (XXE, entity
    // expansion) out whatever the XML parser's defaults are.
    if (/<!DOCTYPE/i.test(text)) return fail('unsupported_kml');
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
  const err = validatePolygon(geometry);
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

/** Nesting (Feature in Feature, collection in collection) deeper than this is refused, never recursed. */
const MAX_DEPTH = 32;

/** The one plot geometry in a FeatureCollection, Feature or Geometry, or why there is none. */
function extractGeometry(root: unknown, depth = 0): Json | 'empty' | 'not_polygon' {
  if (!isObject(root) || depth > MAX_DEPTH) return 'not_polygon';
  switch (root.type) {
    case 'FeatureCollection': {
      if (!Array.isArray(root.features)) return 'not_polygon';
      const geometries = root.features.map((f) => (isObject(f) ? f.geometry : undefined)).filter((g) => g !== null && g !== undefined);
      if (geometries.length === 0) return 'empty';
      // One plot per file: several features are several plots.
      if (geometries.length > 1) return 'not_polygon';
      return extractGeometry(geometries[0], depth + 1);
    }
    case 'Feature':
      if (root.geometry === null || root.geometry === undefined) return 'empty';
      return extractGeometry(root.geometry, depth + 1);
    case 'GeometryCollection': {
      // A KML MultiGeometry of polygons is one plot in several parts.
      if (!Array.isArray(root.geometries)) return 'not_polygon';
      // Its members must be Polygons: no nested collections.
      const parts = root.geometries.map((g) => (isObject(g) && g.type === 'Polygon' ? extractGeometry(g, depth + 1) : 'not_polygon'));
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
