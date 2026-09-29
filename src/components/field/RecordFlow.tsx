'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { sendOutboxItem, submitCapture, type OutboxSend, type SubmitResult } from '../../client/capture-client';
import { hashFile } from '../../client/hash-file';
import { refusalKeepsOutbox } from '../../lib/i18n/farmer-evidence';
import type { CheckId, CheckStatus } from '../../lib/verification/types';
import { t, type Lang } from '../../lib/i18n';
import { CheckingStep } from './CheckingStep';
import { PhotosStep, SLOTS } from './PhotosStep';
import { initialFlow, kgValue, reduce, usedPhotos, type FlowAction, type Slot } from './record-flow';
import { ReviewStep } from './ReviewStep';
import { useGps } from './useGps';
import { WeightStep } from './WeightStep';

// The record flow (technical-plan §3.2 /field/record, TSK-10.7+): photos → review → weight → checking →
// verdict, a full-screen stack with no tab bar (Design.md §5). The GPS watch starts when the flow
// mounts (TP13) and stops when it unmounts. The camera is the native file input only (F4, D6): one
// hidden `<input type=file accept=image/* capture=environment>` per slot, opened by "Open camera" and
// "Take again"; no gallery option.

export type RecordPlot = { id: string; name: string };

const REDUCED = '(prefers-reduced-motion: reduce)';

/** prefers-reduced-motion as React state (Design.md §15). */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(REDUCED);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/** Auto-advance from the finished checking screen to the verdict (motion allowed). */
const ADVANCE_MS = 600;

export function RecordFlow({ plot, lang, range = null }: { plot: RecordPlot; lang: Lang; range?: { min: number; max: number } | null }) {
  const router = useRouter();
  const [flow, dispatch] = useReducer(reduce, plot.id, initialFlow);
  const [hashing, setHashing] = useState(false);
  const gps = useGps();
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const sent = useRef<OutboxSend | null>(null);
  const reduced = useReducedMotion();
  // The verdict whose screen is showing; until then the finished checking screen stays up.
  const [seenFor, setSeenFor] = useState<string | null>(null);
  const resultId = flow.step === 'verdict' ? (flow.result?.eventId ?? null) : null;
  const holdChecking = resultId !== null && seenFor !== resultId;

  useEffect(() => {
    if (resultId === null || reduced) return;
    const timer = setTimeout(() => setSeenFor(resultId), ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [resultId, reduced]);

  // Show the farmer's own photos from memory; release them when they change or the flow closes.
  const [f0, f1, f2] = flow.photos.map((p) => p.file);
  const previews = useMemo(() => {
    const out: Partial<Record<Slot, string>> = {};
    [f0, f1, f2].forEach((f, i) => {
      if (f) out[i as Slot] = URL.createObjectURL(f);
    });
    return out;
  }, [f0, f1, f2]);
  useEffect(() => () => Object.values(previews).forEach((u) => URL.revokeObjectURL(u)), [previews]);

  // Each screen change starts at the top with focus on its heading.
  const screen = holdChecking ? 'checking' : flow.step;
  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, [screen]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const openCamera = (slot: Slot) => inputs.current[slot]?.click();

  async function acceptPhoto() {
    const slot = flow.reviewing;
    const file = slot === undefined ? undefined : flow.photos[slot]?.file;
    if (!file) return;
    setHashing(true);
    try {
      const h = await hashFile(file);
      dispatch({ type: 'use', ...h });
    } finally {
      setHashing(false);
    }
  }

  /** The screen's answer to a send: verdict, Not accepted, or saved on the phone. */
  function settle(r: SubmitResult) {
    const fail = (a: Omit<Extract<FlowAction, { type: 'fail' }>, 'type'>) => dispatch({ type: 'fail', ...a });
    if (r.kind === 'verdict') dispatch({ type: 'verdict', v: r.verdict });
    else if (r.kind === 'rejected') fail(refusalKeepsOutbox(r.reason) ? { kind: 'server', reason: r.reason } : { kind: 'rejected', reason: r.reason });
    else if (r.kind === 'retryable') fail({ kind: r.cause, ...(r.retryAfterSec !== undefined ? { retryAfterSec: r.retryAfterSec } : {}) });
    else if (r.reason === 'no_device') fail({ kind: 'rejected', reason: 'unknown_device' });
    else fail({ kind: 'server', reason: 'no_fix' });
  }

  const onCheck = (id: CheckId, status: CheckStatus) => dispatch({ type: 'check', id, status });

  /** Send: sign and keep the picking, then upload it; "Try again" re-sends the identical copy (TP7). */
  async function send() {
    const cherryKg = kgValue(flow.kg);
    if (cherryKg === null) return;
    dispatch({ type: 'send' });
    let r: SubmitResult;
    try {
      if (sent.current) {
        r = await sendOutboxItem(sent.current, { onCheck, keepOnRefusal: refusalKeepsOutbox });
      } else {
        const photos = usedPhotos(flow).map(({ file, sha256, size, mime }) => ({ file, sha256, size, mime }));
        const out = await submitCapture({ plotId: plot.id, cherryKg, photos, gps: gps.watch() }, { onCheck, keepOnRefusal: refusalKeepsOutbox });
        if (out.item) sent.current = out.item;
        r = out;
      }
    } catch {
      r = { kind: 'retryable', cause: 'server' }; // IndexedDB or signing failed: nothing was sent
    }
    if (r.kind === 'verdict' || (r.kind === 'rejected' && !refusalKeepsOutbox(r.reason))) sent.current = null;
    settle(r);
  }

  function retake() {
    const slot = flow.reviewing;
    dispatch({ type: 'retake' });
    if (slot !== undefined) openCamera(slot); // in the tap's own handler, so the browser opens the camera
  }

  return (
    <>
      {SLOTS.map((s, i) => (
        <input
          key={s.kind}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          className="vh"
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-label={t(s.name, {}, lang)}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // the same photo can be chosen again after Take again
            if (file) dispatch({ type: 'take', slot: i as Slot, file });
          }}
        />
      ))}
      {flow.step === 'photos' ? (
        <PhotosStep
          flow={flow}
          lang={lang}
          plotName={plot.name}
          gps={gps.state}
          previews={previews}
          onBack={() => router.push('/field')}
          onCamera={openCamera}
          onContinue={() => dispatch({ type: 'continue' })}
        />
      ) : null}
      {flow.step === 'review' && flow.reviewing !== undefined ? (
        <ReviewStep
          slot={flow.reviewing}
          preview={previews[flow.reviewing]}
          lang={lang}
          busy={hashing}
          onBack={() => dispatch({ type: 'back' })}
          onUse={() => void acceptPhoto()}
          onRetake={retake}
        />
      ) : null}
      {flow.step === 'weight' ? (
        <WeightStep
          kg={flow.kg}
          photos={usedPhotos(flow).length}
          plotName={plot.name}
          range={range}
          lang={lang}
          gps={gps.state}
          onKey={(k) => dispatch({ type: 'key', k })}
          onBack={() => dispatch({ type: 'back' })}
          onSend={() => void send()}
        />
      ) : null}
      {screen === 'checking' ? (
        <CheckingStep
          checks={flow.checks}
          complete={flow.step === 'verdict'}
          lang={lang}
          plotName={plot.name}
          kg={String(kgValue(flow.kg) ?? flow.kg)}
          photos={usedPhotos(flow).length}
          onSeeResult={() => resultId && setSeenFor(resultId)}
        />
      ) : null}
    </>
  );
}
