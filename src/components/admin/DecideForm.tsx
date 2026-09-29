'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { overrideRun, rerunRun, type Refusal } from '../../app/(admin)/admin/review/actions';
import { istClock, istDay } from '../../lib/review/copy';
import { checkReason, REASON_MIN } from '../../lib/review/reason';
import { Pill } from '../ui/Pill';
import pill from '../ui/Pill.module.css';
import { VerdictMark } from '../ui/VerdictChip';
import { Icon } from './QueueList';

// The decision area of the review detail (TSK-12.4 "Check again", TSK-12.6), ported from final/admin.html
// lines 529–551: the action row (Accept as verified · Not accepted · Check again + hint), the inline
// decide form with its mandatory reason (live counter, the signed-and-public note, the confirm pill
// disabled under 10 characters, an inline error for a phone number), and the outcome panel. Focus moves
// to the outcome after a decision and the live region announces it. The server re-checks everything.

export type Decision = { verdict: 'Verified' | 'Rejected'; reason: string; adminName: string; at: string };
type Mode = 'accept' | 'reject';

const MESSAGE: Record<Refusal['reason'], string> = {
  reason_too_short: `Write at least ${REASON_MIN} characters.`,
  reason_too_long: 'Keep the reason under 1,000 characters.',
  reason_has_phone: 'Take out the phone number: the reason is shown on the public certificate.',
  hard_fail_final: "This one can't be changed: a check failed that can't be overruled.",
  already_decided: 'This picking was already decided. The page now shows that decision.',
  not_reviewable: 'This picking no longer needs a decision. The page now shows its latest result.',
  batched: "This picking is in a batch, so its result is fixed and can't be changed.",
  not_found: "This picking isn't in your organisation's list.",
  nothing_to_rerun: 'All checks ran — nothing to retry.',
  failed: "Couldn't save. Nothing was changed. Try again in a moment.",
};

export function DecideForm({
  runId,
  adminName,
  unavailable,
  next,
  decided,
}: {
  runId: string;
  adminName: string;
  /** The admin names of the checks that could not run ("Check again" re-runs exactly these). */
  unavailable: string[];
  next: { runId: string; left: number } | null;
  decided: Decision | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [actError, setActError] = useState<string | null>(null);
  const [local, setLocal] = useState<Decision | null>(null);
  const [live, setLive] = useState('');
  const [saving, startSaving] = useTransition();
  const [checking, startChecking] = useTransition();
  const outcomeRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const openerRef = useRef<Mode | null>(null);
  const ids = useId();

  const decision = decided ?? local;
  const len = reason.trim().length;
  const ready = len >= REASON_MIN;

  useEffect(() => {
    if (local) outcomeRef.current?.focus();
  }, [local]);
  useEffect(() => {
    if (mode) reasonRef.current?.focus();
  }, [mode]);

  const open = (m: Mode) => {
    openerRef.current = m;
    setMode(m);
    setReason('');
    setError(null);
  };
  const close = () => {
    const m = openerRef.current;
    setMode(null);
    setError(null);
    requestAnimationFrame(() => document.getElementById(m === 'reject' ? 'btn-reject' : 'btn-accept')?.focus());
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!mode || saving) return;
    const checked = checkReason(reason);
    if (!checked.ok) {
      setError(MESSAGE[checked.code]);
      return;
    }
    const newVerdict = mode === 'accept' ? 'Verified' : 'Rejected';
    startSaving(async () => {
      let r: Awaited<ReturnType<typeof overrideRun>>;
      try {
        r = await overrideRun({ runId, newVerdict, reason: checked.reason });
      } catch {
        setError(MESSAGE.failed);
        return;
      }
      if (!r.ok) {
        setError(MESSAGE[r.reason]);
        if (r.status === 409) router.refresh();
        return;
      }
      setLocal({ verdict: newVerdict, reason: r.reason, adminName, at: r.at });
      setMode(null);
      setLive(`Recorded: ${newVerdict === 'Verified' ? 'accepted as verified' : 'not accepted'}. ${next ? `${next.left} left to check.` : 'Nothing else is waiting.'}`);
      router.refresh();
    });
  };

  const again = () => {
    if (checking) return;
    setActError(null);
    setLive('Running the checks that could not run again…');
    startChecking(async () => {
      let r: Awaited<ReturnType<typeof rerunRun>>;
      try {
        r = await rerunRun(runId);
      } catch {
        setActError(MESSAGE.failed);
        setLive('');
        return;
      }
      if (!r.ok) {
        setActError(MESSAGE[r.reason]);
        setLive(MESSAGE[r.reason]);
        if (r.status === 409) router.refresh();
        return;
      }
      setLive(`Checked again. Score ${r.score} of 100.`);
      router.push(`/admin/review/${encodeURIComponent(r.runId)}`);
    });
  };

  const liveRegion = (
    <p className="vh" aria-live="polite" data-testid="live">
      {live}
    </p>
  );

  if (decision) {
    const accepted = decision.verdict === 'Verified';
    return (
      <>
        <div className="glass outcome" ref={outcomeRef} tabIndex={-1} data-testid="outcome" aria-labelledby={`${ids}-o`}>
          <p className="o-top" id={`${ids}-o`}>
            <span className={`vchip ${accepted ? 'ok' : 'bad'}`}>
              <VerdictMark kind={accepted ? 'ok' : 'bad'} />
              {accepted ? 'Accepted as verified' : 'Not accepted'}
            </span>
            <b>Recorded</b>
          </p>
          <p className="o-meta">
            Signed with the account of {decision.adminName} (FPO admin) on {istDay(decision.at)} at {istClock(decision.at)}. This decision is recorded permanently and its reason is
            shown on the public certificate.
          </p>
          <blockquote>{decision.reason}</blockquote>
          {next ? (
            <Link className={`${pill.pill} o-next pill-link`} href={`/admin/review/${encodeURIComponent(next.runId)}`}>
              <Icon name="arrowRight" />
              Next picking ({next.left} left)
            </Link>
          ) : (
            <p>That was the last one. Nothing else is waiting.</p>
          )}
        </div>
        {liveRegion}
      </>
    );
  }

  const hint = unavailable.length ? `Check again runs ${unavailable.map((n) => `“${n}”`).join(', ')} again.` : 'All checks ran — nothing to retry';

  return (
    <>
      <div hidden={mode !== null}>
        <div className="act-row">
          <Pill className="act-pill" id="btn-accept" icon={<Icon name="check" />} onClick={() => open('accept')}>
            Accept as verified
          </Pill>
          <Pill className="act-pill" variant="ghost" id="btn-reject" icon={<Icon name="x" />} onClick={() => open('reject')}>
            Not accepted
          </Pill>
          <button
            className="textbtn"
            type="button"
            id="btn-again"
            aria-describedby={`${ids}-hint`}
            disabled={unavailable.length === 0 || checking}
            aria-busy={checking}
            onClick={again}
          >
            <Icon name={checking ? 'ring' : 'retry'} className={checking ? 'ic spin' : 'ic'} />
            <span>{checking ? 'Checking again…' : 'Check again'}</span>
          </button>
        </div>
        <p className="again-hint" id={`${ids}-hint`}>
          {hint}
        </p>
        <p className="act-error" role="alert">
          {actError ?? ''}
        </p>
      </div>
      {mode ? (
        <form className={`decide${mode === 'reject' ? ' reject' : ''}`} noValidate aria-labelledby={`${ids}-h`} onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && close()}>
          <h3 id={`${ids}-h`}>
            <VerdictMark kind={mode === 'accept' ? 'ok' : 'bad'} />
            {mode === 'accept' ? 'Accept as verified' : 'Mark as not accepted'}
          </h3>
          <label htmlFor={`${ids}-reason`}>
            Reason <span>(at least {REASON_MIN} characters)</span>
          </label>
          <textarea
            ref={reasonRef}
            id={`${ids}-reason`}
            name="reason"
            rows={3}
            value={reason}
            required
            minLength={REASON_MIN}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${ids}-cnt ${ids}-note ${ids}-err`}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
          />
          <p className={`cnt${ready ? ' ready' : ''}`} id={`${ids}-cnt`}>
            {ready ? `${len} characters · ready to confirm` : `${len} of at least ${REASON_MIN} characters`}
          </p>
          <p className="dec-error" id={`${ids}-err`} role="alert">
            {error ?? ''}
          </p>
          <p className="dec-note" id={`${ids}-note`}>
            <Icon name="seal" />
            <span>Your decision is signed with your account and recorded permanently. The reason is shown on the public certificate.</span>
          </p>
          <div className="dec-btns">
            <Pill type="submit" className={mode === 'reject' ? 'red' : undefined} disabled={!ready || saving} aria-busy={saving} icon={<Icon name={mode === 'accept' ? 'check' : 'x'} />}>
              {saving ? 'Recording…' : mode === 'accept' ? 'Confirm: accept as verified' : 'Confirm: not accepted'}
            </Pill>
            <Pill variant="ghost" onClick={close} disabled={saving}>
              Cancel
            </Pill>
          </div>
        </form>
      ) : null}
      {liveRegion}
    </>
  );
}
