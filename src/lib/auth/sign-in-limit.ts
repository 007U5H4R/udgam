import { and, eq, inArray } from 'drizzle-orm';
import { sha256Hex } from '../crypto';
import type { Db } from '../db/client';
import { rateLimits } from '../db/schema';
import { hit } from '../rate-limit';

// Sign-in throttling for the Server Action (TKT-19 carry-forward from TKT-04). The action calls Better
// Auth's API in-process, so Better Auth's HTTP rate limiter never sees it; failed attempts are counted on
// the shared `rate_limits` table instead. Only credential failures count, so a busy office signing in
// correctly is never throttled; once an email or an address has too many failures in the window, every
// attempt from it is refused until the window ends — the right password included.

/** Failures per email (any address) per 15 minutes. */
export const EMAIL_FAILURES = { limit: 10, windowSec: 15 * 60 } as const;
/** Failures per client address (any email) per 15 minutes. */
export const IP_FAILURES = { limit: 30, windowSec: 15 * 60 } as const;

/** The throttle key of an email. It never holds the email itself: rate_limits is not for personal data. */
export async function emailKey(email: string): Promise<string> {
  return `signin:email:${await sha256Hex(email.trim().toLowerCase())}`;
}

async function keys(email: string, ip: string) {
  return { email: await emailKey(email), ip: `signin:ip:${ip}` };
}

const windowStart = (now: Date, windowSec: number) => Math.floor(now.getTime() / 1000 / windowSec) * windowSec;

/** Has this email or address used up its failures in the current window? Reads only. */
export async function signInBlocked(db: Db, email: string, ip: string, now: Date = new Date()): Promise<boolean> {
  const k = await keys(email, ip);
  // Both limits share one window length, so one window start covers both keys.
  const rows = await db
    .select({ key: rateLimits.key, count: rateLimits.count })
    .from(rateLimits)
    .where(and(inArray(rateLimits.key, [k.email, k.ip]), eq(rateLimits.windowStart, windowStart(now, EMAIL_FAILURES.windowSec))));
  const count = (key: string) => rows.find((r) => r.key === key)?.count ?? 0;
  return count(k.email) >= EMAIL_FAILURES.limit || count(k.ip) >= IP_FAILURES.limit;
}

/** Count one credential failure against the email and the address. */
export async function recordSignInFailure(db: Db, email: string, ip: string, now: Date = new Date()): Promise<void> {
  const k = await keys(email, ip);
  await hit(db, k.email, EMAIL_FAILURES.limit, EMAIL_FAILURES.windowSec, now);
  await hit(db, k.ip, IP_FAILURES.limit, IP_FAILURES.windowSec, now);
}
