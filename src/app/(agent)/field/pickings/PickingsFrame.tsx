'use client';

import { useState, type ReactNode } from 'react';
import { HelpSheet, type HelpInfo } from '../../../../components/field/HelpSheet';
import { LanguageChip } from '../../../../components/field/LanguageChip';
import { TabBar } from '../../../../components/ui/TabBar';
import { t, type Lang } from '../../../../lib/i18n';

// The Pickings screen's frame (final/index.html #s8): the header with "Your pickings" and the language
// chip (TSK-11.7), the content, and the tab bar, whose Help tab opens the Help sheet in place when its
// content is known (TSK-11.6); otherwise (loading, error) it goes to /field/help.

export function PickingsFrame({ lang, busy, help = null, children }: { lang: Lang; busy?: boolean; help?: HelpInfo | null; children: ReactNode }) {
  const [helpShown, setHelpShown] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  return (
    <main className="screen has-tabs" aria-labelledby="s8-h" aria-busy={busy ? 'true' : undefined}>
      <header className="top">
        <h1 className="h1" id="s8-h" tabIndex={-1}>
          {t('pk.title', {}, lang)}
        </h1>
        <LanguageChip lang={lang} open={langOpen} onOpenChange={setLangOpen} />
      </header>
      {children}
      <TabBar current={helpShown ? 'help' : 'pickings'} lang={lang} onHelp={help ? () => setHelpShown(true) : undefined} />
      {help ? (
        <HelpSheet
          open={helpShown}
          onClose={() => setHelpShown(false)}
          lang={lang}
          info={help}
          onLanguage={() => {
            setHelpShown(false);
            setLangOpen(true);
          }}
        />
      ) : null}
    </main>
  );
}
