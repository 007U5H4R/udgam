// The enrolment code's shape (technical-plan §10). Pure, so the phone's /enrol screen and the server
// share it: 6 characters from a 31-symbol alphabet without 0/O or 1/I/L.

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 6;

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** The code as typed, upper-cased and without spaces or dashes, or null when it cannot be a code. */
export function normaliseCode(input: string): string | null {
  const c = input.replace(/[\s-]+/g, '').toUpperCase();
  return CODE_RE.test(c) ? c : null;
}
