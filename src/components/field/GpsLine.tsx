import type { GpsState } from '../../client/gps';
import { t, type Lang } from '../../lib/i18n';
import { Ic } from './icons';

// The record flow's location status (Design.md §18 Photo row, TC-047): GPS works silently, so only a
// plain line shows — "Finding your location…", "Move to open sky…" for a weak fix (capture still
// allowed: the verifier scores it), or, when location is denied, how to allow it in two steps.

export function GpsLine({ state, lang }: { state: GpsState; lang: Lang }) {
  const tr = (k: Parameters<typeof t>[0]) => t(k, {}, lang);
  if (state === 'ok') return null;
  return (
    <div className="gps-line" data-state={state} role="status" data-testid="gps-line">
      <Ic name="location" />
      {state === 'denied' ? (
        <div>
          <p>{tr('gps.denied')}</p>
          <ol>
            <li>{tr('gps.step1')}</li>
            <li>{tr('gps.step2')}</li>
          </ol>
        </div>
      ) : (
        <p>{tr(state === 'weak' ? 'gps.weak' : 'gps.finding')}</p>
      )}
    </div>
  );
}
