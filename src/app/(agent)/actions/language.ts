'use server';

import { cookies } from 'next/headers';
import { isLang, LANG_COOKIE, type Lang } from '../../../lib/i18n';
import { requireSession } from '../../_auth/require';

// The capture app's language switch ಕನ್ನಡ / English (TSK-11.7, TP18, N5): the choice lives in the
// `udgam_lang` cookie for a year (sameSite=lax); the root layout reads it for <html lang> and every
// agent page for its dictionary. It is a display preference, not a credential: the first-run language
// sheet on /enrol writes the same cookie from the page, so it is not httpOnly.

const YEAR_S = 365 * 24 * 3600;

export async function setLanguage(lang: Lang): Promise<{ ok: boolean }> {
  await requireSession('agent', { action: true });
  if (!isLang(lang)) return { ok: false };
  (await cookies()).set(LANG_COOKIE, lang, { path: '/', maxAge: YEAR_S, sameSite: 'lax' });
  return { ok: true };
}
