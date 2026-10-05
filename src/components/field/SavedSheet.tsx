'use client';

import { t, type Lang, type MessageKey } from '../../lib/i18n';
import { refusalCopy, retryWait } from '../../lib/i18n/farmer-evidence';
import { Pill } from '../ui/Pill';
import { Ic } from './icons';

// "Couldn't send" (final/index.html #s7, lines 623–634; TSK-11.2): the amber sheet over the dimmed
// weight screen. It says what happened, that nothing is lost (the photo count and kg, kept with the
// signed payload in IndexedDB), and offers Try again (the identical saved copy, never re-signed, TP7)
// and Try later. The heading follows the send's cause: "No network here" (the request never got an
// answer) or "Couldn't send" (the server answered without a result). A refusal that signing in again
// or waiting can fix (rate_limited, unauthenticated, forbidden, device_not_owned, length_required)
// names itself instead; a 429 or a busy 503 also says how long the phone will wait (at most 60 s).

/** `t(key)` with each `{name}` in `bold` drawn in <b>, as the mockup bolds the photo count and the kg. */
function Rich({ k, vars, bold, lang }: { k: MessageKey; vars: Record<string, string>; bold: string[]; lang: Lang }) {
  const marks = Object.fromEntries(Object.keys(vars).map((name, i) => [name, bold.includes(name) ? `\u0000${i}\u0000` : vars[name]!]));
  const parts = t(k, marks, lang).split('\u0000');
  const names = Object.keys(vars);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{vars[names[Number(p)]!]}</b> : p))}
    </>
  );
}

export function SavedSheet({
  cause,
  reason,
  retryAfterSec,
  lang,
  photos,
  kg,
  plotName,
  onRetry,
  onLater,
}: {
  cause: 'offline' | 'server';
  /** A refusal the phone keeps the copy for, or `no_fix` (no GPS fix yet: nothing was signed). */
  reason?: string;
  retryAfterSec?: number;
  lang: Lang;
  photos: number;
  kg: number;
  plotName: string;
  onRetry: () => void;
  onLater: () => void;
}) {
  const tr = (k: MessageKey, v: Record<string, string | number> = {}) => t(k, v, lang);
  const noFix = reason === 'no_fix';
  const refusal = reason && !noFix ? refusalCopy(reason, lang, { retryAfterSec }) : null;
  const title = refusal ? refusal.happened : noFix ? tr('rec.noFix') : tr(cause === 'offline' ? 'rec.saved.offline' : 'rec.saved.server');
  const photoWord = photos === 1 ? tr('rec.photos1') : tr('rec.photosN', { n: photos });
  const eyebrow = photos === 1 ? tr('rec.kg.eyebrow1', { plot: plotName }) : tr('rec.kg.eyebrowN', { plot: plotName, n: photos });
  return (
    <main className="screen s7" aria-labelledby="s7-h">
      {/* The weight screen behind the sheet, dimmed: context only, never reachable. */}
      <div className="under" aria-hidden="true" inert>
        <header className="top">
          <span className="eyebrow">{eyebrow}</span>
        </header>
        <p className="h1">{tr('rec.kg.title')}</p>
        <p className="kg-read">
          <span className="kg-num">{kg}</span>
          <span className="kg-unit">{tr('rec.kg.unit')}</span>
        </p>
      </div>
      <div className="scrim" aria-hidden="true" />
      <div className="sheet-panel" role="group" aria-labelledby="s7-h" data-testid="saved-sheet">
        <div className="grabber" aria-hidden="true" />
        <div className="sheet-ic" aria-hidden="true">
          <Ic name="wifiOff" />
        </div>
        <h1 className="h1" id="s7-h" tabIndex={-1}>
          {title}
        </h1>
        {refusal ? <p>{refusal.todo}</p> : null}
        {noFix ? null : (
          <p data-testid="saved-body">
            <Rich k="rec.saved.body" vars={{ photos: photoWord, kg: tr('v.kg', { kg }) }} bold={['photos', 'kg']} lang={lang} />
          </p>
        )}
        {/* A busy server's Retry-After (503); a 429's wait is in the rate_limited copy above. */}
        {!refusal && retryAfterSec !== undefined ? <p data-testid="saved-wait">{retryWait(retryAfterSec, lang)}</p> : null}
        <Pill variant="amber" icon={<Ic name="retry" />} onClick={onRetry}>
          {tr('rec.saved.retry')}
        </Pill>
        <button className="textbtn" type="button" onClick={onLater}>
          <Ic name="clock" />
          {tr('rec.saved.later')}
        </button>
      </div>
    </main>
  );
}
