import { describe, expect, it } from 'vitest';
import { authorize, AuthError, authErrorResponse } from './guards';
import type { Role, SessionUser } from './session';

// TC-018 (unit part): the 4 × 3 matrix of who is signed in × which role a surface needs.

const as = (role: Role): SessionUser => ({ userId: `U-${role}`, orgId: `ORG-${role}`, role });
const WHO: [string, SessionUser | null][] = [
  ['none', null],
  ['agent', as('agent')],
  ['admin', as('admin')],
  ['buyer', as('buyer')],
];
const EXPECTED: Record<string, Record<Role, true | 401 | 403>> = {
  none: { agent: 401, admin: 401, buyer: 401 },
  agent: { agent: true, admin: 403, buyer: 403 },
  admin: { agent: 403, admin: true, buyer: 403 },
  buyer: { agent: 403, admin: 403, buyer: true },
};

describe('authorize (TC-018)', () => {
  for (const [who, session] of WHO) {
    for (const need of ['agent', 'admin', 'buyer'] as const) {
      const want = EXPECTED[who]![need];
      it(`${who} → ${need} surface: ${want === true ? 'allowed' : want}`, () => {
        const r = authorize(session, need);
        if (want === true) expect(r).toEqual({ ok: true, userId: `U-${need}`, orgId: `ORG-${need}`, role: need });
        else expect(r).toEqual({ ok: false, code: want });
      });
    }
  }

  it('takes the org from the session, never from anywhere else', () => {
    const r = authorize({ userId: 'U-1', orgId: 'ORG-A', role: 'admin' }, 'admin');
    expect(r.ok && r.orgId).toBe('ORG-A');
  });
});

describe('AuthError', () => {
  it('maps to a bare 401 or 403 JSON body', async () => {
    const r401 = authErrorResponse(new AuthError(401));
    const r403 = authErrorResponse(new AuthError(403));
    expect([r401.status, r403.status]).toEqual([401, 403]);
    expect(await r401.json()).toEqual({ error: 'unauthenticated' });
    expect(await r403.json()).toEqual({ error: 'forbidden' });
    expect(r403.headers.get('cache-control')).toBe('no-store');
  });
});
