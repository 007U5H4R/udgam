'use client';

import { Pill } from '../../../components/ui/Pill';
import { Sheet } from '../../../components/ui/Sheet';
import type { Lang } from '../../../lib/i18n';
import s from './enrol.module.css';

// The first-run language sheet (TC-025), ported from final/index.html `#lang-dialog`: the heading and
// the two big buttons name each language in its own script. Escape or the backdrop keeps English (the
// shipped default, N5).

export function LanguageSheet({ open, current, onChoose }: { open: boolean; current: Lang | null; onChoose: (lang: Lang) => void }) {
  return (
    <Sheet open={open} onClose={() => onChoose('en')} labelledBy="lang-h" testId="language-sheet">
      <h2 id="lang-h">
        <span lang="kn">ಭಾಷೆ</span> · Language
      </h2>
      <Pill className={s.langBig} aria-pressed={current === 'kn'} onClick={() => onChoose('kn')}>
        <span>
          <span lang="kn">ಕನ್ನಡ</span> / Kannada
        </span>
      </Pill>
      <Pill variant="ghost" className={s.langBig} aria-pressed={current === 'en'} onClick={() => onChoose('en')}>
        English
      </Pill>
    </Sheet>
  );
}
