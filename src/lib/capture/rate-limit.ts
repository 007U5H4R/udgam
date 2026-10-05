import { and, eq, gt, sql } from 'drizzle-orm';
import { writeTx, type Db } from '../db/client';
import { rateLimits } from '../db/schema';
import { hit } from '../rate-limit';

// Capture rate limits (technical-plan §22 TSK-19.3, §16 "upload abuse", TC-074) on the shared
// `rate_limits` table (fixed windows, N3: no Redis). Keyed on the deviceId a payload *claims*, before its
// signature is verified (a flood of forged payloads for one phone is throttled too), and on the client
// address. Every attempt counts, refused ones included. The phone bucket is scoped to the signed-in
// agent (TASK-20 fix round 1): device IDs are public (proof feed), so a bucket keyed on the claim alone
// would let any agent lock someone else's phone out; now a flood fills only the flooder's own bucket.

export const DEVICE_LIMIT = { limit: 30, windowSec: 10 * 60 } as const;
export const IP_LIMIT = { limit: 60, windowSec: 10 * 60 } as const;

export const deviceKey = (agentId: string, deviceId: string) => `capture:device:${agentId}:${deviceId}`;
export const ipKey = (ip: string) => `capture:ip:${ip}`;

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
