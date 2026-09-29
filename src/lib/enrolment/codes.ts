import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { sha256Hex } from '../crypto';
import { writeTx, type Db, type Tx } from '../db/client';
import { enrollmentCodes, user } from '../db/schema';
import { log as defaultLog } from '../log';
import { hit } from '../rate-limit';
import { CODE_ALPHABET, CODE_LENGTH, normaliseCode } from './code-format';
import { NotFoundError } from './errors';

// Phone enrolment codes (technical-plan §10, TC-021, EVAL-082). An admin issues a 6-character code for
// one agent; the agent's phone redeems it once, within 24 hours. Only SHA-256(code) is stored, and
// neither the code nor its hash is ever logged. Limits: 5 attempts per code, 10 per IP per hour.

export { CODE_ALPHABET, CODE_LENGTH, normaliseCode };
export const CODE_TTL_MS = 24 * 3600_000;
export const CODE_ATTEMPTS = { limit: 5, windowSec: 24 * 3600 } as const;
export const IP_ATTEMPTS = { limit: 10, windowSec: 3600 } as const;

export type RedeemFailure = 'invalid' | 'expired' | 'used' | 'rate_limited';
export type RedeemResult = { ok: true; agentId: string } | { ok: false; reason: RedeemFailure };
type Log = Pick<typeof defaultLog, 'info' | 'warn'>;

/** A uniformly random code (rejection sampling keeps every symbol equally likely). */
function randomCode(): string {
  const n = CODE_ALPHABET.length;
  const cap = 256 - (256 % n);
  let out = '';
  while (out.length < CODE_LENGTH) {
    for (const b of globalThis.crypto.getRandomValues(new Uint8Array(16))) {
      if (b < cap && out.length < CODE_LENGTH) out += CODE_ALPHABET[b % n];
    }
  }
  return out;
}

/** An agent of the org, or undefined (org-scoped: another org's agent reads as unknown). */
async function agentInOrg(db: Db | Tx, orgId: string, id: string, role: 'agent' | 'admin') {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, id), eq(user.orgId, orgId), eq(user.role, role)))
    .limit(1);
  return row;
}

const ISSUE_TRIES = 5;

/**
 * Issue a code for `agentId`, an agent of the admin's org (`orgId` from the admin's session). Returns
 * the plain code once — it is never stored — and its expiry. The agent's older unused codes are retired
 * (their expiry is set to now, so they read as `expired`): only the newest code works. A code whose hash
 * is already on record (codes are kept for ever) is redrawn, at most 5 times. NotFoundError for anyone
 * outside the org. `generate` is injectable for tests.
 */
export async function issueCode(
  db: Db,
  { agentId, adminId, orgId }: { agentId: string; adminId: string; orgId: string },
  now: Date = new Date(),
  generate: () => string = randomCode,
): Promise<{ code: string; expiresAt: string }> {
  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();
  const code = await writeTx(db, async (tx) => {
    if (!(await agentInOrg(tx, orgId, agentId, 'agent')) || !(await agentInOrg(tx, orgId, adminId, 'admin'))) throw new NotFoundError('agent');
    for (let i = 0; i < ISSUE_TRIES; i++) {
      const candidate = generate();
      const codeHash = await sha256Hex(candidate);
      const [taken] = await tx.select({ h: enrollmentCodes.codeHash }).from(enrollmentCodes).where(eq(enrollmentCodes.codeHash, codeHash)).limit(1);
      if (taken) continue;
      await tx
        .update(enrollmentCodes)
        .set({ expiresAt: now.toISOString() })
        .where(and(eq(enrollmentCodes.agentId, agentId), isNull(enrollmentCodes.usedAt), gt(enrollmentCodes.expiresAt, now.toISOString())));
      await tx.insert(enrollmentCodes).values({ codeHash, agentId, createdBy: adminId, expiresAt });
      return candidate;
    }
    throw new Error('enrolment code collision: no free code after 5 tries');
  });
  return { code, expiresAt };
}

/**
 * Redeem a code inside the caller's write transaction. Every attempt counts, refused ones included, so
 * the caller must let the transaction commit on a refusal: 10 per IP per hour (`rate_limits`), and 5 per
 * code for the code's whole life (`enrollment_codes.attempts`, not a clock-aligned window). A guess that
 * matches no code is limited by its hash in `rate_limits` as well. With `agentId`, a code issued for
 * another agent is `invalid` and stays unused. On success the code is marked used.
 */
export async function redeemCode(
  tx: Tx,
  code: string,
  now: Date,
  ip: string,
  opts: { agentId?: string; log?: Log } = {},
): Promise<RedeemResult> {
  const log = opts.log ?? defaultLog;
  const refuse = (reason: RedeemFailure): RedeemResult => {
    log.warn({ reason }, 'enrol.code_refused'); // never the code or its hash
    return { ok: false, reason };
  };

  if (!(await hit(tx, `enrol:ip:${ip}`, IP_ATTEMPTS.limit, IP_ATTEMPTS.windowSec, now)).allowed) return refuse('rate_limited');
  const normal = normaliseCode(code);
  if (!normal) return refuse('invalid');
  const codeHash = await sha256Hex(normal);

  const [row] = await tx
    .update(enrollmentCodes)
    .set({ attempts: sql`${enrollmentCodes.attempts} + 1` })
    .where(eq(enrollmentCodes.codeHash, codeHash))
    .returning();
  if (!row) {
    const unknown = await hit(tx, `enrol:code:${codeHash}`, CODE_ATTEMPTS.limit, CODE_ATTEMPTS.windowSec, now);
    return refuse(unknown.allowed ? 'invalid' : 'rate_limited');
  }
  if (row.attempts > CODE_ATTEMPTS.limit) return refuse('rate_limited');
  if (row.usedAt !== null) return refuse('used');
  if (now.getTime() >= Date.parse(row.expiresAt)) return refuse('expired');
  if (opts.agentId !== undefined && row.agentId !== opts.agentId) return refuse('invalid');

  await tx.update(enrollmentCodes).set({ usedAt: now.toISOString() }).where(eq(enrollmentCodes.codeHash, codeHash));
  log.info({ agentId: row.agentId }, 'enrol.code_redeemed');
  return { ok: true, agentId: row.agentId };
}
