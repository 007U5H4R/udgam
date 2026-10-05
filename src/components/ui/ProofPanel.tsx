'use client';

import { useCallback, useEffect, useRef } from 'react';
import { certCopy, kid8 } from '../../lib/certificate/copy';
import { FEED_ELEMENT_ID } from '../../lib/certificate/embed';
import { LEDGER_KEY_URL, verifyFeed, type VerifierKey, type VerifyFailure } from '../../lib/ledger/proof';
import { CertIcon, CertMark } from './CertIcon';
import { setProofState, useProofState, type ProofUiState } from './proof-state';
import s from './ProofPanel.module.css';

// The certificate's proof panel (technical-plan §8.4, TSK-16.3): the visitor's own browser verifies the
// embedded proof feed. It reads #proof-feed (exactly the payloads the page displays), fetches the ledger
// key from /.well-known/udgam-ledger-key (never from the feed), runs verifyFeed with a progress callback
// and shows loading → verified | mismatch. `document.body.dataset.state` drives the page's CSS (in
// mismatch no green renders anywhere), `performance.mark('proof-final')` marks the end for S4, and a
// live region announces each state. On a mismatch a beacon reports the failing step, nothing else; each
// page view sends one `certificate.viewed` beacon (batch id only; TASK-17 fix round 1, §15).
// `performance.mark('proof-start')` marks the start of verifyFeed, so §18's verify budget is measured on
// its own (proof-start → proof-final).
// Ported from .design/exploration/final/verify.html "1 · proof".

export type ForcedProofState = 'loading' | 'mismatch' | null;

type Props = {
  /** Records in the feed (the page knows it from the server render; the panel counts them again). */
  entryCount: number;
  batchId: string;
  /** Dev-only forced state (?state=, never in a production deployment): loading holds, mismatch is simulated. */
  forced?: ForcedProofState;
};

type KeyDocument = { keys: VerifierKey[] };

function readFeed(): unknown {
  const el = document.getElementById(FEED_ELEMENT_ID);
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as unknown;
  } catch {
    return null;
  }
}

async function fetchKeys(url: string): Promise<KeyDocument | null> {
  try {
    // Default cache and credentials mode, so the page's <link rel="preload" as="fetch"> is reused (S4).
    const res = await fetch(url);
    if (!res.ok) return null;
    const doc = (await res.json()) as { keys?: unknown };
    return Array.isArray(doc.keys) ? { keys: doc.keys as VerifierKey[] } : null;
  } catch {
    return null;
  }
}

function setBody(state: ProofUiState['status']): void {
  document.body.dataset.state = state === 'unavailable' ? 'loading' : state;
}

function mark(name: 'proof-start' | 'proof-final'): void {
  try {
    performance.clearMarks(name);
    performance.mark(name);
  } catch {
    // performance marks are best effort
  }
}
const markFinal = () => mark('proof-final');

/** One closed telemetry event (lib/certificate/telemetry.ts) by sendBeacon; never affects the page. */
function send(event: { event: 'certificate.viewed'; batchId: string } | { event: 'certificate.proof_failed'; step: string; batchId: string }): void {
  try {
    navigator.sendBeacon?.('/api/telemetry', new Blob([JSON.stringify(event)], { type: 'application/json' }));
  } catch {
    // telemetry never affects the page
  }
}

/** The entries of a feed-like value, for "record k of n" (whatever shape it has). */
function entriesOf(feed: unknown): { seq?: unknown }[] {
  const entries = (feed as { entries?: unknown } | null)?.entries;
  return Array.isArray(entries) ? (entries as { seq?: unknown }[]) : [];
}

export function ProofPanel({ entryCount, batchId, forced = null }: Props) {
  const stored = useProofState();
  // Before the panel has read the feed (server render, first paint) the count comes from the page.
  const state: ProofUiState = stored.status === 'loading' && stored.total === 0 ? { ...stored, total: entryCount } : stored;
  const run = useRef(0);
  const viewed = useRef<string | null>(null);

  const verify = useCallback(async () => {
    const id = ++run.current;
    const live = () => id === run.current;
    const feed = readFeed();
    const entries = entriesOf(feed);
    const total = entries.length || entryCount;
    const mismatch = (failure: VerifyFailure, publishedKid: string | null): ProofUiState => {
      const i = failure.seq === undefined ? -1 : entries.findIndex((e) => e.seq === failure.seq);
      return { status: 'mismatch', failure, total, record: i >= 0 ? i + 1 : null, publishedKid };
    };
    setProofState({ status: 'loading', done: 0, total });
    setBody('loading');

    if (forced === 'loading') return;
    if (forced === 'mismatch') {
      const seq = entries[0]?.seq;
      setProofState(mismatch({ ok: false, step: 'payload-hash', ...(typeof seq === 'number' ? { seq } : {}) }, null));
      setBody('mismatch');
      markFinal();
      return;
    }

    const doc = await fetchKeys(LEDGER_KEY_URL);
    if (!live()) return;
    if (!doc) {
      setProofState({ status: 'unavailable' });
      setBody('unavailable');
      markFinal();
      return;
    }
    const publishedKid = typeof doc.keys[0]?.kid === 'string' ? doc.keys[0].kid : null;
    mark('proof-start');
    const outcome = await verifyFeed(feed, doc.keys, {
      onProgress: (done, n) => {
        if (live()) setProofState({ status: 'loading', done, total: n });
      },
    });
    if (!live()) return;
    if (outcome.ok) {
      setProofState({ status: 'verified', entries: outcome.entries, checkpoints: outcome.checkpoints, publishedKid });
      setBody('verified');
    } else {
      setProofState(mismatch(outcome, publishedKid));
      setBody('mismatch');
      send({ event: 'certificate.proof_failed', step: outcome.step, batchId });
    }
    markFinal();
  }, [batchId, entryCount, forced]);

  // One view per page view: not again on "Check again", nor on a development double mount.
  useEffect(() => {
    if (viewed.current === batchId) return;
    viewed.current = batchId;
    send({ event: 'certificate.viewed', batchId });
  }, [batchId]);

  useEffect(() => {
    void verify();
    const r = run;
    return () => {
      r.current++; // abandon a verification still in flight
      delete document.body.dataset.state;
    };
  }, [verify]);

  return (
    <>
      <section className={`${s.glass} ${s.proof} proof${state.status === 'mismatch' ? ` ${s.mismatch}` : ''}`} aria-label={certCopy.proof.label} data-proof-state={state.status}>
        <div role="status" aria-live="polite">
          <Body state={state} />
        </div>
        {state.status === 'mismatch' || state.status === 'unavailable' ? (
          <div className={s.actions}>
            <button className={`${s.pill}${state.status === 'unavailable' ? ` ${s.ghost}` : ''}`} type="button" id="check-again" onClick={() => void verify()}>
              <CertIcon name="retry" className={s.ic} />
              {certCopy.proof.checkAgain}
            </button>
          </div>
        ) : null}
        {state.status === 'verified' || state.status === 'mismatch' ? <How entries={state.status === 'verified' ? state.entries : state.total} kid={state.publishedKid} /> : null}
        {state.status === 'verified' ? (
          <p className={s.links}>
            <a href="#limits">{certCopy.proof.limitsLink}</a>
          </p>
        ) : null}
      </section>
      {state.status === 'mismatch' ? (
        <p className={s.unconfirmed}>
          <b>{certCopy.proof.unconfirmedLead}</b>
          {certCopy.proof.unconfirmedRest}
        </p>
      ) : null}
    </>
  );
}

function Body({ state }: { state: ProofUiState }) {
  if (state.status === 'verified') {
    const kids = [...new Set(state.checkpoints.map((c) => c.kid))];
    return (
      <div className={s.row}>
        <div className={s.mark}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG; next/image adds nothing here */}
          <img src="/brand/cherry.svg" alt="" width={76} height={76} />
          <CertMark kind="ok" className={s.badge} />
        </div>
        <div className={s.grow}>
          <p className={s.title}>
            <span className={s.lit}>{certCopy.proof.verifiedTitleLit}</span>
            {certCopy.proof.verifiedTitleRest}
          </p>
          <p className={s.line}>{certCopy.proof.verifiedLine(state.entries)}</p>
          <p className={s.seal} data-testid="proof-seal">
            {certCopy.proof.sealLine(
              state.checkpoints.map((c) => c.id),
              kids.map(kid8).join(', '),
            )}
          </p>
        </div>
      </div>
    );
  }
  if (state.status === 'mismatch') return <Mismatch state={state} />;
  if (state.status === 'unavailable') {
    return (
      <div className={s.row}>
        <div className={`${s.mark} ${s.plain}`}>
          <CertMark kind="wait" className={s.big} />
        </div>
        <div className={s.grow}>
          <p className={s.title}>{certCopy.proof.unavailableTitle}</p>
          <p className={s.line}>{certCopy.proof.unavailableLine}</p>
        </div>
      </div>
    );
  }
  const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
  return (
    <div className={s.row}>
      <div className={`${s.mark} ${s.plain}`}>
        <CertIcon name="ring" className={`${s.ic} ${s.spin}`} />
      </div>
      <div className={s.grow}>
        <p className={s.title} id="count-line">
          {certCopy.proof.loading(state.done, state.total)}
        </p>
        <div className={s.bar} role="progressbar" aria-label={certCopy.proof.barLabel} aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.done}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <p className={s.line}>{certCopy.proof.loadingLine}</p>
      </div>
    </div>
  );
}

function Mismatch({ state }: { state: Extract<ProofUiState, { status: 'mismatch' }> }) {
  const { failure, publishedKid } = state;
  const p = certCopy.proof;
  const line =
    state.record !== null
      ? p.mismatchRecord(state.record, state.total)
      : failure.step === 'unknown-key' || failure.step === 'checkpoint-signature'
        ? p.mismatchSeal
        : failure.step === 'short-hash'
          ? p.mismatchLink
          : failure.step === 'closure-incomplete'
            ? p.mismatchSet
            : p.mismatchFormat;
  const refs = [
    failure.seq !== undefined ? p.recordRef(failure.seq) : null,
    failure.checkpointId !== undefined ? p.checkpointRef(failure.checkpointId) : null,
    failure.step === 'unknown-key' && publishedKid ? p.expectedKey(kid8(publishedKid)) : null,
  ].filter(Boolean);
  return (
    <div data-testid="proof-mismatch" data-step={failure.step} data-seq={failure.seq ?? ''}>
      <div className={s.row}>
        <div className={`${s.mark} ${s.plain}`}>
          <CertMark kind="bad" className={s.big} />
        </div>
        <div className={s.grow}>
          <p className={s.title}>{p.mismatchTitle}</p>
          <p className={s.line}>
            <b>{line}</b>
          </p>
        </div>
      </div>
      <dl className={s.more}>
        <div>
          <dt>{p.whatFailed}</dt>
          <dd className={s.step}>
            {certCopy.steps[failure.step]} ({certCopy.stepWord} <code>{failure.step}</code>
            {refs.length > 0 ? `, ${refs.join(', ')}` : ''}).
          </dd>
        </div>
        <div>
          <dt>{p.whatItMeans}</dt>
          <dd>{p.means}</dd>
        </div>
        <div>
          <dt>{p.whatToDo}</dt>
          <dd>{p.todo}</dd>
        </div>
      </dl>
    </div>
  );
}

function How({ entries, kid }: { entries: number; kid: string | null }) {
  return (
    <details className={s.how}>
      <summary>
        {certCopy.proof.how}
        <CertIcon name="chevron" className={s.ic} />
      </summary>
      <div className={s.howBody}>
        <p>{certCopy.proof.howBody1(entries)}</p>
        <p>{certCopy.proof.howBody2}</p>
        <p className={s.links}>
          <a href={LEDGER_KEY_URL} id="public-key">
            {certCopy.proof.publicKey}
          </a>
          {kid ? <span className={s.fingerprint}>{certCopy.proof.keyLine(kid8(kid))}</span> : null}
        </p>
      </div>
    </details>
  );
}
