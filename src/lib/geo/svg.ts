import { locate } from './geofence';
import type { LatLng, PlotPolygon, Position } from './types';

// Plot outlines as inline SVG (Design.md §25: SVG maps only outside the admin editor). A local
// equirectangular projection (longitude scaled by cos(latitude)) is exact enough at plot scale and
// keeps shapes true; the outline is fitted into the view box with a margin, aspect kept, north up.

export type SvgFit = { width: number; height: number; pad: number };
export type Box = { w: number; h: number; pad: number };

export const PLOT_VIEW: SvgFit = { width: 400, height: 240, pad: 28 };

const r1 = (n: number) => Math.round(n * 10) / 10;

type Projection = { toXY(p: Position): [number, number]; outers: Position[][] } | null;

/** The fitted projection of a plot's outer rings (holes are ignored), or null for an empty geometry. */
function fit(g: PlotPolygon, box: Box): Projection {
  const outers: Position[][] = g.type === 'Polygon' ? [g.coordinates[0] ?? []] : g.coordinates.map((p) => p[0] ?? []);
  const all = outers.flat();
  if (all.length === 0) return null;
  const lats = all.map((p) => p[1]!);
  const k = Math.cos((((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI) / 180);
  const xy = (p: Position): [number, number] => [p[0]! * k, -p[1]!];
  const pts = all.map(xy);
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  const spanX = maxX - minX || 1e-9;
  const spanY = maxY - minY || 1e-9;
  const scale = Math.min((box.w - 2 * box.pad) / spanX, (box.h - 2 * box.pad) / spanY);
  const offX = (box.w - spanX * scale) / 2;
  const offY = (box.h - spanY * scale) / 2;
  return {
    outers,
    toXY(p) {
      const [x, y] = xy(p);
      return [offX + (x - minX) * scale, offY + (y - minY) * scale];
    },
  };
}

function pathOf(proj: NonNullable<Projection>): string {
  return proj.outers
    .map((ring) => {
      // The closing position repeats the first; Z closes the path instead.
      const open = ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
      return (
        open
          .map((p, i) => {
            const [x, y] = proj.toXY(p);
            return `${i === 0 ? 'M' : 'L'}${r1(x)} ${r1(y)}`;
          })
          .join(' ') + ' Z'
      );
    })
    .join(' ');
}

/**
 * A plot fitted into `box` (TSK-10.3): its path, and for `point` the dot's position in the same box
 * and whether the point is inside the plot (lib/geo/geofence's point-in-polygon; holes are outside).
 */
export function projectToBox(geom: PlotPolygon, box: Box, point?: LatLng): { path: string; dot?: { x: number; y: number }; inside?: boolean } {
  const proj = fit(geom, box);
  if (!proj) return { path: '' };
  const path = pathOf(proj);
  if (!point) return { path };
  const [x, y] = proj.toXY([point.lng, point.lat]);
  return { path, dot: { x: r1(x), y: r1(y) }, inside: locate(point, geom).inside };
}

/** The SVG path data (`M … Z` per outer ring) of a plot, fitted into `fit`. Holes are ignored. */
export function plotPathD(g: PlotPolygon, f: SvgFit = PLOT_VIEW): string {
  return projectToBox(g, { w: f.width, h: f.height, pad: f.pad }).path;
}
