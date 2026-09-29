// An override reason (technical-plan TSK-12.5, Review focus 5). The reason is public: it is anchored in
// the admin_override entry and shown on the batch's certificate, so it must say why in at least 10
// characters and must not carry a phone number. Pure: the decide form checks it as the admin types and
// the server checks it again (the form is never trusted).

export const REASON_MIN = 10;
/** An upper bound, so an anchored, public statement stays a sentence or two. */
export const REASON_MAX = 1000;

/** An Indian mobile number (optionally +91), or any 10 digits in a row (TSK-12.5). */
const PHONE = /(\+?91[\s-]?)?[6-9]\d{9}\b/;
const TEN_DIGITS = /\d{10}/;

export type ReasonCode = 'reason_too_short' | 'reason_too_long' | 'reason_has_phone';

/**
 * Does `text` hold a phone number? As typed: a mobile number or any 10 digits in a row. With the
 * separators between digits taken out, a mobile number written in groups too ("98450 12345",
 * "+91 98450-12345"); only the mobile pattern there, so a date and time ("2026-09-24 12:30") is not one.
 */
export function hasPhoneNumber(text: string): boolean {
  const joined = text.replace(/(?<=\d)[\s.()-]+(?=\d)/g, '');
  return PHONE.test(text) || TEN_DIGITS.test(text) || PHONE.test(joined);
}

/** The trimmed reason, or why it can't be used. */
export function checkReason(raw: string): { ok: true; reason: string } | { ok: false; code: ReasonCode } {
  const reason = raw.trim();
  if (reason.length < REASON_MIN) return { ok: false, code: 'reason_too_short' };
  if (reason.length > REASON_MAX) return { ok: false, code: 'reason_too_long' };
  if (hasPhoneNumber(reason)) return { ok: false, code: 'reason_has_phone' };
  return { ok: true, reason };
}
