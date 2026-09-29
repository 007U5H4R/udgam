import { GlassCard } from '../ui/GlassCard';
import { VerdictMark } from '../ui/VerdictChip';
import { CHECK_NAME, STATE_VIEW, checkState, checksSummary, sortedChecks } from '../../lib/review/copy';
import type { CheckResult } from '../../lib/verification/types';
import { NaMark } from './QueueList';

// "All 12 checks" (TSK-12.3), ported from final/admin.html lines 520–524 and its `.chk` rows: each check
// with its state (word + mark + colour, never colour alone), the admin's name and the check id, and the
// SYSTEM evidence sentence exactly as stored (technical-plan §6.5; the " (demo data)" label stays, EXE12).
// Worst first: failed (final) → failed → couldn't run → flagged → passed.

export function ChecksCard({ checks }: { checks: readonly CheckResult[] }) {
  return (
    <GlassCard as="section" className="checks-card" aria-labelledby="chk-h">
      <h3 className="sec-h" id="chk-h">
        All {checks.length} checks
      </h3>
      <p className="checks-sum">{checksSummary(checks)}</p>
      <ol className="checks">
        {sortedChecks(checks).map((c) => {
          const s = STATE_VIEW[checkState(c)];
          return (
            <li key={c.id} className={`chk ${s.cls === 'ok' ? '' : s.cls}`} data-check={c.id} data-status={c.status}>
              <div className="c-top">
                <span className={`c-stat ${s.cls}`}>
                  {s.mark === 'na' ? <NaMark /> : <VerdictMark kind={s.mark} />}
                  {s.word}
                </span>
                <span className="c-name">
                  {CHECK_NAME[c.id]}
                  <code>{c.id}</code>
                </span>
              </div>
              <p className="c-ev">{c.evidence}</p>
            </li>
          );
        })}
      </ol>
    </GlassCard>
  );
}
