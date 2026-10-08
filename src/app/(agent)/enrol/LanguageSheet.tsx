'use client';

import { Ic } from '../../../components/field/icons';
import { Pill } from '../../../components/ui/Pill';
import { Sheet } from '../../../components/ui/Sheet';
import { t, type Lang } from '../../../lib/i18n';
import s from './enrol.module.css';

// The first-run language sheet (TC-025), ported from final/index.html `#lang-dialog`: the heading and
// the two big buttons name each language in its own script. On first run, Escape or the backdrop keeps
// English (the shipped default, N5); the header chip's switch (TKT-11) passes `onDismiss`, so dismissing
// it changes nothing. The current language carries the mockup's check mark beside its word, never colour
// alone (DES-007).

export function LanguageSheet({
  open,
  current,
  onChoose,
  onDismiss,
}: {
  open: boolean;
  current: Lang | null;
  onChoose: (lang: Lang) => void;
  onDismiss?: () => void;
}) {
  return (
    <Sheet open={open} onClose={onDismiss ?? (() => onChoose('en'))} labelledBy="lang-h" testId="language-sheet">
      {/* Bilingual by design: each language is named in its own script (the words come from the
          dictionaries, TSK-11.8, and read the same in both). */}
      <h2 id="lang-h">
        <span lang="kn">{t('lang.sheet.kn')}</span> · <span lang="en">{t('lang.sheet.en')}</span>
      </h2>
      <Pill className={s.langBig} aria-pressed={current === 'kn'} icon={current === 'kn' ? <Ic name="check" /> : undefined} onClick={() => onChoose('kn')}>
        <span>
          <span lang="kn">{t('lang.kn')}</span> / <span lang="en">{t('lang.kannada')}</span>
        </span>
      </Pill>
      <Pill variant="ghost" className={s.langBig} aria-pressed={current === 'en'} icon={current === 'en' ? <Ic name="check" /> : undefined} onClick={() => onChoose('en')}>
        <span lang="en">{t('lang.en')}</span>
      </Pill>
    </Sheet>
  );
}
