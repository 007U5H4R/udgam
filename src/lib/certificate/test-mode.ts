import { applyTamper, TAMPER_VARIANTS, type TamperVariant } from '../ledger/testing/tamper';
import type { ProofFeedV1, VerifierKey } from '../ledger/proof';

// The certificate's test-only tamper mode (TSK-16.8, TC-065, EVAL-059–063 page side): with
// `?__tamper=<variant>` the page embeds a forged copy of the feed (TKT-18's generator), so e2e can watch
// the visitor's browser catch each forgery and name its step. The one app-side user of
// lib/ledger/testing (eslint allows only this file). It exists only on the Playwright server: E2E=1, like
// every other test-only surface (technical-plan §1, src/app/%5F_test__/guard.ts); a real deployment never
// sets E2E, so there `?__tamper=` is ignored and the genuine feed is served.
// The published key is never replaced: `other-key` re-signs the checkpoints with a new key and the
// browser, checking against the real published key, must report `unknown-key`.

type Env = { NODE_ENV: string; E2E?: string };

export { TAMPER_VARIANTS, type TamperVariant };

/** The tamper variant asked for, or null: always null unless E2E=1, and for anything not a known variant. */
export function tamperFromSearchParams(searchParams: Record<string, string | string[] | undefined>, env: Env): TamperVariant | null {
  if (env.E2E !== '1') return null;
  const v = searchParams.__tamper;
  return typeof v === 'string' && (TAMPER_VARIANTS as readonly string[]).includes(v) ? (v as TamperVariant) : null;
}

/** The feed with `variant` applied (a deep copy; the input is not modified). */
export async function tamperedFeed(feed: ProofFeedV1, keys: VerifierKey[], variant: TamperVariant): Promise<ProofFeedV1> {
  return (await applyTamper(feed, keys, variant)).feed;
}
