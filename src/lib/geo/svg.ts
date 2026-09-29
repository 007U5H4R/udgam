import type { PlotPolygon, Position } from './types';

// Plot outlines as inline SVG (Design.md §25: SVG maps only outside the admin editor). A local
// equirectangular projection (longitude scaled by cos(latitude)) is exact enough at plot scale and
// keeps shapes true; the outline is fitted into the view box with a margin, aspect kept.

export type SvgFit = { width: number; height: number; pad: number };

export const PLOT_VIEW: SvgFit = { width: 400, height: 240, pad: 28 };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The SVG path data (`M … Z` per outer ring) of a plot, fitted into `fit`. Holes are ignored. */
export function plotPathD(g: PlotPolygon, fit: SvgFit = PLOT_VIEW): string {
  const outers: Position[][] = g.type === 'Polygon' ? [g.coordinates[0] ?? []] : g.coordinates.map((p) => p[0] ?? []);
  const all = outers.flat();
  if (all.length === 0) return '';
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
  const scale = Math.min((fit.width - 2 * fit.pad) / spanX, (fit.height - 2 * fit.pad) / spanY);
  const offX = (fit.width - spanX * scale) / 2;
  const offY = (fit.height - spanY * scale) / 2;
  return outers
    .map((ring) => {
      // The closing position repeats the first; Z closes the path instead.
      const open = ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
      return (
        open
          .map((p, i) => {
            const [x, y] = xy(p);
            return `${i === 0 ? 'M' : 'L'}${r1(offX + (x - minX) * scale)} ${r1(offY + (y - minY) * scale)}`;
          })
          .join(' ') + ' Z'
      );
    })
    .join(' ');
}
