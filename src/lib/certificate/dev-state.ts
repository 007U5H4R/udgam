// The certificate's forced view states (technical-plan §11, TSK-16.6, EVAL-088): `?state=loading` holds the
// proof panel on its real step line, `?state=mismatch` shows the red proof card, so e2e and design review
// can reach every state. The not-found state is a wrong link (TSK-16.2); working is verified. Ignored in a
// production deployment: only outside production, or on the Playwright server (E2E=1, which runs a
// production build and is never set in a real deployment). Pure: the caller passes env.

export type CertificateDevState = 'loading' | 'mismatch';

type Env = { NODE_ENV: string; E2E?: string };

/** The forced state for `searchParams`, or null (no parameter, another value, or a production deployment). */
export function resolveDevState(searchParams: Record<string, string | string[] | undefined>, env: Env): CertificateDevState | null {
  if (env.NODE_ENV === 'production' && env.E2E !== '1') return null;
  const v = searchParams.state;
  return v === 'loading' || v === 'mismatch' ? v : null;
}
