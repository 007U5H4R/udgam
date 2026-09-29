// Words for the attestation form (TKT-13). English only, like the other admin plot screens (N5). Every
// refusal names the problem and what to do (Design.md §18). None of it claims Udgam checked that a plot is organic:
// the certificate is an issuer's statement that Udgam keeps unchanged on record (DISC4).

export type AttestationReason =
  | 'not_pdf'
  | 'too_large'
  | 'bad_dates'
  | 'issuer_required'
  | 'issuer_too_long'
  | 'plot_not_found'
  | 'invalid_input'
  | 'no_file'
  | 'not_allowed';

export const REASON_TEXT: Record<AttestationReason, string> = {
  not_pdf: 'That file is not a PDF. Choose the certificate as a PDF file.',
  too_large: 'The file is larger than 10 MB. Choose a smaller PDF.',
  bad_dates: 'Check the dates: each must be a real date, and “Valid until” cannot be before “Valid from”.',
  issuer_required: 'Enter the name of the body that issued the certificate.',
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
  issuer_too_long: 422,
  plot_not_found: 404,
  invalid_input: 400,
  no_file: 400,
  not_allowed: 403,
};

export type AttestationResult = { ok: true; id: string } | { ok: false; reason: AttestationReason };
