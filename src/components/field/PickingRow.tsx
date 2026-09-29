import Link from 'next/link';
import type { PickingItem } from '../../lib/db/queries/pickings';
import { t, type Lang, type MessageKey } from '../../lib/i18n';
import { GlassCard } from '../ui/GlassCard';
import { VerdictChip } from '../ui/VerdictChip';
import { istShortDay, kg1 } from './format';

// One sent picking on the Pickings list (final/index.html #s8, lines 642–659): the IST date and kg
// (a link to its detail), the verdict chip (word + mark + colour), and for Needs a check the reason and
// that the office is checking it (`r-why`), for Not accepted the reason and a "What can I do?"
// disclosure with what to do.

export function PickingRow({ item, lang }: { item: PickingItem; lang: Lang }) {
  const tr = (k: MessageKey, v: Record<string, string | number> = {}) => t(k, v, lang);
  const tall = item.verdict !== 'Verified' && item.reason !== undefined;
  return (
    <GlassCard as="li" card={false} className={tall ? 'row tall' : 'row'} data-event={item.eventId}>
      <Link className="r-open" href={`/field/pickings/${encodeURIComponent(item.eventId)}`}>
        <span className="r-date">{istShortDay(item.receivedAt, lang)}</span>
        <span className="r-kg">{item.cherryKg === null ? tr('pk.noKg') : tr('home.kg', { kg: kg1(item.cherryKg) })}</span>
      </Link>
      <VerdictChip verdict={item.verdict} lang={lang} />
      {tall && item.verdict === 'Needs Review' ? <p className="r-why">{tr('pk.why.check', { reason: item.reason!.text })}</p> : null}
      {tall && item.verdict === 'Rejected' ? (
        <div className="r-why">
          <p>{item.reason!.text}</p>
          {item.whatToDo ? (
            <details>
              <summary>{tr('pk.whatCanIDo')}</summary>
              <p>{item.whatToDo}</p>
            </details>
          ) : null}
        </div>
      ) : null}
    </GlassCard>
  );
}
