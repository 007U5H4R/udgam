import { ADMIN_TILE_HOSTS } from '../geo/tiles';
import { isAdminPath } from './admin-path';

// Security headers (technical-plan §16, TSK-19.5, TC-076). Framework-free: src/proxy.ts sets the
// per-request CSP and next.config.ts sends the static headers on every response.

/** Sent on every response (next.config.ts `headers()`). */
export const STATIC_SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
];

export type TileProvider = 'esri' | 'maptiler';

// isAdminPath (every /admin document carries the tile host) lives in ./admin-path, which the admin
// layout's client guard shares; sign-in loads the admin as a new document (TASK-20 fix round 2).
export { isAdminPath };

/** The tile origin of the configured provider (tiles.ts builds its URLs from the same list). */
export function tileHost(provider: TileProvider): string {
  return provider === 'maptiler' ? ADMIN_TILE_HOSTS[1] : ADMIN_TILE_HOSTS[0];
}

/** 128 random bits, base64: a fresh script nonce for one response. */
export function newNonce(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The Content-Security-Policy for one HTML response. Scripts run only with this response's nonce
 * ('strict-dynamic' lets Next's nonce-bearing bootstrap load its chunks); images from self, data: and
 * blob: (photo previews), plus the configured tile host on the admin pages only; no plugins
 * (`object-src 'none'`), no <base> elsewhere (`base-uri 'self'`), no framing (fix round 2, review #11).
 * Styles allow 'unsafe-inline' (recorded decision: TASK-20 candidate EXE 4, kept as it is in fix round 2):
 * Next renders style attributes (next/image, its error pages) and an inline <style> on its not-found page
 * that no nonce or hash can cover, and an inline style cannot run script. `dev` adds 'unsafe-eval', which
 * Next's development server needs (never in a production build).
 */
export function contentSecurityPolicy(o: { nonce: string; pathname: string; tileProvider: TileProvider; dev?: boolean }): string {
  const img = ["'self'", 'data:', 'blob:', ...(isAdminPath(o.pathname) ? [tileHost(o.tileProvider)] : [])];
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${o.nonce}' 'strict-dynamic'${o.dev ? ` 'unsafe-eval'` : ''}`,
    `style-src 'self' 'unsafe-inline'`, // TASK-20 candidate EXE 4: see above
    `img-src ${img.join(' ')}`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');
}
