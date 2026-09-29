import { plotPathD, PLOT_VIEW } from '../../lib/geo/svg';
import type { PlotPolygon } from '../../lib/geo/types';
import styles from './PlotSvg.module.css';

// The plot outline (Design.md §13 plot card, §25 SVG maps), ported from final/admin.html `mapHTML`:
// contour lines, the soft fill, the glowing boundary line. Drawn from the plot's GeoJSON. `idBase`
// keeps the gradient, filter and clip IDs unique when several outlines share a page.

const CONTOURS = (() => {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const y = -4 + i * 22;
    const a = 9 + (i % 4) * 3;
    out.push(`M-30 ${y + 8} C 60 ${y - a}, 140 ${y + a + 12}, 220 ${y + 4} S 350 ${y - a - 4}, 440 ${y + 10}`);
  }
  return out;
})();

export function PlotSvg({ geometry, label, idBase }: { geometry: PlotPolygon; label: string; idBase: string }) {
  const d = plotPathD(geometry);
  const id = (name: string) => `${idBase}-${name}`;
  return (
    <svg className={styles.svg} viewBox={`0 0 ${PLOT_VIEW.width} ${PLOT_VIEW.height}`} role="img" aria-label={label}>
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
      <g className={styles.contour}>
        {CONTOURS.map((c) => (
          <path key={c} d={c} />
        ))}
      </g>
      <path d={d} fill={`url(#${id('fill')})`} />
      <g clipPath={`url(#${id('clip')})`} className={styles.contourIn}>
        {CONTOURS.map((c) => (
          <path key={c} d={c} />
        ))}
      </g>
      <path className={styles.glow} d={d} filter={`url(#${id('glow')})`} />
      <path className={styles.line} d={d} />
    </svg>
  );
}
