import { describe, expect, it } from 'vitest';
import { asciiDigits, checkReason, hasPhoneNumber, reasonLength } from './reason';

// TSK-12.5 / TC-055 / Review focus 5: an override reason is public, so it needs 10 visible characters
// (code points) after trimming, may not carry a phone number (an Indian mobile, 10 digits in a row, or
// a number in groups, in any script's digits), and may not hide or reorder text (TKT-13's issuer rule,
// EXE19: no control, format, line- or paragraph-separator character; only a newline is allowed).

describe('checkReason', () => {
  it('trims, and needs at least 10 characters', () => {
    expect(checkReason('   123456789   ')).toEqual({ ok: false, code: 'reason_too_short' });
    expect(checkReason('  Scale ok  ')).toEqual({ ok: false, code: 'reason_too_short' });
    expect(checkReason('  1234567 89 ')).toEqual({ ok: true, reason: '1234567 89' });
    expect(checkReason('x'.repeat(1001))).toEqual({ ok: false, code: 'reason_too_long' });
  });

  it('counts code points, not UTF-16 units: 9 emoji are too short, 1000 are not too long', () => {
    expect(reasonLength('🌱🌱🌱🌱🌱🌱🌱🌱🌱')).toBe(9);
    expect(checkReason('🌱🌱🌱🌱🌱🌱🌱🌱🌱')).toEqual({ ok: false, code: 'reason_too_short' });
    expect(checkReason('🌱'.repeat(10))).toEqual({ ok: true, reason: '🌱'.repeat(10) });
    expect(checkReason('🌱'.repeat(1000))).toEqual({ ok: true, reason: '🌱'.repeat(1000) });
    expect(checkReason('🌱'.repeat(1001))).toEqual({ ok: false, code: 'reason_too_long' });
    expect(reasonLength('  ab  ')).toBe(2);
  });

  it('refuses invisible and control characters: 12 zero-width spaces, a bidi override, NUL, separators', () => {
    expect(checkReason('\u200B'.repeat(12))).toEqual({ ok: false, code: 'reason_has_control' });
    expect(checkReason('Checked in person \u202Eenoz\u202C')).toEqual({ ok: false, code: 'reason_has_control' });
    expect(checkReason('Checked in\u0000 person')).toEqual({ ok: false, code: 'reason_has_control' });
    for (const ch of ['\u200C', '\u200D', '\u200E', '\u2066', '\u2060', '\uFEFF', '\u00AD', '\u2028', '\u2029', '\r', '\t', '\u0085', '\u007F']) {
      expect(checkReason(`Checked in${ch} person`), ch.codePointAt(0)!.toString(16)).toEqual({ ok: false, code: 'reason_has_control' });
    }
  });

  it('allows a newline (the reason is a multi-line field)', () => {
    expect(checkReason('Scale photo retaken.\nChecked in person.')).toEqual({ ok: true, reason: 'Scale photo retaken.\nChecked in person.' });
  });

  it('normalises to NFKC: full-width letters become ASCII', () => {
    expect(checkReason('Ｓｃａｌｅ checked ok')).toEqual({ ok: true, reason: 'Scale checked ok' });
  });

  it('accepts a normal Kannada or English reason', () => {
    const kn = 'ತೂಕದ ಫೋಟೋವನ್ನು ಕಚೇರಿಯಲ್ಲಿ ಪರಿಶೀಲಿಸಲಾಗಿದೆ';
    expect(checkReason(kn)).toEqual({ ok: true, reason: kn });
    expect(checkReason('Scale photo checked by the office in person')).toEqual({ ok: true, reason: 'Scale photo checked by the office in person' });
  });

  it('refuses phone numbers written in the usual ways', () => {
    for (const r of ['call 9845012345 please', '+919845012345 called', '+91 9845012345 called', '+91-98450 12345 called', 'number 98450 12345 confirmed', 'on 98450-12345 today', 'id 1234567890 here']) {
      expect(hasPhoneNumber(r), r).toBe(true);
      expect(checkReason(r)).toEqual({ ok: false, code: 'reason_has_phone' });
    }
  });

  it('refuses a phone number in other digits or with other separators', () => {
    expect(checkReason('call 98450\u200B12345 please')).toEqual({ ok: false, code: 'reason_has_control' }); // zero-width: refused outright
    expect(hasPhoneNumber('call 98450\u200B12345 please')).toBe(true);
    for (const r of [
      'call ９８４５０１２３４５ please', // full-width
      'call ९८४५०१२३४५ please', // Devanagari
      'call ೯೮೪೫೦೧೨೩೪೫ please', // Kannada
      'call 98450/12345 please',
      'call 98450_12345 please',
      'call 98450.12345 please',
      'call 98 450 123 45 please',
      'landline 080 2345 6789 office',
      'call (080) 2345-6789 office',
    ]) {
      expect(hasPhoneNumber(r), r).toBe(true);
      expect(checkReason(r), r).toEqual({ ok: false, code: 'reason_has_phone' });
    }
  });

  it('accepts dates, times, weights and short numbers', () => {
    for (const r of [
      'Scale photo retaken on 2026-09-24 12:30',
      'Scale photo retaken on 24/09/2026 12:30',
      'Retaken 24.09.2026 at 12:30:15 by the office',
      'Two baskets of 20.5 kg and 18 kg',
      'Plot PL-7K2M9Q4D checked in person',
      'Cloud over Kodagu since 28 Aug',
    ]) {
      expect(hasPhoneNumber(r), r).toBe(false);
      expect(checkReason(r)).toEqual({ ok: true, reason: r });
    }
  });
});

describe('asciiDigits', () => {
  it('maps every Unicode decimal digit to its ASCII digit', () => {
    expect(asciiDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789'); // Arabic-Indic
    expect(asciiDigits('०१२३४५६७८९')).toBe('0123456789'); // Devanagari
    expect(asciiDigits('೦೧೨೩೪೫೬೭೮೯')).toBe('0123456789'); // Kannada
    expect(asciiDigits('𝟎𝟗𝟘𝟡𝟢𝟫')).toBe('090909'); // mathematical digits (adjacent sets of ten)
    expect(asciiDigits('a1b')).toBe('a1b');
  });
});
