import { describe, expect, it } from 'vitest';
import { checkReason, hasPhoneNumber } from './reason';

// TSK-12.5 / TC-055 / Review focus 5: an override reason is public, so it needs 10 characters after
// trimming and may not carry a phone number (an Indian mobile, 10 digits in a row, or a mobile in groups).

describe('checkReason', () => {
  it('trims, and needs at least 10 characters', () => {
    expect(checkReason('   123456789   ')).toEqual({ ok: false, code: 'reason_too_short' });
    expect(checkReason('  Scale ok  ')).toEqual({ ok: false, code: 'reason_too_short' });
    expect(checkReason('  1234567 89 ')).toEqual({ ok: true, reason: '1234567 89' });
    expect(checkReason('x'.repeat(1001))).toEqual({ ok: false, code: 'reason_too_long' });
  });

  it('refuses phone numbers written in the usual ways', () => {
    for (const r of ['call 9845012345 please', '+919845012345 called', '+91 9845012345 called', '+91-98450 12345 called', 'number 98450 12345 confirmed', 'on 98450-12345 today', 'id 1234567890 here']) {
      expect(hasPhoneNumber(r), r).toBe(true);
      expect(checkReason(r)).toEqual({ ok: false, code: 'reason_has_phone' });
    }
  });

  it('accepts dates, times, weights and short numbers', () => {
    for (const r of ['Scale photo retaken on 2026-09-24 12:30', 'Two baskets of 20.5 kg and 18 kg', 'Plot PL-7K2M9Q4D checked in person', 'Cloud over Kodagu since 28 Aug']) {
      expect(hasPhoneNumber(r), r).toBe(false);
      expect(checkReason(r)).toEqual({ ok: true, reason: r });
    }
  });
});
