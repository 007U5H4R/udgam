import { projectToBox, type Box } from '../geo/svg';
import type { PlotPolygon, Position } from '../geo/types';

// The certificate's origin map (TSK-16.4, Design.md §25: SVG maps only, no tiles): every plot of the batch
// drawn in one view box, true to shape and to each other. The projection is lib/geo/svg.ts's (the Home
// plot card's): all plots' outer rings go through projectToBox together as one MultiPolygon, so they share
// one fit, and the path it returns is split back into one path per plot. Pure and isomorphic.

/** verify.html draws the map in a 600 × 380 view; the margin leaves room for the labels. */
export const MAP_BOX: Box = { w: 600, h: 380, pad: 64 };

/** `label`: the plot's box centre, and the box's width and height (view units) a label must stay inside. */
export type MapPlot = { plotId: string; d: string; label: { x: number; y: number; w: number; h: number } };

/** Average advance of the map's bold label face, per em (a conservative estimate for IDs and numbers). */
const ADVANCE_EM = 0.62;
/** A label is squeezed at most to this share of its natural width; below that it is left out. */
const MIN_SQUEEZE = 0.6;

/**
 * How a label of `text` at `fontPx` fits in `room` view units (TASK-17 fix round 1, labels must not
 * overflow the plot outlines): `{}` at its natural width, `{textLength}` squeezed to the room, or null
 * when it would need squeezing below 60 % (the farm list under the map carries the same text).
 */
export function fitLabel(text: string, fontPx: number, room: number): { textLength?: number } | null {
  const natural = text.length * ADVANCE_EM * fontPx;
  if (natural <= room) return {};
  if (room >= natural * MIN_SQUEEZE) return { textLength: Math.floor(room) };
  return null;
}

const outerRings = (g: PlotPolygon): Position[][] => (g.type === 'Polygon' ? [g.coordinates[0] ?? []] : g.coordinates.map((p) => p[0] ?? []));

/** One SVG path per plot (an outer ring per `M … Z`; holes are ignored) and a label point at its box centre, with the box's size. */
export function originMapPaths(plots: { plotId: string; polygon: PlotPolygon }[], box: Box = MAP_BOX): MapPlot[] {
  const rings = plots.map((p) => outerRings(p.polygon).filter((r) => r.length > 0));
  const all = rings.flat();
  if (all.length === 0) return [];
  const { path } = projectToBox({ type: 'MultiPolygon', coordinates: all.map((r) => [r]) }, box);
  const parts = path.split(/(?=M)/).map((x) => x.trim());
  let at = 0;
  return plots.map((p, i) => {
    const mine = parts.slice(at, at + rings[i]!.length);
    at += rings[i]!.length;
    const nums = mine.join(' ').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const xs = nums.filter((_, k) => k % 2 === 0);
    const ys = nums.filter((_, k) => k % 2 === 1);
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const label =
      xs.length > 0
        ? { x: r1((Math.min(...xs) + Math.max(...xs)) / 2), y: r1((Math.min(...ys) + Math.max(...ys)) / 2), w: r1(Math.max(...xs) - Math.min(...xs)), h: r1(Math.max(...ys) - Math.min(...ys)) }
        : { x: box.w / 2, y: box.h / 2, w: 0, h: 0 };
    return { plotId: p.plotId, d: mine.join(' '), label };
  });
}

/** DES-200: a plot drawn smaller than this (its box's longer side, in view units) also gets a ring marker. */
export const MIN_MARK = 24;
/** The ring marker's radius in view units: 36 across, so the smallest plot still reads as a place. */
export const RING_R = 18;
/** A number badge's radius in view units. */
export const BADGE_R = 14;
/** The full label's sizes (verify.html `.m-label` 26 px, `.m-sub` 22 px) and the share of a plot's box it may use. */
const MAIN_PX = 26;
const SUB_PX = 22;
const LABEL_ROOM = 0.8;

type Fit = { textLength?: number };

/**
 * How one plot is marked on the map (DES-200). `n` is its 1-based number, shared with its row in the farm
 * list. `ring` is drawn around a plot smaller than MIN_MARK. The label is the producer ID (and the area when
 * there is room) inside the outline, as verify.html draws it, squeezed at most to 60 %; when the ID does
 * not fit, a number badge in the plot, or beside it when the plot is smaller than the badge.
 */
export type PlotMark = {
  plotId: string;
  n: number;
  ring: { x: number; y: number; r: number } | null;
  label: { kind: 'full'; x: number; y: number; main: Fit; sub: Fit | null } | { kind: 'badge'; x: number; y: number };
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The marks of the drawn plots (originMapPaths' output, in its order), given each plot's producer ID and area text. */
export function plotMarks(paths: MapPlot[], plots: { plotId: string; producerId: string; area: string }[], box: Box = MAP_BOX): PlotMark[] {
  const byId = new Map(plots.map((p) => [p.plotId, p]));
  return paths.map((p, i): PlotMark => {
    const plot = byId.get(p.plotId);
    const { x, y, w, h } = p.label;
    const ring = Math.max(w, h) < MIN_MARK ? { x, y, r: RING_R } : null;
    const room = w * LABEL_ROOM;
    const main = plot && h >= 32 ? fitLabel(plot.producerId, MAIN_PX, room) : null;
    if (plot && main) {
      const sub = h >= 64 && plot.area ? fitLabel(plot.area, SUB_PX, room) : null;
      return { plotId: p.plotId, n: i + 1, ring, label: { kind: 'full', x, y, main, sub } };
    }
    // Inside a plot that can hold it; otherwise just above the plot (or its ring), or below it when there is
    // no room above, and always inside the view box.
    const inside = w >= 2 * BADGE_R + 4 && h >= 2 * BADGE_R + 4;
    const reach = Math.max(h / 2, ring ? ring.r : 0) + BADGE_R + 4;
    const by = inside ? y : y - reach >= BADGE_R + 2 ? y - reach : y + reach;
    const label = { kind: 'badge' as const, x: r1(clamp(x, BADGE_R + 2, box.w - BADGE_R - 2)), y: r1(clamp(by, BADGE_R + 2, box.h - BADGE_R - 2)) };
    return { plotId: p.plotId, n: i + 1, ring, label };
  });
}
