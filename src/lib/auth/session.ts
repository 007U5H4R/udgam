// Session shape and roles (technical-plan §10). The org always comes from the signed-in user's row,
// never from input (EVAL-080, CF-10).

export const ROLES = ['agent', 'admin', 'buyer', 'processor'] as const;
export type Role = (typeof ROLES)[number];

/** What a guard hands to a page, action or handler. */
export type SessionUser = { userId: string; orgId: string; role: Role };

/** Each role's home (TC-020). */
export const HOME: Record<Role, string> = { agent: '/field', admin: '/admin', buyer: '/buyer', processor: '/processor' };

export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);

/** The minimal slice of Better Auth's API the session reader needs. */
export type SessionSource = {
  api: {
    getSession(ctx: { headers: Headers }): Promise<{ user: { id: string; role?: unknown; orgId?: unknown } } | null>;
  };
};

/**
 * The signed-in user for these request headers, or null. Fails closed: a user whose role or org is
 * missing or unknown is treated as signed out.
 */
export async function readSession(auth: SessionSource, headers: Headers): Promise<SessionUser | null> {
  const s = await auth.api.getSession({ headers });
  if (!s) return null;
  const { id, role, orgId } = s.user;
  if (!isRole(role) || typeof orgId !== 'string' || orgId === '') return null;
  return { userId: id, orgId, role };
}
