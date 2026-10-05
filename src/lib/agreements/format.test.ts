import { describe, expect, it } from 'vitest';
import { agreementIdFromPath, amountHint, deadlineHint, deadlineIso, dmy, FIELD_MESSAGES, formatInr, formatKg1, istDate, istDateTime12, kgToGrams, parseAmount, parseDeadline, parseKg } from './format';
import { checkGrade, checkNewAgreement } from './form';
import { gradeDisplay, isGrade, parseGrade } from './grades';

// Design.md §28.3 (grades) and §28.7 (money, input formats, field checks): literal expected values.

describe('grades (§28.3)', () => {
  it('only the five numbers are grades; display is "label · number"', () => {
    for (const g of [90, 80, 70, 60, 40]) expect(isGrade(g)).toBe(true);
    for (const g of [100, 85, 0, 255, -1, 80.5]) expect(isGrade(g)).toBe(false);
    expect(parseGrade('80')).toBe(80);
    expect(parseGrade('255')).toBeNull();
    expect(parseGrade('')).toBeNull();
    expect(gradeDisplay(80)).toBe('Very good · 80');
    expect(gradeDisplay(70)).toBe('Good · 70');
  });
});

describe('money and quantities (§28.7)', () => {
  it('formats mock INR with Indian grouping and paise', () => {
    expect(formatInr(15_000_000)).toBe('₹1,50,000.00');
    expect(formatInr(24_000_000)).toBe('₹2,40,000.00');
    expect(formatInr(5)).toBe('₹0.05');
    expect(formatInr(BigInt(100_000_000))).toBe('₹10,00,000.00');
    expect(formatKg1(600)).toBe('600.0');
    expect(formatKg1(1200)).toBe('1,200.0');
    expect(formatKg1(598.5)).toBe('598.5');
  });

  it('reads amounts as typed: digits, commas anywhere, up to two paise digits', () => {
    expect(parseAmount('150000')).toEqual({ ok: true, value: 15_000_000 });
    expect(parseAmount('1,50,000')).toEqual({ ok: true, value: 15_000_000 });
    expect(parseAmount('150000.5')).toEqual({ ok: true, value: 15_000_050 });
    expect(parseAmount('1,50,000.50')).toEqual({ ok: true, value: 15_000_050 });
    expect(parseAmount('')).toEqual({ ok: false, message: FIELD_MESSAGES.amountNeeded });
    expect(parseAmount('1,50,000.505')).toEqual({ ok: false, message: 'Paise take two digits at most, for example 150000.50.' });
    expect(parseAmount('0')).toEqual({ ok: false, message: FIELD_MESSAGES.amountDigits });
    expect(parseAmount('₹100')).toEqual({ ok: false, message: FIELD_MESSAGES.amountDigits });
    expect(amountHint('150000')).toBe('Reads as ₹1,50,000.00 (mock INR). No real money moves.');
    expect(amountHint('x')).toBe('Mock INR for the demo. No real money moves.');
  });

  it('reads kilograms with at most one decimal; grams are exact', () => {
    expect(parseKg('600.0')).toEqual({ ok: true, value: 600 });
    expect(parseKg('598.5')).toEqual({ ok: true, value: 598.5 });
    expect(parseKg('')).toEqual({ ok: false, message: 'Enter the agreed quantity in kg, for example 600.0.' });
    expect(parseKg('600.55')).toEqual({ ok: false, message: 'Use one decimal place at most, for example 600.5.' });
    expect(parseKg('0')).toEqual({ ok: false, message: 'Enter a quantity above 0 kg in digits, for example 600.0.' });
    expect(parseKg('six')).toEqual({ ok: false, message: FIELD_MESSAGES.kgDigits });
    expect(kgToGrams(598.5)).toBe(BigInt(598_500));
    expect(kgToGrams(0.1)).toBe(BigInt(100));
  });
});

describe('dates in IST (§28.7)', () => {
  it('the deadline is the end of the chosen day in IST', () => {
    expect(deadlineIso('2026-12-31')).toBe('2026-12-31T18:29:59.999Z');
    expect(istDate('2026-12-31T18:29:59.999Z')).toBe('31 Dec 2026');
    expect(dmy('2026-12-31')).toBe('31 Dec 2026');
    expect(istDateTime12('2026-09-30T10:42:00.000Z')).toBe('30 Sep 2026, 4:12 pm');
    expect(deadlineHint('2026-12-31')).toBe('Open until 31 Dec 2026, end of the day (IST). If nothing has settled by then, you can take the money back.');
  });

  it('a deadline must be after today in IST (19:00 UTC on 30 Sep is already 1 Oct in IST)', () => {
    const now = new Date('2026-09-30T19:00:00.000Z');
    expect(parseDeadline('2026-10-01', now)).toEqual({ ok: false, message: 'Choose a date after today.' });
    expect(parseDeadline('2026-10-02', now)).toEqual({ ok: true, value: '2026-10-02' });
    expect(parseDeadline('', now)).toEqual({ ok: false, message: 'Choose the last day for delivery.' });
    expect(parseDeadline('2026-02-30', now)).toEqual({ ok: false, message: FIELD_MESSAGES.deadlineNeeded });
  });
});

describe('form checks (§28.7)', () => {
  const now = new Date('2026-10-01T06:00:00.000Z');
  it('the mockup field-check example names every field that needs a change, keeping nothing silent', () => {
    const r = checkNewAgreement({ fpo: 'ORG-FPO', crop: 'arabica', kg: '', minGrade: '', amount: '1,50,000.505', deadline: '2026-09-30' }, ['ORG-FPO'], now);
    expect(r).toEqual({
      ok: false,
      errors: {
        kg: 'Enter the agreed quantity in kg, for example 600.0.',
        minGrade: 'Choose the lowest grade you accept.',
        amount: 'Paise take two digits at most, for example 150000.50.',
        deadline: 'Choose a date after today.',
      },
    });
  });

  it('accepts a complete form', () => {
    expect(checkNewAgreement({ fpo: 'ORG-FPO', crop: 'robusta', kg: '1200.0', minGrade: '60', amount: '240000', deadline: '2027-02-15' }, ['ORG-FPO'], now)).toEqual({
      ok: true,
      values: { fpoOrg: 'ORG-FPO', crop: 'robusta', agreedKg: 1200, minGrade: 60, amountPaise: 24_000_000, deadlineDate: '2027-02-15' },
    });
    expect(checkNewAgreement({ fpo: 'ORG-OTHER', crop: 'tea', kg: '1', minGrade: '60', amount: '1', deadline: '2027-02-15' }, ['ORG-FPO'], now)).toMatchObject({
      ok: false,
      errors: { fpo: FIELD_MESSAGES.fpoNeeded, crop: FIELD_MESSAGES.cropNeeded },
    });
  });

  it('a grade must be one of the five', () => {
    expect(checkGrade('')).toEqual({ ok: false, errors: { grade: 'Choose one of the five grades.' } });
    expect(checkGrade('255')).toEqual({ ok: false, errors: { grade: 'Choose one of the five grades.' } });
    expect(checkGrade('90')).toEqual({ ok: true, values: 90 });
  });
});

describe('the not-found title names the agreement (spec review minor 2, §28.6)', () => {
  it('reads an agreement id from the path; anything else is not echoed', () => {
    expect(agreementIdFromPath('/buyer/agreements/AG-0009ABCD')).toBe('AG-0009ABCD');
    expect(agreementIdFromPath('/admin/agreements/AG-NOSUCH00')).toBe('AG-NOSUCH00');
    expect(agreementIdFromPath('/buyer/agreements/AG-0009ABCD/')).toBe('AG-0009ABCD');
    for (const p of ['/buyer/agreements/<script>', '/buyer/agreements/ag-0009abcd', '/buyer/agreements/AG-0009ABCDE', '/buyer/agreements', null]) expect(agreementIdFromPath(p)).toBeNull();
  });
});
