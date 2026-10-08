import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en, type MessageKey } from './en';
import { isLang, LANGS, t } from './index';
import { isFieldKey, kn } from './kn';

// TP18 / TC-025: Kannada carries every farmer- and agent-facing key with the same placeholders, each
// entry marked for native review; admin keys fall back to English.
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('kn.ts', () => {
  it('has every field key, non-empty, with the same placeholders as English', () => {
    for (const key of Object.keys(en) as MessageKey[]) {
      if (!isFieldKey(key)) continue;
      const v = kn[key];
      expect(v, key).toBeTypeOf('string');
      expect(v!.trim(), key).not.toBe('');
      expect(placeholders(v!), key).toEqual(placeholders(en[key]));
    }
  });

  it('marks every entry for native review and lists the pending review in its header', () => {
    const src = readFileSync(new URL('./kn.ts', import.meta.url), 'utf8');
    const entries = src.split('\n').filter((l) => /^\s+'[\w.]+':/.test(l));
    expect(entries.length).toBe(Object.keys(kn).length);
    for (const line of entries) expect(line).toContain('// REVIEW: native speaker');
    expect(src).toMatch(/PENDING REVIEW/);
  });
});

describe('t() with a language', () => {
  it('returns Kannada when asked, English by default, and English for admin-only keys', () => {
    expect(LANGS).toEqual(['en', 'kn']);
    expect(t('enrol.submit')).toBe('Set up this phone');
    expect(t('enrol.submit', {}, 'kn')).toBe(kn['enrol.submit']);
    expect(t('phones.title', {}, 'kn')).toBe('Phones');
    expect(t('enrol.title', { word: 'X' }, 'kn')).toContain('X');
  });

  it('isLang accepts only en and kn', () => {
    expect(isLang('en')).toBe(true);
    expect(isLang('kn')).toBe(true);
    for (const v of ['EN', 'hi', '', undefined, null, 1]) expect(isLang(v)).toBe(false);
  });
});
