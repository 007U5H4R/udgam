import { and, eq } from 'drizzle-orm';
import { importPublicJwk, jwkThumbprint, publicMembers, type PublicJwk } from '../crypto';
import { writeTx, type Db, type Tx } from '../db/client';
import { devices, user } from '../db/schema';
import { newId } from '../ids';
import { append } from '../ledger/hashchain';
import { log } from '../log';
import { redeemCode, type RedeemFailure } from './codes';
import { NotFoundError } from './errors';

// Phone enrolment and revocation (technical-plan §3.2 POST /api/enrol, §9, TC-022, TC-023). The phone
// makes its own non-extractable P-256 key and sends only the public JWK; the server stores it with its
// RFC 7638 thumbprint and anchors `device_enrolled` in the same transaction. Revocation anchors
// `device_revoked`. Ledger payloads are public-safe IDs and hashes (EV16).

export type EnrolFailure = RedeemFailure | 'bad_key' | 'key_in_use' | 'key_revoked';
export type EnrolResult = { ok: true; deviceId: string; seq: 0; lastEventHash: null } | { ok: false; reason: EnrolFailure };

/** HTTP status for each refusal (POST /api/enrol). */
export const ENROL_STATUS: Record<EnrolFailure, 400 | 409 | 429> = {
  invalid: 400,
  expired: 400,
  used: 400,
  bad_key: 400,
  key_in_use: 409,
  key_revoked: 409,
  rate_limited: 429,
};

const COORD = /^[A-Za-z0-9_-]{43}$/;
const MEMBERS = ['crv', 'kty', 'x', 'y'];

/**
 * The canonical P-256 public key for `jwk`, or null. Only exactly {kty:'EC', crv:'P-256', x, y} with
 * 43-character unpadded base64url coordinates is accepted: no `d`, no extra members, no padding or '+/'.
 * The key is imported (an off-curve point is refused) and re-exported, and the RE-EXPORTED x and y are
 * what is stored and thumbprinted, so one point has one thumbprint whatever unused trailing bits the
 * sender set (a revoked key cannot come back as a "new" key in another encoding).
 */
async function publicKeyOf(jwk: unknown): Promise<PublicJwk | null> {
  if (typeof jwk !== 'object' || jwk === null || Array.isArray(jwk)) return null;
  const j = jwk as Record<string, unknown>;
  if (Object.keys(j).sort().join() !== MEMBERS.join()) return null;
  if (j.kty !== 'EC' || j.crv !== 'P-256' || typeof j.x !== 'string' || typeof j.y !== 'string' || !COORD.test(j.x) || !COORD.test(j.y)) return null;
  try {
    const key = await importPublicJwk({ kty: 'EC', crv: 'P-256', x: j.x, y: j.y });
    return publicMembers(await globalThis.crypto.subtle.exportKey('jwk', key));
  } catch {
    return null;
  }
}

/**
 * The enrolment's write, in the caller's transaction: the device row (chain at seq 0, no previous event)
 * and its `device_enrolled` entry {deviceId, agentId, thumbprint}, the key's RFC 7638 thumbprint. Also
 * used by the test and tracer seeds (scripts/tracer-world.ts, tests/helpers/batch-*.ts), so they anchor
 * exactly what enrolment does. `publicJwk` must already be the key's public members.
 *
 * It performs no checks of its own: no key validation, no key-uniqueness check, no code redemption and
 * no rate limit. Its only callers are enrolDevice (after all of those guards, in the same transaction)
 * and those test and tracer seeds; anything else must run enrolDevice instead.
 */
export async function anchorEnrolledDevice(
  tx: Tx,
  { deviceId, agentId, publicJwk, enrolledAt }: { deviceId: string; agentId: string; publicJwk: PublicJwk; enrolledAt: string },
): Promise<{ thumbprint: string; anchorSeq: number }> {
  const thumbprint = await jwkThumbprint(publicJwk);
  const anchor = await append(tx, 'device_enrolled', { deviceId, agentId, thumbprint });
  await tx.insert(devices).values({
    id: deviceId,
    agentId,
    publicKeyJwk: JSON.stringify(publicJwk),
    keyThumbprint: thumbprint,
    enrolledAt,
    lastSeq: 0,
    lastEventHash: null,
    anchorSeq: anchor.seq,
  });
  return { thumbprint, anchorSeq: anchor.seq };
}

/**
 * Enrol a phone for the signed-in agent with a one-time code. In one write transaction: the key must
 * be new, the code must redeem for this agent (5 per code, 10 per IP per hour), then the device row
 * and its `device_enrolled` entry {deviceId, agentId, thumbprint} are written. A refusal still commits
 * its rate-limit counts. The phone starts its chain at seq 0 with no previous event.
 */
export async function enrolDevice(
  db: Db,
  { code, publicJwk, ip, sessionAgentId }: { code: string; publicJwk: unknown; ip: string; sessionAgentId: string },
  now: Date = new Date(),
): Promise<EnrolResult> {
  const pub = await publicKeyOf(publicJwk);
  if (!pub) return { ok: false, reason: 'bad_key' };
  const thumbprint = await jwkThumbprint(pub);

  return writeTx(db, async (tx): Promise<EnrolResult> => {
    const [taken] = await tx.select({ id: devices.id, revokedAt: devices.revokedAt }).from(devices).where(eq(devices.keyThumbprint, thumbprint)).limit(1);
    if (taken) return { ok: false, reason: taken.revokedAt === null ? 'key_in_use' : 'key_revoked' };

    const r = await redeemCode(tx, code, now, ip, { agentId: sessionAgentId });
    if (!r.ok) return r;

    const deviceId = newId('DV-');
    await anchorEnrolledDevice(tx, { deviceId, agentId: r.agentId, publicJwk: pub, enrolledAt: now.toISOString() });
    log.info({ deviceId, agentId: r.agentId }, 'enrol.device_enrolled');
    return { ok: true, deviceId, seq: 0, lastEventHash: null };
  });
}

/**
 * Revoke a phone of the admin's org (`adminOrgId` from the session): sets `revoked_at` and anchors
 * `device_revoked` {deviceId, revokedAt}. Revoking a revoked phone changes nothing. Another org's
 * device, or an unknown one, is NotFoundError (404, EVAL-080).
 */
export async function revokeDevice(
  db: Db,
  { deviceId, adminOrgId }: { deviceId: string; adminOrgId: string },
  now: Date = new Date(),
): Promise<{ deviceId: string; revokedAt: string }> {
  return writeTx(db, async (tx) => {
    const [row] = await tx
      .select({ id: devices.id, revokedAt: devices.revokedAt })
      .from(devices)
      .innerJoin(user, eq(user.id, devices.agentId))
      .where(and(eq(devices.id, deviceId), eq(user.orgId, adminOrgId)))
      .limit(1);
    if (!row) throw new NotFoundError('device');
    if (row.revokedAt !== null) return { deviceId, revokedAt: row.revokedAt };
    const revokedAt = now.toISOString();
    await append(tx, 'device_revoked', { deviceId, revokedAt });
    await tx.update(devices).set({ revokedAt }).where(eq(devices.id, deviceId));
    log.info({ deviceId }, 'enrol.device_revoked');
    return { deviceId, revokedAt };
  });
}
