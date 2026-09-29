import type { GpsState } from '../../client/gps';
import { t, type Lang, type MessageKey } from '../../lib/i18n';
import { Cherry } from '../ui/Cherry';
import { PhotoSlot } from '../ui/PhotoSlot';
import { Pill } from '../ui/Pill';
import { SlotDrawing, type SlotKind } from './drawings';
import { GpsLine } from './GpsLine';
import { Ic } from './icons';
import { Lit } from './Lit';
import type { FlowState, Slot } from './record-flow';

// Photos (final/index.html #s2): up to three labelled slots — The branch · Basket on the scale · The
// day's pile — with the counter, "Open camera" (the phone's own camera, F4) and "Continue with N
// photos". One photo is enough; at least one is needed.

export const SLOTS: { kind: SlotKind; name: MessageKey }[] = [
  { kind: 'branch', name: 'rec.slot.branch' },
  { kind: 'scale', name: 'rec.slot.scale' },
  { kind: 'pile', name: 'rec.slot.pile' },
];

export function PhotosStep({
  flow,
  lang,
  plotName,
  gps,
  previews,
  onBack,
  onCamera,
  onContinue,
}: {
  flow: FlowState;
  lang: Lang;
  plotName: string;
  gps: GpsState;
  previews: Partial<Record<Slot, string>>;
  onBack: () => void;
  onCamera: (slot: Slot) => void;
  onContinue: () => void;
}) {
  const tr = (k: MessageKey, v: Record<string, string | number> = {}) => t(k, v, lang);
  const used = flow.photos.filter((p) => p.sha256 !== undefined).length;
  const next = flow.photos.find((p) => p.sha256 === undefined)?.slot;
  return (
    <main className="screen" aria-labelledby="s2-h">
      <header className="top">
        <button className="back" type="button" onClick={onBack}>
          <Ic name="arrowLeft" />
          {tr('rec.back')}
        </button>
        <span className="eyebrow">{tr('rec.photos.eyebrow', { plot: plotName })}</span>
      </header>
      <Cherry size={104} className="float-top" />
      <h1 className="h1" id="s2-h" tabIndex={-1}>
        <Lit k="rec.photos.title" vars={{ count: tr('rec.photos.count') }} lit="count" lang={lang} />
      </h1>
      <p className="lede">
        {tr('rec.photos.lede')}
        <span className="more">{tr('rec.photos.more')}</span>
      </p>
      <GpsLine state={gps} lang={lang} />
      <p className="counter">
        <span>{tr('rec.photos.yours')}</span>
        <b data-testid="photo-counter">{tr('rec.photos.counter', { n: used })}</b>
      </p>
      <ol className="slots" aria-label={tr('rec.photos.slots')}>
        {flow.photos.map((p) => {
          const state = p.sha256 !== undefined ? 'filled' : p.slot === next ? 'next' : 'todo';
          const slot = SLOTS[p.slot]!;
          return (
            <PhotoSlot
              key={p.slot}
              state={state}
              name={tr(slot.name)}
              preview={previews[p.slot]}
              example={<SlotDrawing kind={slot.kind} />}
              stateIcon={state === 'filled' ? <Ic name="check" /> : state === 'next' ? <Ic name="camera" /> : undefined}
              stateLabel={tr(state === 'filled' ? 'rec.slot.added' : state === 'next' ? 'rec.slot.next' : 'rec.slot.example')}
            />
          );
        })}
      </ol>
      <div className="actions">
        {next !== undefined ? (
          <Pill icon={<Ic name="camera" />} onClick={() => onCamera(next)}>
            {tr('rec.camera')}
          </Pill>
        ) : null}
        {used > 0 ? (
          <Pill variant={used >= 3 ? 'primary' : 'ghost'} onClick={onContinue}>
            {used === 1 ? tr('rec.continue1') : tr('rec.continueN', { n: used })}
          </Pill>
        ) : (
          <p className="note" data-testid="need-one">
            {tr('rec.needOne')}
          </p>
        )}
      </div>
    </main>
  );
}
