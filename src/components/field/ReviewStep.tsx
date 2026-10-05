import { t, type Lang, type MessageKey } from '../../lib/i18n';
import { GlassCard } from '../ui/GlassCard';
import { Pill } from '../ui/Pill';
import { Ic } from './icons';
import { Lit } from './Lit';
import { SLOTS } from './PhotosStep';
import type { PhotoProblem, Slot } from './record-flow';

// Review a photo (final/index.html #s3) after the phone's camera: the photo itself, "Is the photo
// clear?" with the three things to check, then "Use this photo" (hashes it) or "Take again". A photo that
// cannot be sent says why in the inline error style (--bad-ink + icon, DES-018).

const CHECKS: MessageKey[] = ['rec.review.focus', 'rec.review.seen', 'rec.review.dark'];
/** Why this photo cannot be used, in the farmer's words (TASK-11 fix round 1). */
const PROBLEM: Record<PhotoProblem, MessageKey> = { type: 'rec.review.type', size: 'rec.review.size', read: 'rec.review.read' };

export function ReviewStep({
  slot,
  preview,
  lang,
  busy,
  error,
  onBack,
  onUse,
  onRetake,
}: {
  slot: Slot;
  preview?: string;
  lang: Lang;
  busy: boolean;
  /** The photo cannot be sent: the screen says why, and only Take again is offered. */
  error?: PhotoProblem;
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
      {error ? (
        <p className="photo-error" role="alert" data-testid="photo-error">
          <Ic name="alert" />
          {tr(PROBLEM[error])}
        </p>
      ) : null}
      <div className="actions">
        <Pill icon={<Ic name="check" />} onClick={onUse} disabled={busy || error !== undefined}>
          {tr('rec.review.use')}
        </Pill>
        <Pill variant="ghost" icon={<Ic name="camera" />} onClick={onRetake} disabled={busy}>
          {tr('rec.review.again')}
        </Pill>
      </div>
    </main>
  );
}
