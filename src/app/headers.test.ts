// @vitest-environment node
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../../next.config';
import { STATIC_SECURITY_HEADERS, staticSecurityHeaders } from '../lib/security/headers';
import { config, proxy } from '../proxy';

// TSK-19.5 · TC-076 (technical-plan §16): every HTML response carries a per-request nonce CSP from the
// proxy; the static headers come from next.config.ts on every response.

afterEach(() => {
  vi.unstubAllEnvs();
});

const cspOf = (res: Response) => res.headers.get('content-security-policy') ?? '';
const directives = (csp: string) => new Map(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([name, ...values]) => [name!, values]));

function request(path: string, cookie?: string) {
  return new NextRequest(new URL(path, 'http://localhost'), { headers: cookie ? { cookie } : {} });
}
const SESSION = 'better-auth.session_token=abc.def';

describe('Content-Security-Policy (TC-076)', () => {
  it('an HTML page gets the §16 policy with a fresh nonce, also handed to Next on the request', () => {
    const a = proxy(request('/sign-in'));
    const b = proxy(request('/sign-in'));
    const d = directives(cspOf(a));
    expect(d.get('default-src')).toEqual(["'self'"]);
    const script = d.get('script-src')!;
    expect(script[0]).toBe("'self'");
    expect(script[1]).toMatch(/^'nonce-[A-Za-z0-9+/]{22}==' ?$/);
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(d.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]); // Next's style attributes; never script
    expect(d.get('img-src')).toEqual(["'self'", 'data:', 'blob:']);
    expect(d.get('connect-src')).toEqual(["'self'"]);
    expect(d.get('frame-ancestors')).toEqual(["'none'"]);
    expect(d.get('base-uri')).toEqual(["'self'"]);
    expect(d.get('form-action')).toEqual(["'self'"]);
    expect(d.get('object-src')).toEqual(["'none'"]); // fix round 2 (review #11): no plugins, not even from self
    expect([...d.keys()]).toEqual(['default-src', 'script-src', 'style-src', 'img-src', 'connect-src', 'object-src', 'frame-ancestors', 'base-uri', 'form-action']);
    expect(cspOf(b)).not.toBe(cspOf(a)); // per request
    // Next reads the nonce from the request's CSP header when it renders its bootstrap scripts
    expect(a.headers.get('x-middleware-request-content-security-policy')).toBe(cspOf(a));
    const nonce = /'nonce-([^']+)'/.exec(cspOf(a))![1];
    expect(a.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
  });

  it('every /admin* page (and only those) adds the configured tile host to img-src', async () => {
    // Fix round 1 (review major 1): the admin Rail and "Add plot" are client navigations, which keep the
    // policy of the first admin document, so every admin page carries the tile host (§16 "tile hosts
    // allow-listed on admin pages only"). env is read once per module instance: load a fresh proxy.
    const fresh = async (provider: string) => {
      vi.resetModules();
      vi.stubEnv('MAP_TILE_PROVIDER', provider);
      return (await import('../proxy')).proxy;
    };
    const esri = await fresh('esri');
    for (const path of ['/admin', '/admin/', '/admin/phones', '/admin/plots', '/admin/plots/new', '/admin/plots/PL-1', '/admin/batches']) {
      expect(directives(cspOf(esri(request(path, SESSION)))).get('img-src'), path).toEqual(["'self'", 'data:', 'blob:', 'https://ibasemaps-api.arcgis.com']);
    }
    const maptiler = await fresh('maptiler');
    expect(directives(cspOf(maptiler(request('/admin', SESSION)))).get('img-src')).toEqual(["'self'", 'data:', 'blob:', 'https://api.maptiler.com']);
    expect(directives(cspOf(maptiler(request('/admin/plots/new', SESSION)))).get('img-src')).toEqual(["'self'", 'data:', 'blob:', 'https://api.maptiler.com']);
    for (const path of ['/', '/adminx', '/administrator', '/field', '/field/record', '/buyer', '/verify/B-12345678', '/sign-in', '/enrol']) {
      expect(directives(cspOf(esri(request(path, SESSION)))).get('img-src'), path).toEqual(["'self'", 'data:', 'blob:']);
    }
  });

  it('keeps the signed-out redirect on the signed-in surfaces (TKT-04)', () => {
    for (const path of ['/field', '/field/record', '/admin', '/admin/plots/new', '/buyer']) {
      const res = proxy(request(path));
      expect(res.status, path).toBe(307);
      expect(new URL(res.headers.get('location')!).pathname).toBe('/sign-in');
    }
    const signedIn = proxy(request('/field', SESSION));
    expect(signedIn.headers.get('location')).toBeNull();
    expect(cspOf(signedIn)).toContain("'strict-dynamic'");
    // public pages are never redirected
    expect(proxy(request('/sign-in')).headers.get('location')).toBeNull();
    expect(proxy(request('/verify/B-12345678?h=abc')).headers.get('location')).toBeNull();
  });

  it('runs on every page but never on /api, /.well-known or static assets', () => {
    const matches = (url: string, headers?: Record<string, string>) => unstable_doesMiddlewareMatch({ config, url, nextConfig, headers });
    for (const url of ['/', '/sign-in', '/enrol', '/field', '/admin/plots/new', '/buyer', '/verify/B-12345678?h=x', '/does-not-exist']) {
      expect(matches(url), url).toBe(true);
    }
    for (const url of ['/api/capture', '/api/health', '/api/verify/B-1?h=x', '/.well-known/udgam-ledger-key', '/_next/static/chunks/a.js', '/_next/image?url=x', '/favicon.ico']) {
      expect(matches(url), url).toBe(false);
    }
  });
});

describe('static security headers (TC-076)', () => {
  it('every path gets nosniff, the referrer policy and the permissions policy', async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === '/:path*');
    expect(all?.headers).toEqual(
      expect.arrayContaining([
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
      ]),
    );
  });

  // SEC-007 (Stage 10): HSTS from the app as well as the proxy, in a real deployment only. Never in dev,
  // tests or on the Playwright server (E2E=1, a production build served on http://localhost).
  const HSTS = { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' };
  it('a production deployment sends Strict-Transport-Security; dev, test and the e2e server do not', () => {
    expect(staticSecurityHeaders({ NODE_ENV: 'production' })).toEqual([...STATIC_SECURITY_HEADERS, HSTS]);
    expect(staticSecurityHeaders({ NODE_ENV: 'production', E2E: '0' })).toContainEqual(HSTS);
    for (const e of [{ NODE_ENV: 'development' }, { NODE_ENV: 'test' }, { NODE_ENV: 'production', E2E: '1' }, { NODE_ENV: '' }]) {
      expect(staticSecurityHeaders(e), JSON.stringify(e)).toEqual([...STATIC_SECURITY_HEADERS]);
    }
  });

  it('next.config.ts sends the headers for the environment it runs in', async () => {
    const rules = async () => (await (await import('../../next.config')).default.headers!()).find((r) => r.source === '/:path*')?.headers;
    expect(await rules()).not.toContainEqual(HSTS); // vitest: NODE_ENV=test
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    expect(await rules()).toContainEqual(HSTS);
    vi.resetModules();
    vi.stubEnv('E2E', '1');
    expect(await rules()).not.toContainEqual(HSTS);
  });
});
