'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { finishAnswered, outboxSend, pendingItems, sendPending, type PendingResult } from '../../client/capture-client';
import type { OutboxItem } from '../../client/capture-store';
import { t, type Lang, type MessageKey } from '../../lib/i18n';
import { refusalCopy, refusalKeepsOutbox, retryWait } from '../../lib/i18n/farmer-evidence';
import { GlassCard } from '../ui/GlassCard';
import { kg1 } from './format';

// Pickings saved on this phone and not sent yet (TSK-11.3): one frosted row each ("Saved on this phone",
// the kg) with a "Send now" text button, listed above the sent entries on Home and Pickings. The row is
// not a verdict, so it carries no verdict chip or mark (TP17). Send now sends every saved picking,
// oldest first and one at a time, as the identical signed copies (sendPending); the server's answers
// then show in the sent list (the page refreshes). A saved copy the app cannot read (not a payload it
// signed; the queue leaves it as it is) says so plainly instead of offering a Send now that does nothing.

export function PendingRow({ item, lang, busy, onSend }: { item: OutboxItem; lang: Lang; busy: boolean; onSend: () => void }) {
  const tr = (k: MessageKey, v: Record<string, string | number> = {}) => t(k, v, lang);
  const sendable = outboxSend(item) !== null;
  return (
    <GlassCard as="li" card={false} className={sendable ? 'row' : 'row tall'} data-outbox={item.id} data-unreadable={sendable ? undefined : 'true'}>
      <span>
        <span className="r-date">{tr('pend.saved')}</span>
        <span className="r-kg">{tr('home.kg', { kg: kg1(item.cherryKg) })}</span>
      </span>
      {sendable ? (
        <button className="textbtn" type="button" disabled={busy} aria-busy={busy} onClick={onSend}>
          {tr(busy ? 'pend.sending' : 'pend.send')}
        </button>
      ) : (
        <span className="r-why">{tr('pend.unreadable')}</span>
      )}
    </GlassCard>
  );
}

/**
 * Why the queue stopped, in the farmer's words (what happened · that nothing is lost · how long the
 * phone waits when the server said so with Retry-After), or null.
 */
export function stopNote(results: PendingResult[], lang: Lang): string | null {
  const last = results.at(-1)?.result;
  if (!last) return null;
  const kept = t('pend.kept', {}, lang);
  if (last.kind === 'retryable' && last.reason === 'rate_limited') {
    const c = refusalCopy('rate_limited', lang, { retryAfterSec: last.retryAfterSec });
    return `${c.happened} ${c.todo} ${kept}`;
  }
  if (last.kind === 'retryable') {
    const wait = last.retryAfterSec !== undefined ? ` ${retryWait(last.retryAfterSec, lang)}` : '';
    return `${t(last.cause === 'offline' ? 'rec.saved.offline' : 'rec.saved.server', {}, lang)}. ${kept}${wait}`;
  }
  if (last.kind === 'rejected' && refusalKeepsOutbox(last.reason)) {
    const c = refusalCopy(last.reason, lang);
    return `${c.happened} ${c.todo}`;
  }
  return null;
}

/** The saved, unsent pickings of this phone, or nothing when there are none. */
export function PendingList({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(await pendingItems().catch(() => []));
  }, []);

  useEffect(() => {
    // Bookkeeping owed from an earlier answer is finished first, so an answered copy never shows as unsent.
    void finishAnswered().then(load);
  }, [load]);

  async function sendNow() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const results = await sendPending({ keepOnRefusal: refusalKeepsOutbox });
      setNote(stopNote(results, lang));
      await load();
      router.refresh(); // the server's verdicts appear in the sent list
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0 && note === null) return null;
  return (
    <>
      {items.length > 0 ? (
        <ul className="rows pending" data-testid="pending-rows" aria-label={t('pend.label', {}, lang)}>
          {items.map((i) => (
            <PendingRow key={i.id} item={i} lang={lang} busy={busy} onSend={() => void sendNow()} />
          ))}
        </ul>
      ) : null}
      <p className="lede" role="status" data-testid="pending-note">
        {note}
      </p>
    </>
  );
}
