// Minimal GeoJSON geometry types (RFC 7946), structurally compatible with @types/geojson, which
// pnpm does not hoist to the project. Positions are [lng, lat] in WGS 84.
export type Position = number[];
export type Polygon = { type: 'Polygon'; coordinates: Position[][] };
export type MultiPolygon = { type: 'MultiPolygon'; coordinates: Position[][][] };
export type PlotPolygon = Polygon | MultiPolygon;
export type LatLng = { lat: number; lng: number };
