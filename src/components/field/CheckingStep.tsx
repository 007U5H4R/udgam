import type { CSSProperties } from 'react';
import { t, type Lang, type MessageKey } from '../../lib/i18n';
import type { CheckId, CheckStatus } from '../../lib/verification/types';
import { Cherry } from '../ui/Cherry';
import { CheckRow } from '../ui/CheckRow';
import { Pill } from '../ui/Pill';
import { CHECK_GROUPS, groupProgress, type GroupKey } from './check-groups';
import { Ic } from './icons';

// Checking (final/index.html #s4, TC-045): the six farmer-facing groups tick as the server streams
// their checks (TP12) — real progress, no invented pacing (Design.md §9). The bar fills by finished
// groups only; the live region announces each group and then the result. With reduced motion the
// screen waits on "See result"; otherwise it moves on 600 ms after the verdict (RecordFlow).

const NAME: Record<GroupKey, MessageKey> = {
  seal: 'grp.seal',
  inside: 'grp.inside',
  photos: 'grp.photos',
  forest: 'grp.forest',
  satellite: 'grp.satellite',
  harvest: 'grp.harvest',
};

/** The groups in the order they finished: by the stream's order (the Map keeps insertion order), then — once the verdict is in — the rest. */
export function finishOrder(checks: ReadonlyMap<CheckId, CheckStatus>, complete: boolean): GroupKey[] {
  const seen = new Set<CheckId>();
  const order: GroupKey[] = [];
  for (const id of checks.keys()) {
    seen.add(id);
    for (const g of CHECK_GROUPS) if (!order.includes(g.key) && g.checks.every((c) => seen.has(c))) order.push(g.key);
  }
  if (complete) for (const g of CHECK_GROUPS) if (!order.includes(g.key)) order.push(g.key);
  return order;
}

export function CheckingStep({
  checks,
  complete,
  lang,
  plotName,
  kg,
  photos,
  onSeeResult,
}: {
  checks: ReadonlyMap<CheckId, CheckStatus>;
  /** The verdict line has arrived. */
  complete: boolean;
  lang: Lang;
  plotName: string;
  kg: string;
  photos: number;
  onSeeResult: () => void;
}) {
  const tr = (k: MessageKey, v: Record<string, string | number> = {}) => t(k, v, lang);
  const groups = groupProgress(checks, complete);
  const done = groups.filter((g) => g.state === 'done').length;
  const now = groups.find((g) => g.state === 'pending')?.key;
  const order = finishOrder(checks, complete);
  const progress = tr('rec.chk.progress', { k: done });
  return (
    <main className="screen" aria-labelledby="s4-h">
      <div className="spacer" aria-hidden="true" />
      <Cherry size={120} className="chk-top" motion="slow" />
      <h1 className="h1" id="s4-h" tabIndex={-1}>
        {tr('rec.chk.title')}
      </h1>
      <p className="lede">{photos === 1 ? tr('rec.chk.sub1', { kg, plot: plotName }) : tr('rec.chk.subN', { kg, plot: plotName, n: photos })}</p>
      <div className="meter">
        <div className="bar" role="progressbar" aria-label={tr('rec.chk.bar')} aria-valuemin={0} aria-valuemax={6} aria-valuenow={done} aria-valuetext={progress} id="bar">
          <i style={{ width: `${(done / 6) * 100}%` } as CSSProperties} />
        </div>
        <p className="meter-txt">
          <span>{progress}</span>
        </p>
      </div>
      <ul className="checks">
        {groups.map((g) => {
          const state = g.state === 'done' ? 'done' : g.key === now ? 'now' : 'wait';
          return (
            <CheckRow
              key={g.key}
              group={g.key}
              name={tr(NAME[g.key], { plot: plotName })}
              state={state}
              stateLabel={tr(state === 'done' ? 'rec.chk.done' : state === 'now' ? 'rec.chk.now' : 'rec.chk.wait')}
            />
          );
        })}
      </ul>
      <p className="caption">{tr('rec.chk.caption')}</p>
      <div className="vh" aria-live="polite" data-testid="checks-live">
        {order.map((k) => (
          <p key={k}>{tr('rec.chk.announce', { name: tr(NAME[k], { plot: plotName }) })}</p>
        ))}
        {complete ? <p>{tr('rec.chk.ready')}</p> : null}
      </div>
      {complete ? (
        <div className="actions">
          <Pill id="see-result" icon={<Ic name="arrowRight" />} onClick={onSeeResult}>
            {tr('rec.chk.see')}
          </Pill>
        </div>
      ) : null}
    </main>
  );
}
