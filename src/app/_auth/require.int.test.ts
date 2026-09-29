// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addOrg, addUser, cookieHeader } from '../../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../../tests/helpers/db';
import { outcome } from '../../../tests/helpers/next';
import { AuthError } from '../../lib/auth/guards';
import type { Role } from '../../lib/auth/session';

// TSK-04.2: the Next adapter — pages redirect, actions and handlers throw AuthError, lookups 404.

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock('next/headers', () => ({ headers: async () => request.headers, cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

let t: TempDb;
const PASSWORD = 'guard test password';
const cookies: Partial<Record<Role, string>> = {};

beforeEach(async () => {
  t = await tempDb();
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  await addOrg(t.db, 'ORG-A', 'fpo');
  await addOrg(t.db, 'ORG-BUY', 'buyer');
  const { appAuth } = await import('./auth');
  for (const role of ['agent', 'admin', 'buyer'] as const) {
    await addUser(t.db, { id: `U-${role}`, email: `${role}@a.test`, password: PASSWORD, role, orgId: role === 'buyer' ? 'ORG-BUY' : 'ORG-A' });
    cookies[role] = cookieHeader(await appAuth().api.signInEmail({ body: { email: `${role}@a.test`, password: PASSWORD }, asResponse: true }));
  }
});
afterEach(async () => {
  (await import('../../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  request.headers = new Headers();
  await t.cleanup();
});

const as = (role: Role | null) => {
  request.headers = new Headers(role ? { cookie: cookies[role]! } : {});
};

describe('requireSession in pages and layouts', () => {
  it('signed out → redirect to /sign-in', async () => {
    const { requireSession } = await import('./require');
    as(null);
    expect(await outcome(() => requireSession('admin'))).toEqual({ redirect: '/sign-in' });
  });

  it("another role → redirect to that user's own home", async () => {
    const { requireSession } = await import('./require');
    as('buyer');
    expect(await outcome(() => requireSession('admin'))).toEqual({ redirect: '/buyer' });
    as('agent');
    expect(await outcome(() => requireSession('buyer'))).toEqual({ redirect: '/field' });
  });

  it('the owning role gets its user and org from the session', async () => {
    const { requireSession } = await import('./require');
    as('admin');
    expect(await requireSession('admin')).toEqual({ userId: 'U-admin', orgId: 'ORG-A', role: 'admin' });
  });
});

describe('requireSession in Server Actions and route handlers', () => {
  it('actions: 401 signed out, 403 wrong role', async () => {
    const { requireSession } = await import('./require');
    as(null);
    await expect(requireSession('admin', { action: true })).rejects.toEqual(new AuthError(401));
    as('agent');
    await expect(requireSession('admin', { action: true })).rejects.toMatchObject({ status: 403 });
  });

  it('handlers read the cookies of the request they are given', async () => {
    const { requireSession } = await import('./require');
    as('admin'); // next/headers says admin; the request is what counts
    const req = new Request('http://localhost/api/x', { headers: { cookie: cookies.agent! } });
    expect(await requireSession('agent', { request: req })).toMatchObject({ userId: 'U-agent', orgId: 'ORG-A' });
    await expect(requireSession('agent', { request: new Request('http://localhost/api/x') })).rejects.toMatchObject({ status: 401 });
  });

  it('a user row with a tampered role fails closed (treated as signed out)', async () => {
    await t.client.execute("PRAGMA ignore_check_constraints = ON");
    await t.client.execute("UPDATE user SET role = 'root' WHERE id = 'U-admin'");
    const { requireSession } = await import('./require');
    as('admin');
    expect(await outcome(() => requireSession('admin'))).toEqual({ redirect: '/sign-in' });
  });
});

describe('scopedById', () => {
  it('returns a found row and 404s on a missing one', async () => {
    const { scopedById } = await import('./require');
    expect(scopedById({ id: 'x' })).toEqual({ id: 'x' });
    expect(await outcome(() => scopedById(undefined))).toEqual({ notFound: true });
    expect(await outcome(() => scopedById(null))).toEqual({ notFound: true });
  });
});
