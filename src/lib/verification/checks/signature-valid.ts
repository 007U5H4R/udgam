import { jcs, verify as verifySignature } from '../../crypto';
import { evidence } from '../evidence';
import type { Check } from '../registry';

/**
 * signature_valid (§6.3): ok when the enrolled, unrevoked device key signed this payload; otherwise a
 * hard fail. Never unavailable (pure). The boundary has already refused non-canonical strings and
 * unknown keys (§3.1 step 2), and the payload schema is strict, so jcs(payload) is exactly the string
 * the phone signed; re-verifying here keeps the scored record self-contained (and the harness honest).
 */
export const signatureValid: Check = {
  id: 'signature_valid',
  kind: 'local',
  async run(sub, ctx) {
    const id = 'signature_valid' as const;
    const deviceId = ctx.device.id;
    if (ctx.device.revokedAt !== null) {
      return { id, status: 'fail', hardFail: true, evidence: evidence.signature_valid.fail({ reason: 'revoked', deviceId, revokedAt: ctx.device.revokedAt }) };
    }
    if (sub.payload.deviceId !== deviceId) {
      return { id, status: 'fail', hardFail: true, evidence: evidence.signature_valid.fail({ reason: 'unknown_key' }) };
    }
    let signed: string;
    try {
      signed = jcs(sub.payload);
    } catch {
      return { id, status: 'fail', hardFail: true, evidence: evidence.signature_valid.fail({ reason: 'bad_signature', deviceId }) };
    }
    const ok = await verifySignature(ctx.device.publicJwk, signed, sub.signature);
    return ok
      ? { id, status: 'ok', hardFail: false, evidence: evidence.signature_valid.ok({ deviceId }) }
      : { id, status: 'fail', hardFail: true, evidence: evidence.signature_valid.fail({ reason: 'bad_signature', deviceId }) };
  },
};
