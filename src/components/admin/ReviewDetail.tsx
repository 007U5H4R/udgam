import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { locate } from '../../lib/geo/geofence';
import { projectToBox } from '../../lib/geo/svg';
import type { LatLng, PlotPolygon } from '../../lib/geo/types';
import { t } from '../../lib/i18n';
import { CHECK_NAME, formatScore, istClock, istDay, kg1, waited, whyLine } from '../../lib/review/copy';
import type { ReviewDetail as Detail } from '../../lib/review/detail';
import { GlassCard } from '../ui/GlassCard';
import { VerdictChip, VerdictMark, verdictWord } from '../ui/VerdictChip';
import { ChecksCard } from './ChecksCard';
import { DecideForm } from './DecideForm';
import { Icon } from './QueueList';

// The review detail (TSK-12.3), ported from final/admin.html lines 492–551: the title with the verdict
// chip and meta, the score card (score, the 0–49 / 50–79 / 80+ scale with its pin, and the "why" line
// in plain sentences), the plot card (the plot, the phone's dot and the 25 m margin band), the photos
// (thumbnails through /api/media/…/thumb, never the originals), "All 12 checks" with the SYSTEM evidence,
// and the action area: the decide form (DecideForm), or the line that says why nothing can be changed.

const MARGIN_M = 25;
const BOX = { w: 380, h: 222, pad: 26 };
const M_PER_DEG_LAT = 111_320;
const SLOTS = [t('rec.slot.branch'), t('rec.slot.scale'), t('rec.slot.pile')];

const CONTOURS = (() => {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const y = -4 + i * 22;
    const a = 9 + (i % 4) * 3;
    out.push(`M-30 ${y + 8} C 60 ${y - a}, 140 ${y + a + 12}, 220 ${y + 4} S 350 ${y - a - 4}, 440 ${y + 10}`);
  }
  return out;
})();

/** admin.html mapHTML: contours, the 25 m band outside the boundary, the glowing line, the phone's dot. */
function ReviewMap({ geometry, point, plotName, idBase }: { geometry: PlotPolygon; point: LatLng | null; plotName: string; idBase: string }) {
  const { path, dot, inside } = projectToBox(geometry, BOX, point ?? undefined);
  const north = point ? projectToBox(geometry, BOX, { lat: point.lat + MARGIN_M / M_PER_DEG_LAT, lng: point.lng }).dot : undefined;
  const bandPx = dot && north ? Math.abs(north.y - dot.y) : 16;
  const dist = point ? Math.round(locate(point, geometry).distanceToEdgeM) : 0;
  const out = inside === false;
  const shown = dot ? { x: Math.min(BOX.w - 12, Math.max(12, dot.x)), y: Math.min(BOX.h - 12, Math.max(12, dot.y)) } : undefined;
  const label = out ? `${dist} m out` : 'Photo';
  const tw = label.length * 8.4 + 14;
  let tagX = shown ? shown.x + 14 : 0;
  if (tagX + tw > BOX.w - 4) tagX = (shown?.x ?? 0) - tw - 14;
  const tagY = shown ? Math.max(2, shown.y - 22) : 0;
  const alt = !point
    ? `Map of ${plotName}. The phone's location was not recorded.`
    : out
      ? `Map of ${plotName}. The dot showing where the phone was sits ${dist} metres outside the glowing plot line, ${dist > MARGIN_M ? 'beyond' : 'within'} the ${MARGIN_M} metre margin.`
      : `Map of ${plotName}. The dot showing where the phone was is ${dist} metres inside the glowing plot line.`;
  const id = (n: string) => `${idBase}-${n}`;
  return (
    <svg viewBox={`0 0 ${BOX.w} ${BOX.h}`} role="img" aria-label={alt} data-testid="review-map">
      <defs>
        <radialGradient id={id('fill')} cx="55%" cy="50%" r="60%">
          <stop offset="0" stopColor="#7FE3C1" stopOpacity=".16" />
          <stop offset="1" stopColor="#7FE3C1" stopOpacity=".04" />
        </radialGradient>
        <filter id={id('glow')} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <clipPath id={id('clip')}>
          <path d={path} />
        </clipPath>
        <mask id={id('outside')}>
          <rect x="0" y="0" width={BOX.w} height={BOX.h} fill="#fff" />
          <path d={path} fill="#000" />
        </mask>
      </defs>
      <g className="m-contour">
        {CONTOURS.map((c) => (
          <path key={c} d={c} />
        ))}
      </g>
      <path className="m-band" d={path} strokeWidth={Math.round(bandPx * 2 * 10) / 10} mask={`url(#${id('outside')})`} data-margin-m={MARGIN_M} />
      <path d={path} fill={`url(#${id('fill')})`} />
      <g clipPath={`url(#${id('clip')})`} className="m-contour-in">
        {CONTOURS.map((c) => (
          <path key={c} d={c} />
        ))}
      </g>
      <path className="m-glow" d={path} filter={`url(#${id('glow')})`} />
      <path className="m-line" d={path} />
      {shown ? (
        <>
          <g transform={`translate(${shown.x} ${shown.y})`} data-testid="phone-dot">
            <circle className={`m-ring${out ? ' out' : ''}`} r="20" />
            <circle className={`m-dot${out ? ' out' : ''}`} r="7" />
          </g>
          <rect className="m-tag-bg" x={tagX} y={tagY} width={tw} height="22" rx="11" />
          <text className="m-tag" x={tagX + 7} y={tagY + 16}>
            {label}
          </text>
        </>
      ) : null}
    </svg>
  );
}

function LockedLine({ children, info = false }: { children: ReactNode; info?: boolean }) {
  return (
    <p className={`locked${info ? ' info' : ''}`} data-testid="locked">
      <Icon name={info ? 'seal' : 'lock'} />
      <span>{children}</span>
    </p>
  );
}

export type NextUp = { runId: string; left: number } | null;

export function ReviewDetail({ d, next, adminName, now = new Date() }: { d: Detail; next: NextUp; adminName: string; now?: Date }) {
  const hard = d.checks.filter((c) => c.hardFail);
  const shownVerdict = d.decision?.verdict ?? d.run.verdict;
  const why = whyLine({ verdict: d.run.verdict, score: d.score, checks: d.checks, capReasons: d.capReasons });
  const waitingFor = d.locked === null ? ` · waiting ${waited(d.event.receivedAt, now)}` : d.decision ? ' · decided by an admin' : ' · decided by the checks';
  const pin = Math.min(100, Math.max(0, d.score));
  const dist = d.point ? Math.round(locate(d.point, d.plot.geojson).distanceToEdgeM) : null;
  const insidePlot = d.point ? locate(d.point, d.plot.geojson).inside : null;
  const reviewable = d.locked === null || d.locked === 'decided';

  return (
    // tabIndex: at ≥ 1100 px the column scrolls on its own, so a keyboard user can focus and scroll it (axe scrollable-region-focusable)
    <section className="detail" aria-labelledby="d-h" tabIndex={0}>
      <div className="d-body">
        <Link className="back d-back" href="/admin">
          <Icon name="arrowLeft" />
          Back to list
        </Link>
        <header>
          <p className="eyebrow">
            Farm {d.plot.producerId} · {d.plot.name}
          </p>
          <div className="d-title">
            <h2 id="d-h" tabIndex={-1}>
              {kg1(d.event.cherryKg)} kg · {istDay(d.event.receivedAt)}
            </h2>
            <VerdictChip verdict={shownVerdict} />
          </div>
          <p className="d-meta">
            Recorded {istClock(d.event.receivedAt)} on phone {d.event.deviceId ?? '—'}
            {waitingFor}
            {d.run.runNo > 1 ? ` · check ${d.run.runNo}, run again ${istDay(d.run.createdAt)} at ${istClock(d.run.createdAt)}` : ''}
          </p>
        </header>

        <GlassCard as="section" className="score-card" aria-label="Score">
          <p className="score-line">
            Score {formatScore(d.score)} of 100 · {verdictWord(d.run.verdict)}
          </p>
          <div className="scale" aria-hidden="true">
            <span className="z z-bad" />
            <span className="z z-check" />
            <span className="z z-ok" />
            <i className="pin" style={{ left: `${pin}%` }} />
          </div>
          <p className="scale-key" aria-hidden="true">
            <span>0–49 {verdictWord('Rejected')}</span>
            <span>50–79 {verdictWord('Needs Review')}</span>
            <span>80+ {verdictWord('Verified')}</span>
          </p>
          <p className="why" data-testid="why">
            <b>{why.lead}</b> {why.text}
          </p>
        </GlassCard>

        <div className="d-grid">
          <figure className="glass card plot-card" aria-labelledby="plot-say">
            <p className="where">
              <Icon name="location" />
              <span>
                Farm {d.plot.producerId} · {d.plot.areaHa.toFixed(1)} ha {d.plot.crop === 'arabica' ? 'Arabica' : 'Robusta'}
              </span>
            </p>
            <div className="plot-map">
              <ReviewMap geometry={d.plot.geojson} point={d.point} plotName={d.plot.name} idBase={`rv-${d.run.id}`} />
            </div>
            <figcaption>
              <p className="plot-say" id="plot-say">
                {d.point === null ? (
                  <>The phone&apos;s location was not recorded</>
                ) : insidePlot ? (
                  <>
                    <VerdictMark kind="ok" />
                    Taken {dist} m inside {d.plot.name}
                  </>
                ) : (
                  <>
                    <VerdictMark kind="bad" />
                    Taken {dist} m outside {d.plot.name}
                  </>
                )}
              </p>
              <p className="legend" aria-hidden="true">
                <span>
                  <i className={`lg-dot${insidePlot === false ? ' out' : ''}`} />
                  Where the phone was
                </span>
                <span>
                  <i className="lg-line" />
                  Plot boundary
                </span>
                <span>
                  <i className="lg-band" />
                  {MARGIN_M} m margin
                </span>
              </p>
            </figcaption>
          </figure>
          <GlassCard as="section" className="photos" aria-labelledby="ph-h">
            <h3 className="sec-h" id="ph-h">
              Photos
            </h3>
            {d.photos.length ? (
              <ul className="ph-grid">
                {d.photos.map((p, i) => (
                  <li key={p.mediaId} className="ph">
                    <div className="thumb">
                      <Image src={`/api/media/${encodeURIComponent(p.mediaId)}/thumb`} alt={`Photo ${i + 1}, ${SLOTS[i] ?? 'photo'}`} width={320} height={320} unoptimized />
                    </div>
                    <p className="ph-cap">
                      {i + 1} · {SLOTS[i] ?? 'Photo'}
                      <span>{p.takenAt ? `taken ${istClock(p.takenAt)}` : 'no time saved'}</span>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ph-none">No photos were stored with this picking.</p>
            )}
          </GlassCard>
        </div>

        <ChecksCard checks={d.checks} />
      </div>

      <div className="d-actions">
        {reviewable ? (
          <DecideForm
            key={d.run.id}
            runId={d.run.id}
            adminName={adminName}
            unavailable={d.unavailableChecks.map((id) => CHECK_NAME[id])}
            next={next}
            decided={d.decision}
          />
        ) : d.locked === 'hard_fail' ? (
          <LockedLine>
            This one can&apos;t be changed: {hard.map((c) => `“${CHECK_NAME[c.id]}”`).join(', ')} failed ({hard.map((c) => c.evidence).join('; ')}).
          </LockedLine>
        ) : d.locked === 'batched' ? (
          <LockedLine info>
            This picking is in batch {d.batchId}. Its result was fixed when the batch was made, so it can&apos;t be checked again or changed.
          </LockedLine>
        ) : d.locked === 'superseded' ? (
          <LockedLine info>
            A newer check replaced this one. <Link href={`/admin/review/${encodeURIComponent(d.latestRunId)}`}>Open the latest check</Link>
          </LockedLine>
        ) : (
          <LockedLine info>
            {d.run.verdict === 'Verified' ? 'The checks accepted this picking. Nothing to decide.' : 'The checks did not accept this picking. Nothing to decide here.'}
          </LockedLine>
        )}
      </div>
    </section>
  );
}
