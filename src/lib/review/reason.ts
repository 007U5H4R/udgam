// An override reason (technical-plan TSK-12.5, Review focus 5). The reason is public: it is anchored in
// the admin_override entry and shown on the batch's certificate, so it must say why in at least 10
// visible characters, must not carry a phone number, and must not hide or reorder text (TKT-12 r2: blank-
// rendering characters are hidden too; a joiner is allowed inside a Kannada word). TKT-13's issuer
// rule applies (EXE19): no control character (only a newline: the reason is a multi-line field), no
// format character (bidi controls, zero-width characters), no line or paragraph separator; NFKC form;
// lengths in code points. Pure: the decide form checks it as the admin types and the Server Action's
// service checks it again (the form is never trusted).

export const REASON_MIN = 10;
/** An upper bound, so an anchored, public statement stays a sentence or two. */
export const REASON_MAX = 1000;

export type ReasonCode = 'reason_too_short' | 'reason_too_long' | 'reason_has_phone' | 'reason_has_control';

/**
 * Characters that render as blank space although Unicode does not class them as format characters: the
 * braille blank, the Hangul fillers (TKT-12 r2 N2). A reason made of them is invisible on the certificate.
 */
const BLANKS = '\u2800\u3164\u115F\u1160\uFFA0';
/**
 * ZWJ and ZWNJ between two Kannada characters (the arkavattu ರ‍್, explicit half-forms) are spelling, not
 * hiding (TKT-12 r2 N5); anywhere else they are invisible format characters like the rest.
 */
const KANNADA_JOINER = /(?<=[\u0C80-\u0CFF])[\u200C\u200D](?=[\u0C80-\u0CFF])/gu;
/**
 * A control (C0, C1; a newline aside), format (bidi, zero-width, soft hyphen, tag …), line or paragraph
 * separator character, or a blank-rendering one; a joiner inside a Kannada run is allowed.
 */
const hasControl = (s: string) => new RegExp(`[\\p{Cc}\\p{Cf}\\u2028\\u2029${BLANKS}]`, 'u').test(s.replace(/\n/g, '').replace(KANNADA_JOINER, ''));
const FORMAT_CHARS = /\p{Cf}/gu;

/**
 * The visible characters: letters, digits, punctuation, symbols and spaces (not the blanks), each with at most
 * two combining marks on it, so a vowel sign and a virama count with their Kannada letter but marks
 * piled on one letter, or marks alone, do not make a reason long enough (TKT-12 r2 N2).
 */
export function visibleLength(text: string): number {
  let n = 0;
  let marks = -1; // marks counted on the current base; -1 = no base yet
  for (const ch of text) {
    if (/\p{M}/u.test(ch)) {
      if (marks >= 0 && marks < 2) {
        n++;
        marks++;
      }
    } else if (/[\p{L}\p{N}\p{P}\p{S}]/u.test(ch) && !BLANKS.includes(ch)) {
      n++;
      marks = 0;
    } else {
      if (/\s/u.test(ch) && !BLANKS.includes(ch)) n++; // a space between words is part of the sentence
      marks = -1;
    }
  }
  return n;
}

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
/**
 * Digit groups as people write a number: groups of 1–5 digits joined by 1–3 characters that are neither
 * letters, digits nor a newline ("98450 12345", "98450-12345", "(080) 2345.6789", "98450,12345",
 * "98450–12345", "98450:12345", "98450·12345").
 */
const GROUP_RUN = /\d{1,5}(?:[^\p{L}\p{N}\n|]{1,3}\d{1,5})+/gu;
const GROUP = /\d+/g;
/**
 * The shapes of an Indian phone number, digits only: a mobile (10 digits from 6–9, optionally after 91 or
 * 0), or a landline (0, an STD code and the number: 11 digits, optionally after 91).
 */
const PHONE_SHAPE = /^(?:(?:91|0)?[6-9]\d{9}|(?:91)?0\d{10})$/;
/**
 * Numbers that are not phone digits, so they never join a group (TKT-12 r2 N1): a decimal with at most
 * three digits before its point ("102.5", "12.337512") and a year ("2024").
 */
const DECIMAL_OR_YEAR = /(?<![\d.])(?:\d{1,3}\.\d+|(?:19|20)\d{2})(?![\d.])/g;
/** A calendar date (day and month in range) or a clock time: their digits are not one number. */
const DAY = '(?:0?[1-9]|[12]\\d|3[01])';
const MONTH = '(?:0?[1-9]|1[0-2])';
const DATE_OR_TIME = new RegExp(
  `(?<!\\d)(?:\\d{4}[-/.]${MONTH}[-/.]${DAY}|${DAY}[-/.]${MONTH}[-/.](?:\\d{4}|\\d{2})|(?:[01]?\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?)(?!\\d)`,
  'g',
);

/** Do some consecutive groups of a run, joined, have a phone number's shape? */
function phoneInRun(run: string): boolean {
  const groups = run.match(GROUP) ?? [];
  for (let i = 0; i < groups.length; i++) {
    let joined = '';
    for (let j = i; j < groups.length && joined.length < 13; j++) {
      joined += groups[j];
      if (j > i && PHONE_SHAPE.test(joined)) return true;
    }
  }
  return false;
}

/**
 * Does `text` hold a phone number? In NFKC form with every script's digits read as ASCII and the
 * invisible characters taken out: ten digits in a row; or, once dates, times, short decimals and years
 * are set aside, digit groups that join into a phone number's shape (a mobile, or a landline with its
 * STD code). A date and time ("2026-09-24 12:30"), a list of weights or years, or a GPS fix is not one.
 */
export function hasPhoneNumber(text: string): boolean {
  const plain = asciiDigits(text.normalize('NFKC')).replace(FORMAT_CHARS, '');
  if (TEN_DIGITS.test(plain)) return true;
  const rest = plain.replace(DATE_OR_TIME, '|').replace(DECIMAL_OR_YEAR, '|');
  return (rest.match(GROUP_RUN) ?? []).some(phoneInRun);
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
  if (length < REASON_MIN || visibleLength(reason) < REASON_MIN) return { ok: false, code: 'reason_too_short' };
  if (length > REASON_MAX) return { ok: false, code: 'reason_too_long' };
  if (hasPhoneNumber(reason)) return { ok: false, code: 'reason_has_phone' };
  return { ok: true, reason };
}
