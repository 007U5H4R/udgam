'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { hashFile } from '../../client/hash-file';
import { t, type Lang } from '../../lib/i18n';
import { PhotosStep, SLOTS } from './PhotosStep';
import { initialFlow, reduce, usedPhotos, type Slot } from './record-flow';
import { ReviewStep } from './ReviewStep';
import { useGps } from './useGps';
import { WeightStep } from './WeightStep';

// The record flow (technical-plan §3.2 /field/record, TSK-10.7+): photos → review → weight → checking →
// verdict, a full-screen stack with no tab bar (Design.md §5). The GPS watch starts when the flow
// mounts (TP13) and stops when it unmounts. The camera is the native file input only (F4, D6): one
// hidden `<input type=file accept=image/* capture=environment>` per slot, opened by "Open camera" and
// "Take again"; no gallery option.

export type RecordPlot = { id: string; name: string };

export function RecordFlow({ plot, lang, range = null }: { plot: RecordPlot; lang: Lang; range?: { min: number; max: number } | null }) {
  const router = useRouter();
  const [flow, dispatch] = useReducer(reduce, plot.id, initialFlow);
  const [hashing, setHashing] = useState(false);
  const gps = useGps();
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

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
  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, [flow.step]);

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
          onSend={() => dispatch({ type: 'send' })}
        />
      ) : null}
    </>
  );
}
