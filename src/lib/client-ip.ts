/**
 * The client address for per-IP rate limits (enrolment §10, capture and sign-in TKT-19): the LAST
 * X-Forwarded-For hop, the one the reverse proxy sets or appends. Earlier hops and X-Real-IP are
 * client-controlled and never trusted. Deployment assumption (TKT-27, documented in .env.example): the
 * app port is never published and Caddy, with `trusted_proxies` unset, overwrites X-Forwarded-For with
 * the connecting address. Without the header (the app reached directly) every client shares one bucket.
 */
export function clientIp(headers: Headers): string {
  const hops = headers.get('x-forwarded-for')?.split(',') ?? [];
  return hops.at(-1)?.trim().slice(0, 64) || 'unknown';
}
