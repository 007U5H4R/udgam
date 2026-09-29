import { and, eq, inArray, like, or, sql } from 'drizzle-orm';
import { sha256Hex } from '../crypto';
import { writeTx, type Db, type Tx } from '../db/client';
import { rateLimits } from '../db/schema';
import { hit } from '../rate-limit';

// Sign-in throttling for the Server Action (TKT-19 carry-forward from TKT-04; fix round 1). The action
// calls Better Auth's API in-process (its HTTP sign-in endpoint is closed, see api/auth/[...all]), so
// attempts are counted on the shared `rate_limits` table.
//
// Every attempt first reserves a slot on three keys, atomically (one writeTx: read the counts, then
// `hit()` each key), before Better Auth checks the password; so a parallel burst gets at most the limit
// through, never N. A success, or a refusal that is not about the credentials, gives the slot back, so a
// busy office signing in correctly is never throttled. Past a limit the attempt is refused without
// counting against anything: an attacker at one address fills only their own (email, address) bucket
// and can't push the owner's email over its looser limit.

/** Failures per (email, client address) per 15 minutes: the strict limit, which one attacker hits. */
export const PAIR_FAILURES = { limit: 10, windowSec: 15 * 60 } as const;
/** Failures per email (any address) per 15 minutes: slows distributed guessing without an easy lockout. */
export const EMAIL_FAILURES = { limit: 50, windowSec: 15 * 60 } as const;
/** Failures per client address (any email) per 15 minutes. */
export const IP_FAILURES = { limit: 30, windowSec: 15 * 60 } as const;
const WINDOW_SEC = 15 * 60; // all three limits share it, so one window start covers every key

const emailHash = (email: string) => sha256Hex(email.trim().toLowerCase());

/** The throttle key of an email. It never holds the email itself: rate_limits is not for personal data. */
export async function emailKey(email: string): Promise<string> {
  return `signin:email:${await emailHash(email)}`;
}

const pairPrefix = (hash: string) => `signin:pair:${hash}:`;

async function keys(email: string, ip: string) {
  const hash = await emailHash(email);
  return [
    { key: `${pairPrefix(hash)}${ip}`, ...PAIR_FAILURES },
    { key: `signin:email:${hash}`, ...EMAIL_FAILURES },
    { key: `signin:ip:${ip}`, ...IP_FAILURES },
  ];
}

const windowStart = (now: Date) => Math.floor(now.getTime() / 1000 / WINDOW_SEC) * WINDOW_SEC;

export type SignInReservation = { ok: true; keys: readonly string[]; windowStart: number } | { ok: false };

/**
 * Reserve one sign-in attempt for this email and address, or refuse it (`ok: false`) when any of the
 * three limits is used up in the current window. A refusal writes nothing.
 */
export async function reserveSignIn(db: Db, email: string, ip: string, now: Date = new Date()): Promise<SignInReservation> {
  const ks = await keys(email, ip);
  const start = windowStart(now);
  return writeTx(db, async (tx) => {
    const rows = await tx
      .select({ key: rateLimits.key, count: rateLimits.count })
      .from(rateLimits)
      .where(
        and(
          inArray(
            rateLimits.key,
            ks.map((k) => k.key),
          ),
          eq(rateLimits.windowStart, start),
        ),
      );
    const count = (key: string) => rows.find((r) => r.key === key)?.count ?? 0;
    if (ks.some((k) => count(k.key) >= k.limit)) return { ok: false } as const;
    for (const k of ks) await hit(tx, k.key, k.limit, k.windowSec, now);
    return { ok: true, keys: ks.map((k) => k.key), windowStart: start } as const;
  });
}

/** Give a reserved attempt back (it succeeded, or failed for a reason other than the credentials). */
export async function refundSignIn(db: Db, r: SignInReservation): Promise<void> {
  if (!r.ok) return;
  await writeTx(db, (tx) =>
    tx
      .update(rateLimits)
      .set({ count: sql`max(${rateLimits.count} - 1, 0)` })
      .where(and(inArray(rateLimits.key, [...r.keys]), eq(rateLimits.windowStart, r.windowStart)))
      .then(() => undefined),
  );
}

/** Drop every sign-in throttle of these emails (the account seed, as a password reset would). */
export async function clearSignInThrottles(tx: Tx, emails: readonly string[]): Promise<void> {
  if (emails.length === 0) return;
  const hashes = await Promise.all(emails.map(emailHash));
  await tx.delete(rateLimits).where(
    or(
      inArray(
        rateLimits.key,
        hashes.map((h) => `signin:email:${h}`),
      ),
      ...hashes.map((h) => like(rateLimits.key, `${pairPrefix(h)}%`)),
    ),
  );
}
