import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { isLang, LANG_COOKIE, LANGS, t, type Lang } from '../lib/i18n';
import { RootNotFound, type NotFoundText } from './_shell/RootNotFound';

// Any URL that matches no route (DES-104): the styled not-found card on the dark ground, never Next's
// default white page, with a way back: `/` sends a signed-in person to their role's home and anyone else
// to sign in. In the agent's language when they chose one, except under the English-only office and
// certificate paths (DES-118, RootNotFound). The 404 status is Next's.
export const metadata: Metadata = { title: 'Not found · Udgam' };

const words = (lang: Lang): NotFoundText => ({ title: t('notFound.title', {}, lang), body: t('notFound.body', {}, lang), back: t('notFound.home', {}, lang) });

export default async function NotFound() {
  const chosen = (await cookies()).get(LANG_COOKIE)?.value;
  const text = Object.fromEntries(LANGS.map((l) => [l, words(l)])) as Record<Lang, NotFoundText>;
  return <RootNotFound chosen={isLang(chosen) ? chosen : 'en'} text={text} />;
}
