// An override reason (technical-plan TSK-12.5, Review focus 5). The reason is public: it is anchored in
// the admin_override entry and shown on the batch's certificate, so it must say why in at least 10
// visible characters, must not carry a phone number, and must not hide or reorder text. TKT-13's issuer
// rule applies (EXE19): no control character (only a newline: the reason is a multi-line field), no
// format character (bidi controls, zero-width characters), no line or paragraph separator; NFKC form;
// lengths in code points. Pure: the decide form checks it as the admin types and the Server Action's
// service checks it again (the form is never trusted).

export const REASON_MIN = 10;
/** An upper bound, so an anchored, public statement stays a sentence or two. */
export const REASON_MAX = 1000;

export type ReasonCode = 'reason_too_short' | 'reason_too_long' | 'reason_has_phone' | 'reason_has_control';

/** A control (C0, C1; a newline aside), format (bidi, zero-width, soft hyphen …), line or paragraph separator character. */
const hasControl = (s: string) => /[\p{Cc}\p{Cf}\u2028\u2029]/u.test(s.replace(/\n/g, ''));
const FORMAT_CHARS = /\p{Cf}/gu;

const DIGIT = /\p{Nd}/u;
/**
 * Every Unicode decimal digit as its ASCII digit (Devanagari ९ → 9, Kannada ೯ → 9). Unicode assigns
 * decimal digits only in contiguous runs of ten, 0 to 9, so a digit's value is its distance from the
 * start of its run, modulo 10 (adjacent runs, like the mathematical digits, are whole sets of ten).
 */
export function asciiDigits(s: string): string {
  return s.replace(/\p{Nd}/gu, (d) => {
    const cp = d.codePointAt(0)!;
    if (cp <= 0x39) return d;
    let n = 0;
    while (n < 100 && DIGIT.test(String.fromCodePoint(cp - 1 - n))) n++;
    return String(n % 10);
  });
}

/** Ten digits in a row: any phone number, a mobile (with or without +91) or a landline with its STD code. */
const TEN_DIGITS = /\d{10}/;
/** Separators people write between a number's groups: "98450 12345", "98450-12345", "(080) 2345.6789", "98450/12345", "98450_12345". */
const GROUP_SEPARATORS = /(?<=\d)[\s./_()-]{1,3}(?=\d)/g;
/** A calendar date (day and month in range) or a clock time: their digits are not one number. */
const DAY = '(?:0?[1-9]|[12]\\d|3[01])';
const MONTH = '(?:0?[1-9]|1[0-2])';
const DATE_OR_TIME = new RegExp(
  `(?<!\\d)(?:\\d{4}[-/.]${MONTH}[-/.]${DAY}|${DAY}[-/.]${MONTH}[-/.](?:\\d{4}|\\d{2})|(?:[01]?\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?)(?!\\d)`,
  'g',
);

/**
 * Does `text` hold a phone number? In NFKC form with every script's digits read as ASCII and the
 * invisible characters taken out: ten digits in a row; or, once dates and times are set aside, ten
 * digits in groups (separated by spaces, dots, dashes, slashes, underscores or brackets). A date and time
 * ("2026-09-24 12:30") is not one.
 */
export function hasPhoneNumber(text: string): boolean {
  const plain = asciiDigits(text.normalize('NFKC')).replace(FORMAT_CHARS, '');
  if (TEN_DIGITS.test(plain)) return true;
  return TEN_DIGITS.test(plain.replace(DATE_OR_TIME, '|').replace(GROUP_SEPARATORS, ''));
}

/** The length the form counts and the server checks: code points of the trimmed NFKC form. */
export function reasonLength(raw: string): number {
  return [...raw.normalize('NFKC').trim()].length;
}

/** The trimmed NFKC reason, or why it can't be used. */
export function checkReason(raw: string): { ok: true; reason: string } | { ok: false; code: ReasonCode } {
  const reason = raw.normalize('NFKC').trim();
  if (hasControl(raw) || hasControl(reason)) return { ok: false, code: 'reason_has_control' };
  const length = [...reason].length;
  if (length < REASON_MIN) return { ok: false, code: 'reason_too_short' };
  if (length > REASON_MAX) return { ok: false, code: 'reason_too_long' };
  if (hasPhoneNumber(reason)) return { ok: false, code: 'reason_has_phone' };
  return { ok: true, reason };
}
