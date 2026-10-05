import type { Lang } from './index';

// Type-only import: this runs in the root layout's client <html> (src/app/_shell/DocumentHtml.tsx), which
// must not pull the message dictionaries into every page's bundle.

/** The English-only public pages: the certificate and its not-found (/verify/…). */
const ENGLISH_ONLY = /^\/verify(\/|$)/;

/**
 * The document's <html lang> (DES-221, EXE41): the chosen language (`udgam_lang`, already validated) on
 * the surfaces that speak it (the field app, enrolment, sign-in, the global not-found), but always English
 * on a page that renders only English, so a Kannada cookie never mislabels the public certificate.
 */
export function documentLang(pathname: string | null, chosen: Lang): Lang {
  return pathname !== null && ENGLISH_ONLY.test(pathname) ? 'en' : chosen;
}
