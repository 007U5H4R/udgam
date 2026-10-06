import type { GpsState } from '../../client/gps';
import { t, type Lang, type MessageKey } from '../../lib/i18n';
import { Keypad } from '../ui/Keypad';
import { Pill } from '../ui/Pill';
import { GpsLine } from './GpsLine';
import { Ic } from './icons';
import { kgPrompt, kgValue, type KgLine } from './record-flow';

// Weight (final/index.html #s3-kg): "How many kilos?", the lit number with its unit, the farmer's own
// recent range as a hint (never the yield threshold, D6), the keypad and the value in the Send pill.
// DES-019: a refused key says the half-kilo rule, and a weight far from the farmer's own range turns the
// hint amber and the pill into "Yes, send …" (no dialog, Design.md §21): a mistyped 425 is never sent
// without comment. DES-028: the "Yes, send" label never shows without its reason: a refused key on an
// unlikely weight shows the rule and the check line together (kgPrompt). The S3 timing starts at the
// Send tap (EV9, EVAL-070): `udgam:t0-submit` is marked in the click handler before any async work.

export const T0_MARK = 'udgam:t0-submit';

export function WeightStep({
  kg,
  refused = false,
  photos,
  plotName,
  range,
  lang,
  gps,
  onKey,
  onBack,
  onSend,
}: {
  kg: string;
  /** The last key was refused by the keypad's rule. */
  refused?: boolean;
  photos: number;
  plotName: string;
  range: { min: number; max: number } | null;
  lang: Lang;
  gps: GpsState;
  onKey: (k: string) => void;
  onBack: () => void;
  onSend: () => void;
}) {
  const tr = (k: MessageKey, v: Record<string, string | number> = {}) => t(k, v, lang);
  const value = kgValue(kg);
  const prompt = kgPrompt(kg, refused, range);
  const span = range ? { min: Math.floor(range.min), max: Math.ceil(range.max) } : { min: 0, max: 0 };
  const LINE: Record<KgLine, () => string> = {
    rule: () => tr('rec.kg.rule'),
    check: () => tr('rec.kg.check', { kg: value!, ...span }),
    hint: () => tr('rec.kg.hint', span),
  };
  return (
    <main className="screen kg-screen" aria-labelledby="kg-h">
      <header className="top">
        <button className="back" type="button" onClick={onBack}>
          <Ic name="arrowLeft" />
          {tr('rec.back')}
        </button>
        <span className="eyebrow">{photos === 1 ? tr('rec.kg.eyebrow1', { plot: plotName }) : tr('rec.kg.eyebrowN', { plot: plotName, n: photos })}</span>
      </header>
      <h1 className="h1" id="kg-h" tabIndex={-1}>
        {tr('rec.kg.title')}
      </h1>
      <p className="kg-read">
        <output className={['kg-num', 'lit', kg ? '' : 'empty'].filter(Boolean).join(' ')} htmlFor="keypad" aria-live="polite">
          {kg || '0'}
        </output>
        <span className="kg-unit">{tr('rec.kg.unit')}</span>
      </p>
      {prompt.lines.length > 0 ? (
        <p className={prompt.warn ? 'kg-hint warn' : 'kg-hint'} role="status">
          {prompt.lines.map((l) => (
            <span className="kg-line" key={l}>
              {LINE[l]()}
            </span>
          ))}
        </p>
      ) : null}
      <GpsLine state={gps} lang={lang} />
      <Keypad onKey={onKey} label={tr('rec.kg.keys')} decimalLabel={tr('rec.kg.decimal')} deleteLabel={tr('rec.kg.delete')} />
      <div className="kg-actions">
        <Pill
          id="send-btn"
          icon={<Ic name="arrowRight" />}
          disabled={value === null}
          onClick={() => {
            performance.mark(T0_MARK);
            onSend();
          }}
        >
          {value === null ? tr('rec.kg.type') : tr(prompt.pill === 'sendCheck' ? 'rec.kg.sendCheck' : 'rec.kg.send', { kg: value })}
        </Pill>
      </div>
    </main>
  );
}
