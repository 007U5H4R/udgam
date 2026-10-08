import type { Role, SessionUser } from './session';

// Authorisation (technical-plan §10, TC-018). Pure: the Next adapter (src/app/_auth/require.ts) turns
// the result into a redirect, a 404 or a 401/403 JSON answer. This, called on the server in every
// layout, Server Action and route handler, is the security boundary; the proxy only redirects.

export type Authorized = { ok: true } & SessionUser;
export type Denied = { ok: false; code: 401 | 403 };

/** 401 when signed out, 403 when signed in with another role, else the session's user and org. */
export function authorize(session: SessionUser | null, role: Role): Authorized | Denied {
  if (!session) return { ok: false, code: 401 };
  if (session.role !== role) return { ok: false, code: 403 };
  return { ok: true, userId: session.userId, orgId: session.orgId, role: session.role };
}

/** Thrown by guards in Server Actions and route handlers; handlers map it with `authErrorResponse`. */
export class AuthError extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? 'unauthenticated' : 'forbidden');
    this.name = 'AuthError';
  }
}

/** The JSON answer for an AuthError (no detail beyond the status: nothing about other orgs or roles). */
export function authErrorResponse(err: AuthError): Response {
  return Response.json(
    { error: err.status === 401 ? 'unauthenticated' : 'forbidden' },
    { status: err.status, headers: { 'Cache-Control': 'no-store' } },
  );
}
