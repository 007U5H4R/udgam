import { t, type Lang } from '../../lib/i18n';
import type { Verdict } from '../../lib/verification/types';

// Verdict chip (Design.md §13 frosted rows): word + mark + colour, never colour alone (§17). Ported from
// final/index.html `.vchip` and the three marks (circle ✓ · diamond ! · square ✕). Farmer words (D5):
// Verified · Needs a check · Not accepted.

export type MarkKind = 'ok' | 'check' | 'bad';

export const MARK_OF: Record<Verdict, MarkKind> = { Verified: 'ok', 'Needs Review': 'check', Rejected: 'bad' };

const WORD_KEY = { Verified: 'verdict.verified', 'Needs Review': 'verdict.needsReview', Rejected: 'verdict.rejected' } as const;

/** The farmer's word for a system verdict. */
export const verdictWord = (v: Verdict, lang: Lang = 'en'): string => t(WORD_KEY[v], {}, lang);

export function VerdictMark({ kind, className = 'mk' }: { kind: MarkKind; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-mark={kind}>
      {kind === 'ok' ? (
        <>
          <circle cx="12" cy="12" r="11" fill="#7FE3A6" />
          <path d="M7 12.4l3.3 3.3L17 9" fill="none" stroke="#0A0E0C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : kind === 'check' ? (
        <>
          <path d="M12 1.2 22.8 12 12 22.8 1.2 12z" fill="#F2B84B" stroke="#F2B84B" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M12 7v6" stroke="#0A0E0C" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="12" cy="16.6" r="1.4" fill="#0A0E0C" />
        </>
      ) : (
        <>
          <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="#EF6A5B" />
          <path d="M8 8l8 8M16 8l-8 8" stroke="#0A0E0C" strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function VerdictChip({ verdict, lang = 'en' }: { verdict: Verdict; lang?: Lang }) {
  const kind = MARK_OF[verdict];
  return (
    <span className={`vchip ${kind}`} data-verdict={verdict}>
      <VerdictMark kind={kind} />
      {verdictWord(verdict, lang)}
    </span>
  );
}
