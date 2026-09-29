import type { FarmerLine } from '../../lib/i18n/farmer-evidence';
import { Ic } from '../field/icons';
import { GlassCard } from './GlassCard';

// The verdict screen's evidence card (Design.md §13, §19), ported from final/index.html `.evidence`:
// at most three lines in plain words, each with its icon in a bubble — green on Verified, amber for a
// reason on Needs a check, --bad tokens for the reason on Not accepted (D5), plain for "what next".

export type Bubble = 'ok' | 'amber' | 'bad';

export function EvidenceList({ lines, label, tone, small }: { lines: FarmerLine[]; label: string; tone: Bubble; small?: string }) {
  return (
    <GlassCard as="ul" className="evidence" aria-label={label} data-testid="evidence">
      {lines.map((l, i) => {
        const bub = l.next ? 'plain' : tone === 'ok' ? '' : tone;
        const last = i === lines.length - 1;
        return (
          <li className="ev" key={l.text}>
            <span className={['bub', bub].filter(Boolean).join(' ')}>
              <Ic name={l.icon} />
            </span>
            <span className="ev-t">
              {l.text}
              {last && small ? <small>{small}</small> : null}
            </span>
          </li>
        );
      })}
    </GlassCard>
  );
}
