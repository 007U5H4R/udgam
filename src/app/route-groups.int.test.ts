// @vitest-environment node
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { addOrg, addUser, cookieHeader } from '../../tests/helpers/auth';
import { tempDb, type TempDb } from '../../tests/helpers/db';
import { outcome } from '../../tests/helpers/next';
import type { Role } from '../lib/auth/session';

// TC-018 (pages part) / EVAL-080: for roles none/agent/admin/buyer, each route group's layout lets only
// its owner render; everyone else is redirected (signed out → /sign-in, another role → its own home).
// The proxy redirects signed-out navigation for /field, /admin, /buyer and never touches public paths.

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock('next/headers', () => ({ headers: async () => request.headers, cookies: async () => ({ get: () => undefined, set: () => undefined }) }));

let t: TempDb;
const PASSWORD = 'route groups password';
const cookies: Partial<Record<Role, string>> = {};

// Seeded once: the layouts and pages under test only read.
beforeAll(async () => {
  t = await tempDb();
  vi.stubEnv('DATABASE_URL', t.url);
  vi.stubEnv('DATA_DIR', t.dir);
  vi.stubEnv('LOG_LEVEL', 'silent');
  await addOrg(t.db, 'ORG-A', 'fpo');
  await addOrg(t.db, 'ORG-BUY', 'buyer');
  const { appAuth } = await import('./_auth/auth');
  for (const role of ['agent', 'admin', 'buyer'] as const) {
    await addUser(t.db, { id: `U-${role}`, email: `${role}@a.test`, password: PASSWORD, role, orgId: role === 'buyer' ? 'ORG-BUY' : 'ORG-A' });
    cookies[role] = cookieHeader(await appAuth().api.signInEmail({ body: { email: `${role}@a.test`, password: PASSWORD }, asResponse: true }));
  }
});
afterEach(() => {
  request.headers = new Headers();
});
afterAll(async () => {
  (await import('../lib/db/client')).closeDb();
  vi.unstubAllEnvs();
  await t.cleanup();
});

const as = (who: Role | 'none') => {
  request.headers = new Headers(who === 'none' ? {} : { cookie: cookies[who]! });
};

const GROUPS = {
  agent: () => import('./(agent)/layout'),
  admin: () => import('./(admin)/layout'),
  buyer: () => import('./(buyer)/layout'),
} as const;

const EXPECTED: Record<'none' | Role, Record<Role, 'renders' | string>> = {
  none: { agent: '/sign-in', admin: '/sign-in', buyer: '/sign-in' },
  agent: { agent: 'renders', admin: '/field', buyer: '/field' },
  admin: { agent: '/admin', admin: 'renders', buyer: '/admin' },
  buyer: { agent: '/buyer', admin: '/buyer', buyer: 'renders' },
};

describe('TC-018 route-group layouts guard on the server', () => {
  for (const who of ['none', 'agent', 'admin', 'buyer'] as const) {
    for (const group of ['agent', 'admin', 'buyer'] as const) {
      const want = EXPECTED[who][group];
      it(`${who} → (${group}) ${want === 'renders' ? 'renders' : `redirects to ${want}`}`, async () => {
        const { default: Layout } = await GROUPS[group]();
        as(who);
        const got = await outcome(() => Layout({ children: 'child' }));
        if (want === 'renders') expect(got).toHaveProperty('rendered');
        else expect(got).toEqual({ redirect: want });
      });
    }
  }

  it('the (admin) and (buyer) shells guard themselves too (a page never trusts its layout alone)', async () => {
    const { default: AdminPage } = await import('./(admin)/admin/(review)/(queue)/page');
    const { default: BuyerPage } = await import('./(buyer)/buyer/(list)/page');
    as('buyer');
    expect(await outcome(() => AdminPage())).toEqual({ redirect: '/buyer' });
    as('admin');
    expect(await outcome(() => BuyerPage())).toEqual({ redirect: '/admin' });
    expect(await outcome(() => AdminPage())).toHaveProperty('rendered');
  });
});

describe('the root page sends each user home', () => {
  for (const [who, to] of [
    ['none', '/sign-in'],
    ['agent', '/field'],
    ['admin', '/admin'],
    ['buyer', '/buyer'],
  ] as const) {
    it(`${who} → ${to}`, async () => {
      const { default: Root } = await import('./page');
      as(who);
      expect(await outcome(() => Root())).toEqual({ redirect: to });
    });
  }
});

describe('proxy: redirects signed-out navigation only; it is not the security boundary', () => {
  it('signed-out /field, /admin/..., /buyer → /sign-in; with a session cookie → passes through', async () => {
    const { proxy } = await import('../proxy');
    for (const path of ['/field', '/field/record', '/admin', '/admin/plots/PL-1', '/buyer', '/buyer/batches/B-1']) {
      const out = proxy(new NextRequest(`http://localhost${path}`));
      expect(out.status, path).toBe(307);
      expect(new URL(out.headers.get('location')!).pathname).toBe('/sign-in');
      const signedIn = proxy(new NextRequest(`http://localhost${path}`, { headers: { cookie: cookies.agent! } }));
      expect(signedIn.headers.get('location'), path).toBeNull();
    }
  });

  it('redirects only /field, /admin and /buyer: /, /sign-in, /verify and look-alike paths never redirect; /api/* and /.well-known never reach it', async () => {
    const { config, proxy } = await import('../proxy');
    // TSK-19.5: the proxy now runs on every page (it sets the CSP), so the redirect decision is its own
    for (const url of ['/field', '/field/pickings/HE-1', '/admin', '/admin/review/VR-1', '/buyer', '/buyer/batches/B-1']) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(true);
      expect(proxy(new NextRequest(`http://localhost${url}`)).status, url).toBe(307);
    }
    for (const url of ['/', '/sign-in', '/verify/B-XYZ', '/verify/anything?h=abc', '/fieldwork', '/administrator']) {
      expect(proxy(new NextRequest(`http://localhost${url}`)).headers.get('location'), url).toBeNull();
    }
    for (const url of ['/api/verify/B-1', '/api/health', '/api/auth/sign-in/email', '/api/capture', '/.well-known/udgam-ledger-key']) {
      expect(unstable_doesMiddlewareMatch({ config, url }), url).toBe(false);
    }
  });
});
