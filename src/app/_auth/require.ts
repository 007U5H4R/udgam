import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { AuthError, authorize } from '../../lib/auth/guards';
import { HOME, readSession, type Role, type SessionUser } from '../../lib/auth/session';
import { appAuth } from './auth';

// The Next adapter for the guards (technical-plan §10, TSK-04.2). Call `requireSession(role)` first in
// every (agent)/(admin)/(buyer) layout, every Server Action and every non-public route handler
// (tests/guard-coverage.test.ts enforces the last two). Everything org-scoped takes `orgId` from its
// result, never from input.

export type Guarded = SessionUser;

type Mode =
  /** Layouts and pages: signed out → /sign-in; another role → that role's own home (TC-018). */
  | { page: true }
  /** Server Actions: throws AuthError(401|403). */
  | { action: true }
  /** Route handlers: reads the request's cookies; throws AuthError(401|403) (map with authErrorResponse). */
  | { request: Request };

export async function requireSession(role: Role, mode: Mode = { page: true }): Promise<Guarded> {
  // headers() first: during a build it marks the route dynamic before anything reads env or the database.
  const source = 'request' in mode ? mode.request.headers : await headers();
  const session = await readSession(appAuth(), source);
  const r = authorize(session, role);
  if (r.ok) return { userId: r.userId, orgId: r.orgId, role: r.role };
  if ('page' in mode) {
    // Signed in on another role's surface: send them to their own home (TC-018: "others redirect").
    redirect(session ? HOME[session.role] : '/sign-in');
  }
  throw new AuthError(r.code);
}

/** The signed-in user, or null (for the public sign-in page and the role redirect at `/`). */
export async function currentUser(): Promise<SessionUser | null> {
  const source = await headers();
  return readSession(appAuth(), source);
}

/**
 * An org-scoped lookup's row, or a 404. Use with a query filtered by both the ID and the session's org
 * (`where(and(eq(t.id, id), eq(t.orgId, orgId)))`): another org's ID is indistinguishable from an
 * unknown one (EVAL-080, CF-10).
 */
export function scopedById<T>(row: T | undefined | null): T {
  if (row === undefined || row === null) notFound();
  return row;
}
