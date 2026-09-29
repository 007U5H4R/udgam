import { en, type MessageKey } from './en';

// Minimal t() (TP18): English only until TKT-05 adds Kannada and the language cookie.

export type { MessageKey };

/** The English string for `key`, with `{name}` placeholders filled from `vars`. */
export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  return en[key].replace(/\{(\w+)\}/g, (whole, name: string) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));
}
