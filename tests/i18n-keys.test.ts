import { describe, expect, it } from 'vitest';
import { en } from '../src/lib/i18n/en';
import { isFieldKey, kn } from '../src/lib/i18n/kn';

// TSK-11.8 / TC-052: the English and Kannada dictionaries carry the same keys, so the ಕನ್ನಡ switch never
// falls back to English on a farmer- or agent-facing string, and every Kannada entry has words in it.
// The admin surfaces are English only (TP18, kn.ts header): their keys (`rail.*`, `phones.*`) are the
// one agreed exception, and kn must not carry them either.

// `agreements.*` (TKT-25): the buyer and FPO-admin agreement screens are office surfaces, English only.
const ADMIN_PREFIXES = ['rail.', 'phones.', 'agreements.'];

describe('en and kn key sets (TC-052)', () => {
  it('kn has exactly the keys of en, apart from the English-only admin keys', () => {
    const enKeys = Object.keys(en).filter(isFieldKey).sort();
    const knKeys = Object.keys(kn).sort();
    expect(knKeys.filter((k) => !enKeys.includes(k))).toEqual([]); // nothing kn-only
    expect(enKeys.filter((k) => !knKeys.includes(k))).toEqual([]); // nothing missing
  });

  it('the only English-only keys are the admin surfaces', () => {
    const englishOnly = Object.keys(en).filter((k) => !isFieldKey(k));
    expect(englishOnly.length).toBeGreaterThan(0);
    for (const k of englishOnly) expect(ADMIN_PREFIXES.some((p) => k.startsWith(p)), k).toBe(true);
  });

  it('every kn value is a non-empty string', () => {
    for (const [k, v] of Object.entries(kn)) {
      expect(typeof v, k).toBe('string');
      expect(v!.trim(), k).not.toBe('');
    }
  });
});
