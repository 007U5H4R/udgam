import { describe, expect, it } from 'vitest';
import { istDayTime, monthYear, telHref } from './format';

// TKT-11: the Pickings month header and the picking detail's receipt time, in IST by explicit offset
// arithmetic (never the host zone; this file runs under TZ=UTC and TZ=America/Los_Angeles).

describe('monthYear', () => {
  it('names the month of an IST month key', () => {
    expect(monthYear('2026-09')).toBe('September 2026');
    expect(monthYear('2026-10')).toBe('October 2026');
    expect(monthYear('2027-01')).toBe('January 2027');
  });

  it('has a Kannada form with the year in it', () => {
    expect(monthYear('2026-09', 'kn')).toContain('2026');
    expect(monthYear('2026-09', 'kn')).not.toBe(monthYear('2026-09'));
  });
});

describe('istDayTime', () => {
  it('shows the IST day and 24-hour time: 2026-09-30T19:00Z is Thu 1 Oct, 00:30 IST', () => {
    expect(istDayTime('2026-09-30T19:00:00.000Z')).toBe('Thu 1 Oct, 00:30');
    expect(istDayTime('2026-09-27T05:00:00.000Z')).toBe('Sun 27 Sep, 10:30');
  });
});

describe('telHref (the Help sheet\'s "Call the office", TC-053)', () => {
  it('dials digits and a leading +, and refuses anything that is not a phone number', () => {
    expect(telHref('+91 8272 000 111')).toBe('tel:+918272000111');
    expect(telHref('08272-000111')).toBe('tel:08272000111');
    expect(telHref('call us')).toBeNull();
    expect(telHref('12')).toBeNull();
  });
});
