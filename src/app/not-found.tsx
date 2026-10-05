import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { NotFoundPage } from '../components/ui/NotFound';
import { isLang, LANG_COOKIE, t } from '../lib/i18n';

// Any URL that matches no route (DES-104): the styled not-found card on the dark ground, never Next's
// default white page, with a way back: `/` sends a signed-in person to their role's home and anyone else
// to sign in. In the agent's language when they chose one. The 404 status is Next's.
export const metadata: Metadata = { title: 'Not found · Udgam' };

export default async function NotFound() {
  const chosen = (await cookies()).get(LANG_COOKIE)?.value;
  const lang = isLang(chosen) ? chosen : 'en';
  return <NotFoundPage title={t('notFound.title', {}, lang)} body={t('notFound.body', {}, lang)} backHref="/" backLabel={t('notFound.home', {}, lang)} />;
}
