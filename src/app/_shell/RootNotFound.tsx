'use client';

import { usePathname } from 'next/navigation';
import { NotFoundPage } from '../../components/ui/NotFound';
import type { Lang } from '../../lib/i18n';
import { documentLang } from '../../lib/i18n/document-lang';

export type NotFoundText = { title: string; body: string; back: string };

// The global not-found's words (DES-118): in the chosen language, except under an English-only path (an
// unmatched /admin/…, /buyer/…, /processor/… or /verify/… URL), where it speaks English, as the document's
// <html lang> says (documentLang, the same rule as DocumentHtml). A client component for the path; the
// server resolves both texts, so no message dictionary is shipped.
export function RootNotFound({ chosen, text }: { chosen: Lang; text: Record<Lang, NotFoundText> }) {
  const shown = text[documentLang(usePathname(), chosen)];
  return <NotFoundPage title={shown.title} body={shown.body} backHref="/" backLabel={shown.back} />;
}
