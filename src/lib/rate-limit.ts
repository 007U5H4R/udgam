import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { writeTx, type Db, type Tx } from './db/client';
import { rateLimits } from './db/schema';

// Fixed-window rate limiting on the SQLite file (technical-plan §4.1 `rate_limits`, N3: no Redis).
// Used by enrolment (5 attempts per code, 10 per IP per hour, §10), capture and photo staging (TKT-19,
// TKT-30) and the certificate telemetry beacon (TKT-16). `hit` counts; `consume` adds the Retry-After
// seconds the HTTP routes answer with, and `refund` gives one attempt back.

export type HitResult = { allowed: boolean; remaining: number };

/** Windows are at most 24 h long, so one that started over 48 h ago can never count again, for any key. */
const SWEEP_AGE_SEC = 48 * 3600;
const SWEEP_EVERY_MS = 60_000;
let lastSweepMs: number | undefined;

/**
 * Drop every key's windows older than 48 h, at most once a minute (opportunistically, inside a normal hit):
 * one-off keys (a guessed code's hash, a single client address) are otherwise never hit again.
 */
async function sweep(tx: Tx, now: Date): Promise<void> {
  const ms = now.getTime();
  if (lastSweepMs !== undefined && Math.abs(ms - lastSweepMs) < SWEEP_EVERY_MS) return;
  lastSweepMs = ms;
  await tx.delete(rateLimits).where(lt(rateLimits.windowStart, Math.floor(ms / 1000) - SWEEP_AGE_SEC));
}

const isTx = (h: Db | Tx): h is Tx => typeof (h as Partial<Tx>).rollback === 'function';

async function hitIn(tx: Tx, key: string, limit: number, windowSec: number, now: Date): Promise<HitResult> {
  const windowStart = Math.floor(now.getTime() / 1000 / windowSec) * windowSec;
  const [row] = await tx
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });
  // Earlier windows of this key can never count again.
  await tx.delete(rateLimits).where(and(eq(rateLimits.key, key), lt(rateLimits.windowStart, windowStart)));
  await sweep(tx, now);
  const count = row!.count;
  return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
}

/**
 * Count one hit on `key` in the current window of `windowSec` seconds and say whether it is within
 * `limit`. Every hit counts, refused ones included. Pass a transaction handle to count inside the
 * caller's write transaction (it then commits or rolls back with it); with the database, the hit
 * runs in its own `writeTx` (BEGIN IMMEDIATE), so concurrent hits never lose an update.
 */
export function hit(handle: Db | Tx, key: string, limit: number, windowSec: number, now: Date = new Date()): Promise<HitResult> {
  if (!Number.isInteger(windowSec) || windowSec <= 0) throw new RangeError('windowSec must be a positive integer');
  if (isTx(handle)) return hitIn(handle, key, limit, windowSec, now);
  return writeTx(handle, (tx) => hitIn(tx, key, limit, windowSec, now));
}

export type ConsumeResult = { ok: boolean; retryAfterSec: number };

/**
 * Count one attempt on `key` and say whether it is within `limit` per `windowSec`. When it is not,
 * `retryAfterSec` is the whole seconds until the current window ends (at least 1).
 */
export async function consume(db: Db, key: string, limit: number, windowSec: number, now: Date = new Date()): Promise<ConsumeResult> {
  const r = await hit(db, key, limit, windowSec, now);
  if (r.allowed) return { ok: true, retryAfterSec: 0 };
  const nowSec = now.getTime() / 1000;
  const windowEnd = (Math.floor(nowSec / windowSec) + 1) * windowSec;
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil(windowEnd - nowSec)) };
}

/**
 * Give back one attempt counted on `key` in the window of `now` (TKT-30 review #5): a capture answered
 * 409 media_not_staged is not an attempt, its resend with the bytes is, so the pair spends one token.
 * A window that has rolled over since is left alone.
 */
export async function refund(db: Db, key: string, windowSec: number, now: Date): Promise<void> {
  const windowStart = Math.floor(now.getTime() / 1000 / windowSec) * windowSec;
  await writeTx(db, (tx) =>
    tx
      .update(rateLimits)
      .set({ count: sql`${rateLimits.count} - 1` })
      .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStart), gt(rateLimits.count, 0))),
  );
}
