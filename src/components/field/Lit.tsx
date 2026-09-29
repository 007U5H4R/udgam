import type { ReactNode } from 'react';
import { t, type Lang, type MessageKey } from '../../lib/i18n';

// One lit word per screen (Rule of light): a translated sentence with one placeholder drawn in the
// gradient (`.lit`). Word order stays the dictionary's, so Kannada can put the word anywhere.

const MARK = '\u0000';

export function Lit({ k, vars = {}, lit, lang = 'en' }: { k: MessageKey; vars?: Record<string, string | number>; lit: string; lang?: Lang }): ReactNode {
  const word = String(vars[lit] ?? '');
  const [before, after = ''] = t(k, { ...vars, [lit]: MARK }, lang).split(MARK);
  return (
    <>
      {before}
      <span className="lit">{word}</span>
      {after}
    </>
  );
}
