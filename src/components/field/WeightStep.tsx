import type { GpsState } from '../../client/gps';
import { t, type Lang, type MessageKey } from '../../lib/i18n';
import { Keypad } from '../ui/Keypad';
import { Pill } from '../ui/Pill';
import { GpsLine } from './GpsLine';
import { Ic } from './icons';
import { kgOutOfRange, kgValue } from './record-flow';

// Weight (final/index.html #s3-kg): "How many kilos?", the lit number with its unit, the farmer's own
// recent range as a hint (never the yield threshold, D6), the keypad and the value in the Send pill.
// DES-019: a refused key says the half-kilo rule, and a weight far from the farmer's own range turns the
// hint amber and the pill into "Yes, send …" (no dialog, Design.md §21): a mistyped 425 is never sent
// without comment. The S3 timing starts at the Send tap (EV9, EVAL-070): `udgam:t0-submit` is marked in the click
// handler before any async work.

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
  const unlikely = kgOutOfRange(value, range);
  const span = range ? { min: Math.floor(range.min), max: Math.ceil(range.max) } : null;
  const hint = refused ? tr('rec.kg.rule') : unlikely && span ? tr('rec.kg.check', { kg: value!, ...span }) : span ? tr('rec.kg.hint', span) : null;
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
      {hint ? (
        <p className={refused || unlikely ? 'kg-hint warn' : 'kg-hint'} role="status">
          {hint}
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
          {value === null ? tr('rec.kg.type') : tr(unlikely ? 'rec.kg.sendCheck' : 'rec.kg.send', { kg: value })}
        </Pill>
      </div>
    </main>
  );
}
