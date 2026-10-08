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

  it('the English-only office (admin, buyer, processor) is English under a Kannada choice (DES-118)', () => {
    for (const path of ['/admin', '/admin/', '/admin/batches/B-NOPE0000', '/admin/demo', '/buyer', '/buyer/agreements/AG-1', '/processor', '/processor/batches/B-1']) {
      expect(documentLang(path, 'kn'), path).toBe('en');
    }
  });

  it('a path that only starts with an office prefix is not the office', () => {
    for (const path of ['/adminx', '/buyers', '/processors', '/field/admin']) {
      expect(documentLang(path, 'kn'), path).toBe('kn');
    }
  });

  it('English stays English everywhere', () => {
    expect(documentLang('/field', 'en')).toBe('en');
    expect(documentLang('/verify/B-1', 'en')).toBe('en');
    expect(documentLang('/admin', 'en')).toBe('en');
  });
});
