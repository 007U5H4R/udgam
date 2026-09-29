import { APIError } from 'better-auth/api';

// How the sign-in action answers a refusal from Better Auth (TC-020). A credential failure gets the one
// "Email or password is not right" message, whatever the cause, so the form never says which field was
// wrong. Anything else Better Auth refuses with (5xx, rate limit, origin, a session it could not create)
// is not the user's fault: it gets a generic "try again" message and is logged.

export type SignInFailure = 'credentials' | 'unavailable';

/** Codes that mean the email or password was wrong or malformed. */
const CREDENTIAL_CODES = new Set(['INVALID_EMAIL_OR_PASSWORD', 'INVALID_EMAIL', 'INVALID_PASSWORD']);
/** 401 codes that Better Auth uses for a server-side failure, not for wrong credentials. */
const SERVER_401_CODES = new Set(['FAILED_TO_CREATE_SESSION']);

/** The status and code of a Better Auth refusal (safe to log: no email, no password). */
export function refusalInfo(err: APIError): { status: number; code: string | undefined } {
  const code = (err.body as { code?: unknown } | undefined)?.code;
  return { status: err.statusCode, code: typeof code === 'string' ? code : undefined };
}

/** What a sign-in error means for the form, or null when it is not a Better Auth refusal (rethrow it). */
export function signInFailure(err: unknown): SignInFailure | null {
  if (!(err instanceof APIError)) return null;
  const { status, code } = refusalInfo(err);
  if (code !== undefined && CREDENTIAL_CODES.has(code)) return 'credentials';
  if (status === 401 && (code === undefined || !SERVER_401_CODES.has(code))) return 'credentials';
  return 'unavailable';
}
