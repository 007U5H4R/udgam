import { CertIcon } from './CertIcon';
import { VerdictMark } from './VerdictChip';
import s from './Timeline.module.css';

// The certificate's journey timeline (verify.html "4 · journey"): Harvested → Checked → Batched → Handed
// to buyer, each step a dot, a word, when and where. The caller words the steps (from the feed's
// payloads, TP16); this only draws them.

export type TimelineStep = {
  key: string;
  step: string;
  when: string;
  where: string;
  /**
   * M-002 (Design.md §28.5): a flagged processing step's line ("Flagged: 75–85% is expected for …"). The dot
   * then shows the Needs-a-check mark in --check (word + mark + colour), as contract.html screen 7.
   */
  flag?: string;
};

export function Timeline({ steps, className }: { steps: TimelineStep[]; className?: string }) {
  return (
    <div className={[s.journey, className].filter(Boolean).join(' ')}>
      <ol className={s.tl}>
        {steps.map((t) => (
          <li key={t.key}>
            {t.flag ? (
              <span className={`${s.dot} ${s.dotFlag}`} data-flag="true">
                <VerdictMark kind="check" className={s.mk} />
              </span>
            ) : (
              <span className={s.dot}>
                <CertIcon name="check" className={s.ic} />
              </span>
            )}
            <div>
              <p className={s.step}>{t.step}</p>
              <p className={s.when}>{t.when}</p>
              <p className={s.where}>{t.where}</p>
              {t.flag ? (
                <p className={s.flag}>
                  <VerdictMark kind="check" className={s.mk} />
                  <span>{t.flag}</span>
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
