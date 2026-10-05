'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { finishAnswered, type OutboxSend } from '../../client/capture-client';
import { getDevice } from '../../client/device-key';
import { hashFile } from '../../client/hash-file';
import { stagePhoto } from '../../client/stage-client';
import type { CheckId, CheckStatus } from '../../lib/verification/types';
import { t, type Lang } from '../../lib/i18n';
import { VERDICT_IN_MARK } from '../ui/VerdictScreen';
import { CheckingStep } from './CheckingStep';
import { PhotosStep, SLOTS } from './PhotosStep';
import { hydratedAttr, useHydrated } from './useHydrated';
import { initialFlow, kgValue, photoProblem, reduce, usedPhotos, type Slot } from './record-flow';
import { ReviewStep } from './ReviewStep';
import { sendPicking, settleAction } from './send-picking';
import { whenOnline } from './offline';
import { useGps } from './useGps';
import { SavedSheet } from './SavedSheet';
import { VerdictStep } from './VerdictStep';
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
  /** The signed, saved copy of this picking, from the moment it is stored: Try again re-sends it (TP7). */
  const held = useRef<OutboxSend | null>(null);
  /** A send is running: a second tap never signs a second copy. */
  const busy = useRef(false);
  const reduced = useReducedMotion();
  const hydrated = useHydrated(); // QA-P5-7: the e2e waits for this before choosing a photo
  // The verdict whose screen is showing; until then the finished checking screen stays up.
  const [seenFor, setSeenFor] = useState<string | null>(null);
  const resultId = flow.step === 'verdict' ? (flow.result?.eventId ?? null) : null;
  const holdChecking = resultId !== null && seenFor !== resultId;

  // Bookkeeping owed from an earlier answer (a store error after the server answered) is finished when
  // the flow opens, before this picking is signed (TASK-11 fix round 1).
  useEffect(() => {
    void finishAnswered();
  }, []);

  // DES-013: a phone with no key cannot send a picking: it goes to set-up before any photo is taken
  // (Home gates its Record pill the same way; this covers a link or bookmark straight to the flow).
  useEffect(() => {
    let live = true;
    getDevice()
      .then((d) => {
        if (live && d === null) router.replace('/enrol');
      })
      .catch(() => undefined); // an unreadable store is caught at Send (the set-up sheet)
    return () => {
      live = false;
    };
  }, [router]);

  // The verdict (or refusal) has rendered on the checking screen: marked before the 600 ms auto-advance
  // hold and before "See result" under reduced motion, so the hold is reported as its own split. EV9's t1
  // (the verdict card visible) is marked by VerdictScreen.
  const answered = flow.step === 'verdict';
  useEffect(() => {
    if (!answered) return;
    const id = requestAnimationFrame(() => performance.mark(VERDICT_IN_MARK));
    return () => cancelAnimationFrame(id);
  }, [answered]);

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
  // DES-006: a Try again keeps its sheet up, busy, until the first check arrives (or it fails again).
  const screen = holdChecking ? 'checking' : flow.step === 'checking' && flow.retry ? 'saved' : flow.step;
  const sheetError = flow.retry ?? flow.error;
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
    if (slot === undefined || !file) return;
    setHashing(true);
    try {
      const h = await hashFile(file);
      // Never sign a photo the capture boundary will refuse (415 / 413): say so here instead.
      const problem = photoProblem(h);
      dispatch(problem ? { type: 'refuse', slot, file, why: problem } : { type: 'use', slot, file, ...h });
      // Upload it now, in the background, so Send carries only the signed picking (TKT-30). Invisible to
      // the farmer; if it fails the photo simply goes with the picking.
      if (!problem) void stagePhoto(file, h.sha256, { mime: h.mime, slot });
    } catch (err) {
      console.error('capture.photo_read_failed', { errClass: err instanceof Error ? err.name : typeof err });
      dispatch({ type: 'refuse', slot, file, why: 'read' });
    } finally {
      setHashing(false);
    }
  }

  const onCheck = (id: CheckId, status: CheckStatus) => dispatch({ type: 'check', id, status });

  /** Send: sign and keep the picking, then upload it; "Try again" re-sends the identical copy (TP7). */
  async function send() {
    const cherryKg = kgValue(flow.kg);
    if (cherryKg === null || busy.current) return;
    busy.current = true;
    dispatch({ type: 'send' });
    try {
      const photos = usedPhotos(flow).map(({ file, sha256, size, mime }) => ({ file, sha256, size, mime }));
      const r = await sendPicking(held, { plotId: plot.id, cherryKg, photos, gps: gps.watch() }, { onCheck });
      dispatch(settleAction(r));
    } finally {
      busy.current = false;
    }
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
          {...hydratedAttr(hydrated)}
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
          onBack={() => whenOnline(() => router.push('/field'))}
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
          error={flow.photoError}
          onBack={() => dispatch({ type: 'back' })}
          onUse={() => void acceptPhoto()}
          onRetake={retake}
        />
      ) : null}
      {flow.step === 'weight' ? (
        <WeightStep
          kg={flow.kg}
          refused={flow.kgRefused}
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
      {screen === 'verdict' ? (
        <VerdictStep
          result={flow.result}
          refusal={flow.error?.kind === 'rejected' ? { reason: flow.error.reason ?? 'other' } : undefined}
          lang={lang}
          plotName={plot.name}
          kg={kgValue(flow.kg) ?? 0}
          motion={!reduced}
          onDone={() => whenOnline(() => router.push('/field'))}
        />
      ) : null}
      {screen === 'saved' && sheetError && sheetError.kind !== 'rejected' ? (
        <SavedSheet
          cause={sheetError.kind}
          reason={sheetError.reason}
          retryAfterSec={sheetError.retryAfterSec}
          busy={flow.step === 'checking'}
          again={sheetError.again === true}
          lang={lang}
          photos={usedPhotos(flow).length}
          kg={kgValue(flow.kg) ?? 0}
          plotName={plot.name}
          onRetry={() => void send()}
          onSetUp={() => whenOnline(() => router.push('/enrol'))}
          onLater={() => whenOnline(() => router.push('/field'))}
        />
      ) : null}
    </>
  );
}
