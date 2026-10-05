import { CertIcon } from '../../../../components/ui/CertIcon';
import { certCopy, ha1 } from '../../../../lib/certificate/copy';
import { kg1 } from '../../../../lib/format';
import { fitLabel, MAP_BOX, originMapPaths } from '../../../../lib/certificate/map';
import type { CertificateView } from '../../../../lib/certificate/view-model';
import c from './certificate.module.css';

// "Where it was grown" (verify.html "3 · origin map card"): the batch's plots as glowing outlines on one
// dark SVG map (no tiles, Design.md §25), drawn from the polygons anchored in the feed, then each farm by
// its producer ID with its area, pickings and kilograms, and its latest forest-loss result verbatim (a
// "(demo data)" label included, EXE12). A plot's label stays inside its outline (TASK-17 fix round 1): it
// is squeezed to fit, or left out when the plot is too small (the farm list carries the same text).

/** Share of a plot's box width a label may use (a plot is narrower than its box away from the centre). */
const LABEL_ROOM = 0.8;

const CONTOURS = (() => {
  const out: string[] = [];
  for (let i = 0; i < 17; i++) {
    const y = -10 + i * 25;
    const a = 10 + (i % 4) * 4;
    out.push(`M-20 ${y + 8} C 90 ${y - a}, 200 ${y + a + 14}, 320 ${y + 4} S 520 ${y - a - 6}, 640 ${y + 12}`);
  }
  return out;
})();

export function OriginMap({ view }: { view: CertificateView }) {
  const paths = originMapPaths(view.plots);
  const byPlot = new Map(view.plots.map((p) => [p.plotId, p]));
  const origin = new Map(view.origin.map((o) => [o.plotId, o]));
  const place = view.headline.district;
  return (
    <div className={`${c.glass} ${c.mapCard}`}>
      <div id="origin-map" className={c.map}>
        <svg viewBox={`0 0 ${MAP_BOX.w} ${MAP_BOX.h}`} role="img" aria-label={certCopy.map.label(view.plots.length, place)}>
          <defs>
            <filter id="cert-soft-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>
          <rect width={MAP_BOX.w} height={MAP_BOX.h} fill="rgba(0,0,0,.22)" />
          <g className={c.mContour}>
            {CONTOURS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
          <path className={c.mStream} d="M300 -10 C 312 60, 290 120, 318 190 S 330 300, 300 390" />
          <text className={c.mPlace} x="24" y="44">
            {place.toUpperCase()}
          </text>
          {paths.map((p) => (
            <g key={p.plotId} data-plot={p.plotId}>
              <path className={c.mFill} d={p.d} />
              <path className={c.mGlow} d={p.d} filter="url(#cert-soft-glow)" />
              <path className={c.mLine} d={p.d} />
            </g>
          ))}
          {paths.map((p) => {
            const plot = byPlot.get(p.plotId)!;
            const room = p.label.w * LABEL_ROOM;
            const main = p.label.h >= 32 ? fitLabel(plot.producerId, 26, room) : null;
            const sub = main && p.label.h >= 64 ? fitLabel(ha1(plot.areaHa), 22, room) : null;
            if (!main) return null;
            return (
              <g key={`${p.plotId}-label`} aria-hidden="true">
                <text className={c.mLabel} x={p.label.x} y={p.label.y} textAnchor="middle" lengthAdjust="spacingAndGlyphs" textLength={main.textLength}>
                  {plot.producerId}
                </text>
                {sub ? (
                  <text className={c.mSub} x={p.label.x} y={p.label.y + 28} textAnchor="middle" lengthAdjust="spacingAndGlyphs" textLength={sub.textLength}>
                    {ha1(plot.areaHa)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <ul className={c.farms} aria-label={certCopy.map.farms}>
        {view.plots.map((p) => {
          const o = origin.get(p.plotId);
          return (
            <li key={p.plotId} data-plot={p.plotId}>
              <span>
                <span className={c.farmId}>{certCopy.map.farm(p.producerId)}</span> · {ha1(p.areaHa)}
              </span>
              <span>{o ? certCopy.map.pickings(o.pickings, kg1(o.kg)) : null}</span>
              <span className={c.forest} data-testid="forest-line">
                <CertIcon name="tree" className={c.ic} />
                <span>{p.forestLoss ? p.forestLoss.evidence : certCopy.map.noForest}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
