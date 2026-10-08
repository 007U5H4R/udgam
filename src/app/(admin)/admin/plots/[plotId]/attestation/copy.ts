// Words for the attestation form (TKT-13). English only, like the other admin plot screens (N5). Every
// refusal names the problem and what to do (Design.md §18). None of it claims Udgam checked that a plot is organic:
// the certificate is an issuer's statement that Udgam keeps unchanged on record (DISC4).

export type AttestationReason =
  | 'not_pdf'
  | 'too_large'
  | 'bad_dates'
  | 'issuer_required'
  | 'issuer_invalid'
  | 'issuer_too_long'
  | 'plot_not_found'
  | 'invalid_input'
  | 'no_file'
  | 'not_allowed';

export const REASON_TEXT: Record<AttestationReason, string> = {
  not_pdf: 'That file is not a PDF. Choose the certificate as a PDF file.',
  too_large: 'The file is larger than 10 MB. Choose a smaller PDF.',
  bad_dates: 'Check the dates: each must be a real date from 2000 on and no more than 10 years ahead, and “Valid until” cannot be before “Valid from”.',
  issuer_required: 'Enter the name of the body that issued the certificate.',
  issuer_invalid: 'Enter only the issuer’s name, in plain text: no hidden characters, and no wording about verification.',
  issuer_too_long: 'The issuer’s name is longer than 120 characters. Use a shorter name.',
  plot_not_found: 'That plot was not found.',
  invalid_input: 'Fill in the issuer, both dates and the certificate file.',
  no_file: 'Choose the certificate PDF.',
  not_allowed: 'This request was not accepted. Reload the page and try again.',
};

export const STATUS_OF: Record<AttestationReason, number> = {
  not_pdf: 422,
  too_large: 413,
  bad_dates: 422,
  issuer_required: 422,
  issuer_invalid: 422,
  issuer_too_long: 422,
  plot_not_found: 404,
  invalid_input: 400,
  no_file: 400,
  not_allowed: 403,
};

export type AttestationResult = { ok: true; id: string } | { ok: false; reason: AttestationReason };

/** Shown when the session has expired (the route answers 401). */
const SIGNED_OUT_TEXT = 'Your session has ended. Sign in again, then attach the certificate.';
/** Shown for a 5xx, or for any answer that is not the route's own JSON (a front proxy's HTML page). */
const SERVER_TEXT = 'The server could not store the certificate. Try again in a moment.';

export type AttachOutcome = { ok: true; id: string } | { ok: false; message: string };

const isReason = (r: unknown): r is AttestationReason => typeof r === 'string' && Object.hasOwn(REASON_TEXT, r);

/**
 * What the form shows for the route's answer: the HTTP status decides first (401 sign in again, 413 too
 * large, 5xx try again), then the reason in the JSON body. `body` is the parsed JSON, or null when the
 * body was not JSON.
 */
export function outcomeOf(status: number, body: unknown): AttachOutcome {
  if (status === 401) return { ok: false, message: SIGNED_OUT_TEXT };
  if (status === 413) return { ok: false, message: REASON_TEXT.too_large };
  if (status >= 500 || body === null || typeof body !== 'object') return { ok: false, message: SERVER_TEXT };
  const b = body as { ok?: unknown; id?: unknown; reason?: unknown };
  if (status >= 200 && status < 300) {
    return b.ok === true && typeof b.id === 'string' ? { ok: true, id: b.id } : { ok: false, message: SERVER_TEXT };
  }
  if (isReason(b.reason)) return { ok: false, message: REASON_TEXT[b.reason] };
  if (status === 403) return { ok: false, message: REASON_TEXT.not_allowed };
  return { ok: false, message: REASON_TEXT.invalid_input };
}
