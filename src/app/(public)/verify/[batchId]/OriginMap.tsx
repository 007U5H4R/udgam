import { CertIcon } from '../../../../components/ui/CertIcon';
import { certCopy, ha1, publicEvidence } from '../../../../lib/certificate/copy';
import { kg1 } from '../../../../lib/format';
import { BADGE_R, MAP_BOX, originMapPaths, plotMarks } from '../../../../lib/certificate/map';
import type { CertificateView } from '../../../../lib/certificate/view-model';
import c from './certificate.module.css';

// "Where it was grown" (verify.html "3 · origin map card"): the batch's plots as glowing outlines on one
// dark SVG map (no tiles, Design.md §25), drawn from the polygons anchored in the feed, then each farm by
// its producer ID with its area, pickings and kilograms, and its latest forest-loss result as recorded (a
// "(demo data)" label included, EXE12) in the page's public words (publicEvidence, DES-213). A plot's
// label stays inside its outline (TASK-17 fix round 1): it is squeezed to fit. DES-200: a plot drawn
// smaller than a few pixels also gets a ring marker, and a plot whose ID does not fit gets a number badge
// instead, repeated on its row of the farm list (lib/certificate/map.ts).

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
  const marks = plotMarks(
    paths,
    view.plots.map((p) => ({ plotId: p.plotId, producerId: p.producerId, area: ha1(p.areaHa) })),
  );
  const numbered = new Map(marks.filter((m) => m.label.kind === 'badge').length > 0 ? marks.map((m) => [m.plotId, m.n]) : []);
  const byPlot = new Map(view.plots.map((p) => [p.plotId, p]));
  const origin = new Map(view.origin.map((o) => [o.plotId, o]));
  const place = view.headline.district;
  return (
    <div className={`${c.glass} ${c.mapCard}`}>
      <div id="origin-map" className={c.map}>
        <svg viewBox={`0 0 ${MAP_BOX.w} ${MAP_BOX.h}`} role="img" aria-label={certCopy.map.label(view.plots.length, place, numbered.size > 0)}>
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
          {marks.map((m) =>
            m.ring ? <circle key={`${m.plotId}-ring`} className={c.mRing} data-ring={m.plotId} cx={m.ring.x} cy={m.ring.y} r={m.ring.r} /> : null,
          )}
          {marks.map((m) => {
            const plot = byPlot.get(m.plotId)!;
            if (m.label.kind === 'badge') {
              return (
                <g key={`${m.plotId}-label`} className={c.mBadge} data-badge={m.plotId} aria-hidden="true">
                  <circle cx={m.label.x} cy={m.label.y} r={BADGE_R} />
                  <text x={m.label.x} y={m.label.y} textAnchor="middle" dominantBaseline="central">
                    {m.n}
                  </text>
                </g>
              );
            }
            const { main, sub } = m.label;
            return (
              <g key={`${m.plotId}-label`} aria-hidden="true">
                <text className={c.mLabel} x={m.label.x} y={m.label.y} textAnchor="middle" lengthAdjust="spacingAndGlyphs" textLength={main.textLength}>
                  {plot.producerId}
                </text>
                {sub ? (
                  <text className={c.mSub} x={m.label.x} y={m.label.y + 28} textAnchor="middle" lengthAdjust="spacingAndGlyphs" textLength={sub.textLength}>
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
                {numbered.has(p.plotId) ? (
                  <span className={c.rowBadge} aria-hidden="true">
                    {numbered.get(p.plotId)}
                  </span>
                ) : null}
                <span className={c.farmId}>{certCopy.map.farm(p.producerId)}</span> · {ha1(p.areaHa)}
              </span>
              <span>{o ? certCopy.map.pickings(o.pickings, kg1(o.kg)) : null}</span>
              <span className={c.forest} data-testid="forest-line">
                <CertIcon name="tree" className={c.ic} />
                <span>{p.forestLoss ? publicEvidence(p.forestLoss.evidence) : certCopy.map.noForest}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
