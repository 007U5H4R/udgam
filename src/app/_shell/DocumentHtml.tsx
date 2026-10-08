'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { Lang } from '../../lib/i18n';
import { documentLang } from '../../lib/i18n/document-lang';

// The root layout's <html> (DES-221, EXE41). Its `lang` comes from the route as well as the language
// cookie: the English-only certificate says "en" under a Kannada cookie. A client component so the
// attribute follows a client-side navigation too (the root layout itself does not re-render on one),
// and it is in the server-rendered HTML from the first byte.
export function DocumentHtml({ chosen, className, children }: { chosen: Lang; className: string; children: ReactNode }) {
  return (
    <html lang={documentLang(usePathname(), chosen)} className={className}>
      {children}
    </html>
  );
}
