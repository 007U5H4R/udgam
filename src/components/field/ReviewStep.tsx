import { t, type Lang, type MessageKey } from '../../lib/i18n';
import { GlassCard } from '../ui/GlassCard';
import { Pill } from '../ui/Pill';
import { Ic } from './icons';
import { Lit } from './Lit';
import { SLOTS } from './PhotosStep';
import type { Slot } from './record-flow';

// Review a photo (final/index.html #s3) after the phone's camera: the photo itself, "Is the photo
// clear?" with the three things to check, then "Use this photo" (hashes it) or "Take again".

const CHECKS: MessageKey[] = ['rec.review.focus', 'rec.review.seen', 'rec.review.dark'];

export function ReviewStep({
  slot,
  preview,
  lang,
  busy,
  onBack,
  onUse,
  onRetake,
}: {
  slot: Slot;
  preview?: string;
  lang: Lang;
  busy: boolean;
  onBack: () => void;
  onUse: () => void;
  onRetake: () => void;
}) {
  const tr = (k: MessageKey, v: Record<string, string | number> = {}) => t(k, v, lang);
  const name = tr(SLOTS[slot]!.name);
  return (
    <main className="screen" aria-labelledby="s3-h">
      <header className="top">
        <button className="back" type="button" onClick={onBack}>
          <Ic name="arrowLeft" />
          {tr('rec.back')}
        </button>
        <span className="eyebrow">{tr('rec.review.eyebrow', { n: slot + 1, slot: name })}</span>
      </header>
      <div className="photo-big">
        {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL of the phone's own photo */}
        {preview ? <img src={preview} alt={tr('rec.review.alt', { slot: name })} /> : null}
      </div>
      <h1 className="h1 review-h" id="s3-h" tabIndex={-1}>
        <Lit k="rec.review.title" vars={{ clear: tr('rec.review.clear') }} lit="clear" lang={lang} />
      </h1>
      <p className="check-label">{tr('rec.review.check')}</p>
      <ul className="checklist">
        {CHECKS.map((k) => (
          <GlassCard as="li" card={false} key={k}>
            <span className="dot">
              <Ic name="check" />
            </span>
            {tr(k)}
          </GlassCard>
        ))}
      </ul>
      <div className="actions">
        <Pill icon={<Ic name="check" />} onClick={onUse} disabled={busy}>
          {tr('rec.review.use')}
        </Pill>
        <Pill variant="ghost" icon={<Ic name="camera" />} onClick={onRetake} disabled={busy}>
          {tr('rec.review.again')}
        </Pill>
      </div>
    </main>
  );
}
