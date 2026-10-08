import { en, type MessageKey } from './en';
import { kn } from './kn';

// Minimal t() (TP18): English (the shipped default) and Kannada (chosen on the first-run language sheet,
// TKT-05, or the header chip, TKT-11). The choice lives in the `udgam_lang` cookie; admin-only keys fall back
// to English.

export type { MessageKey };

export const LANGS = ['en', 'kn'] as const;
export type Lang = (typeof LANGS)[number];
/** The cookie that holds the language choice (technical-plan TSK-11.7: `udgam_lang`, a year, sameSite=lax). */
export const LANG_COOKIE = 'udgam_lang';

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);

/** The string for `key` in `lang` (default English), with `{name}` placeholders filled from `vars`. */
export function t(key: MessageKey, vars: Record<string, string | number> = {}, lang: Lang = 'en'): string {
  const s = (lang === 'kn' ? kn[key] : undefined) ?? en[key];
  return s.replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));
}
