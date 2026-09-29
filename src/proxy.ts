import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from './lib/config/env';
import { contentSecurityPolicy, newNonce } from './lib/security/headers';

// Next 16 `proxy` (the renamed `middleware`). Two jobs:
// 1. The per-request Content-Security-Policy (technical-plan §16, TSK-19.5): a fresh nonce on every
//    page, set on the response and on the request, where Next's App Router reads it to put the nonce on
//    its own bootstrap scripts. Pages therefore render dynamically (the root layout opts in).
// 2. On the signed-in surfaces only, a signed-out visit (no session cookie) redirects to /sign-in. That
//    never decides access: the server-side guards (src/app/_auth/require.ts) are the boundary (§10).
//
// The matcher skips /api (route handlers answer JSON or NDJSON, and a proxy in front of /api/capture
// would buffer its up-to-30 MB body), /.well-known and static assets.

const SIGNED_IN = /^\/(field|admin|buyer)(\/|$)/;

function tileProvider(): 'esri' | 'maptiler' {
  try {
    return env.MAP_TILE_PROVIDER;
  } catch {
    return 'esri'; // a broken environment still gets a policy; the page itself reports the config error
  }
}

export function proxy(req: NextRequest): NextResponse {
  const nonce = newNonce();
  const csp = contentSecurityPolicy({ nonce, pathname: req.nextUrl.pathname, tileProvider: tileProvider(), dev: process.env.NODE_ENV === 'development' });

  let res: NextResponse;
  if (SIGNED_IN.test(req.nextUrl.pathname) && !getSessionCookie(req)) {
    res = NextResponse.redirect(new URL('/sign-in', req.url));
  } else {
    const headers = new Headers(req.headers);
    headers.set('x-nonce', nonce);
    headers.set('Content-Security-Policy', csp);
    res = NextResponse.next({ request: { headers } });
  }
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  matcher: [
    {
      source: '/((?!api/|api$|\\.well-known/|_next/static|_next/image|favicon\\.ico).*)',
      // Router prefetches carry no document, so they need no policy of their own.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
