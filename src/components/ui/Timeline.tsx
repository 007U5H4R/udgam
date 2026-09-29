import { CertIcon } from './CertIcon';
import s from './Timeline.module.css';

// The certificate's journey timeline (verify.html "4 · journey"): Harvested → Checked → Batched → Handed
// to buyer, each step a dot, a word, when and where. The caller words the steps (from the feed's
// payloads, TP16); this only draws them.

export type TimelineStep = { key: string; step: string; when: string; where: string };

export function Timeline({ steps, className }: { steps: TimelineStep[]; className?: string }) {
  return (
    <div className={[s.journey, className].filter(Boolean).join(' ')}>
      <ol className={s.tl}>
        {steps.map((t) => (
          <li key={t.key}>
            <span className={s.dot}>
              <CertIcon name="check" className={s.ic} />
            </span>
            <div>
              <p className={s.step}>{t.step}</p>
              <p className={s.when}>{t.when}</p>
              <p className={s.where}>{t.where}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
