'use server';

import { cookies } from 'next/headers';
import { env } from '../../../lib/config/env';
import { isLang, LANG_COOKIE, type Lang } from '../../../lib/i18n';
import { requireSession } from '../../_auth/require';

// The capture app's language switch ಕನ್ನಡ / English (TSK-11.7, TP18, N5): the choice lives in the
// `udgam_lang` cookie for a year (sameSite=lax); the root layout reads it for <html lang> and every
// agent page for its dictionary. It is a display preference, not a credential: the first-run language
// sheet on /enrol writes the same cookie from the page, so it is not httpOnly. In production it is
// Secure, like every cookie of a Full-tier HTTPS deployment (the session cookies too, lib/auth/auth.ts).

const YEAR_S = 365 * 24 * 3600;

export async function setLanguage(lang: Lang): Promise<{ ok: boolean }> {
  await requireSession('agent', { action: true });
  if (!isLang(lang)) return { ok: false };
  (await cookies()).set(LANG_COOKIE, lang, { path: '/', maxAge: YEAR_S, sameSite: 'lax', secure: env.NODE_ENV === 'production' });
  return { ok: true };
}
