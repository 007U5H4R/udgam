'use client';

import { useRouter } from 'next/navigation';
import { setLanguage } from '../../app/(agent)/actions/language';
import { LanguageSheet } from '../../app/(agent)/enrol/LanguageSheet';
import { setPref } from '../../client/db';
import { t, type Lang } from '../../lib/i18n';
import { Ic } from './icons';

// The header's language chip (final/index.html `.chip.lang-btn`, TSK-11.7): it names the other language
// in its own script and opens the language sheet — the first-run sheet of /enrol (TKT-05), not a second
// one. Choosing sets the `udgam_lang` cookie through the setLanguage Server Action (and the phone's own
// copy, as the first run does), then the page renders again in that language.

export function LanguageChip({ lang, open, onOpenChange }: { lang: Lang; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  async function choose(next: Lang) {
    onOpenChange(false);
    setPref('lang', next).catch(() => undefined); // the cookie alone is enough
    if (next === lang) return;
    const r = await setLanguage(next).catch(() => ({ ok: false }));
    if (r.ok) router.refresh();
  }
  return (
    <>
      <button className="chip" type="button" aria-haspopup="dialog" aria-label={t('lang.label', {}, lang)} onClick={() => onOpenChange(true)}>
        <Ic name="globe" />
        {lang === 'kn' ? <span lang="en">{t('lang.en')}</span> : <span lang="kn">{t('lang.kn')}</span>}
      </button>
      <LanguageSheet open={open} current={lang} onChoose={(next) => void choose(next)} onDismiss={() => onOpenChange(false)} />
    </>
  );
}
