import type { CSSProperties } from 'react';
import { plotPathD, projectToBox, PLOT_VIEW, type Box } from '../../lib/geo/svg';
import type { LatLng, PlotPolygon } from '../../lib/geo/types';
import styles from './PlotSvg.module.css';

// The plot outline (Design.md §13 plot card, §25 SVG maps), ported from final/admin.html `mapHTML` and
// final/index.html `[data-plot]`: contour lines, the soft fill, the glowing boundary line and, on the
// capture Home, the live "You" dot with its pulse ring. Drawn from the plot's GeoJSON. `idBase` keeps
// the gradient, filter and clip IDs unique when several outlines share a page.

const CONTOURS = (() => {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const y = -4 + i * 22;
    const a = 9 + (i % 4) * 3;
    out.push(`M-30 ${y + 8} C 60 ${y - a}, 140 ${y + a + 12}, 220 ${y + 4} S 350 ${y - a - 4}, 440 ${y + 10}`);
  }
  return out;
})();

/** The Home plot card's view box (final/index.html draws the plot in a 360 × 222 view). */
export const HOME_BOX: Box = { w: 360, h: 222, pad: 26 };

type Dot = { x: number; y: number };

function Outline({ d, idBase, dot, pulse }: { d: string; idBase: string; dot?: Dot; pulse?: boolean }) {
  const id = (name: string) => `${idBase}-${name}`;
  return (
    <>
      <defs>
        <radialGradient id={id('fill')} cx="55%" cy="50%" r="60%">
          <stop offset="0" stopColor="#7FE3C1" stopOpacity=".16" />
          <stop offset="1" stopColor="#7FE3C1" stopOpacity=".04" />
        </radialGradient>
        <filter id={id('glow')} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <clipPath id={id('clip')}>
          <path d={d} />
        </clipPath>
      </defs>
      <g className={`${styles.contour} m-contour`}>
        {CONTOURS.map((c) => (
          <path key={c} d={c} />
        ))}
      </g>
      <path d={d} fill={`url(#${id('fill')})`} />
      <g clipPath={`url(#${id('clip')})`} className={`${styles.contourIn} m-contour-in`}>
        {CONTOURS.map((c) => (
          <path key={c} d={c} />
        ))}
      </g>
      <path className={`${styles.glow} m-glow`} d={d} filter={`url(#${id('glow')})`} />
      <path className={`${styles.line} m-line`} d={d} />
      {dot ? (
        <g transform={`translate(${dot.x} ${dot.y})`} data-testid="you-dot">
          {pulse ? <circle className="m-you-ring" r="26" /> : null}
          <circle className="m-you-dot" r="8" />
        </g>
      ) : null}
    </>
  );
}

export function PlotSvg({ geometry, label, idBase }: { geometry: PlotPolygon; label: string; idBase: string }) {
  const d = plotPathD(geometry);
  const box = { w: PLOT_VIEW.width, h: PLOT_VIEW.height, pad: PLOT_VIEW.pad };
  return (
    <svg className={styles.svg} viewBox={`0 0 ${box.w} ${box.h}`} role="img" aria-label={label}>
      <Outline d={d} idBase={idBase} />
    </svg>
  );
}

/**
 * The Home plot card's map (index.html `.plot-map`): the outline and, when there is a fix, the "You" dot
 * with a pulse ring (static under reduced motion). A dot beyond the view's edge is drawn at the edge,
 * so it never widens the page.
 */
export function PlotMap({
  geometry,
  label,
  idBase,
  point,
  youLabel,
  pulse = true,
}: {
  geometry: PlotPolygon;
  label: string;
  idBase: string;
  point?: LatLng | null;
  youLabel: string;
  pulse?: boolean;
}) {
  const box = HOME_BOX;
  const { path, dot } = projectToBox(geometry, box, point ?? undefined);
  const shown = dot ? { x: Math.min(box.w - 10, Math.max(10, dot.x)), y: Math.min(box.h - 10, Math.max(10, dot.y)) } : undefined;
  const tag: CSSProperties | undefined = shown
    ? {
        left: `${(shown.x / box.w) * 100}%`,
        top: `${(shown.y / box.h) * 100}%`,
        transform: shown.x > box.w * 0.7 ? 'translate(calc(-100% - 12px), -30px)' : 'translate(12px, -30px)',
      }
    : undefined;
  return (
    <div className="plot-map">
      <div className="pm-inner">
        <svg viewBox={`0 0 ${box.w} ${box.h}`} role="img" aria-label={label}>
          <Outline d={path} idBase={idBase} dot={shown} pulse={pulse} />
        </svg>
        {shown ? (
          <span className="you-tag" aria-hidden="true" style={tag}>
            {youLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
