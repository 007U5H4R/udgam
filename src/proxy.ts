import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

// Next 16 `proxy` (the renamed `middleware`). It only redirects signed-out navigation on the signed-in
// surfaces to /sign-in, by the presence of a session cookie; it never decides access. The server-side
// guards (src/app/_auth/require.ts) are the security boundary (technical-plan §10).
//
// The matcher names the three signed-in prefixes only, so /verify/*, /api/*, /.well-known/*, /sign-in
// and / are never touched.

export function proxy(req: NextRequest): NextResponse {
  if (getSessionCookie(req)) return NextResponse.next();
  return NextResponse.redirect(new URL('/sign-in', req.url));
}

export const config = {
  matcher: ['/field', '/field/:path*', '/admin', '/admin/:path*', '/buyer', '/buyer/:path*'],
};
