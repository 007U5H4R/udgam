'use client';

import Image from 'next/image';
import { useDocLang, useRetry } from '../../../components/field/route-error';
import { Pill } from '../../../components/ui/Pill';
import { t } from '../../../lib/i18n';
import s from './enrol.module.css';

// /enrol's error boundary (CR-100; Design.md §18, EVAL-088): when phone set-up cannot render, it says so
// in the agent's language, that nothing was changed, and offers Try again, which renders the page
// afresh. Composed from the set-up screen's own parts (TP17). No error detail is shown.
export default function EnrolError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const lang = useDocLang();
  const retry = useRetry(reset);
  return (
    <main className={s.screen} data-state="error">
      <div className={s.cherry}>
        <Image src="/brand/cherry.svg" alt="" width={104} height={104} unoptimized />
      </div>
      <div role="alert">
        <h1 className={s.h1}>{t('enrol.crash.title', {}, lang)}</h1>
        <p className={s.lede}>{t('enrol.crash.body', {}, lang)}</p>
      </div>
      <div className={s.done}>
        <Pill variant="amber" onClick={retry}>
          {t('enrol.crash.retry', {}, lang)}
        </Pill>
      </div>
    </main>
  );
}
