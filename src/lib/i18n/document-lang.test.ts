import { describe, expect, it } from 'vitest';
import { documentLang } from './document-lang';

// DES-221 (EXE41): <html lang> follows the `udgam_lang` choice only where the page speaks it. The public
// certificate (/verify/…) is English-only, so it declares "en" whatever the cookie says.

describe('documentLang (DES-221)', () => {
  it('the certificate and its not-found are English under a Kannada choice', () => {
    expect(documentLang('/verify/B-2026-0001', 'kn')).toBe('en');
    expect(documentLang('/verify/B-UNKNOWN0', 'kn')).toBe('en');
    expect(documentLang('/verify', 'kn')).toBe('en');
    expect(documentLang('/verify/', 'kn')).toBe('en');
  });

  it('the surfaces that speak Kannada keep the choice', () => {
    expect(documentLang('/field', 'kn')).toBe('kn');
    expect(documentLang('/field/pickings', 'kn')).toBe('kn');
    expect(documentLang('/enrol', 'kn')).toBe('kn');
    expect(documentLang('/sign-in', 'kn')).toBe('kn');
    expect(documentLang('/no-such-page', 'kn')).toBe('kn'); // the global not-found is localised
    expect(documentLang(null, 'kn')).toBe('kn');
  });

  it('a path that only starts with "verify" is not the certificate', () => {
    expect(documentLang('/verifyx', 'kn')).toBe('kn');
  });

  it('English stays English everywhere', () => {
    expect(documentLang('/field', 'en')).toBe('en');
    expect(documentLang('/verify/B-1', 'en')).toBe('en');
  });
});
