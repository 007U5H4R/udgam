import { jcs, sha256Hex, verify as verifySignature } from '../crypto';
import type { CapturePayloadV1 } from '../verification/types';
import { capturePayloadV1 } from './payload';

// The capture boundary (technical-plan §3.1 step 2, Review focus 1–2). Order matters:
// canonical form → schema → device → signature over the RECEIVED bytes → revocation → plot assignment
// (§6.4, TP5) → media sizes and hashes. A failure is a 4xx; the pipeline anchors it as a rejected
// harvest_event. The signature is checked before revocation so that only the phone's own key can learn
// (or be recorded as) a revoked or unassigned phone.

export type BoundaryDevice = {
  id: string;
  agentId: string;
  publicJwk: JsonWebKey;
  revokedAt: string | null;
  lastSeq: number;
  lastEventHash: string | null;
};

export type BoundaryReason =
  | 'non_canonical'
  | 'bad_schema'
  | 'unknown_device'
  | 'device_revoked'
  | 'bad_signature'
  | 'plot_not_assigned'
  | 'media_hash_mismatch';

export type BoundaryInput = { payloadString: string; signature: string; files: Blob[] };
export type BoundaryDeps = {
  findDevice(deviceId: string): Promise<BoundaryDevice | null>;
  /** Does the agent hold a live `agent_plots` assignment for the plot? (§6.4) */
  isPlotAssigned(agentId: string, plotId: string): Promise<boolean>;
};

export type BoundaryResult =
  | { ok: true; payload: CapturePayloadV1; payloadHash: string; device: BoundaryDevice }
  | {
      ok: false;
      status: 400 | 401 | 403 | 409;
      reason: BoundaryReason;
      /** True when an enrolled device's key verified the signature (the rejection can name the device). */
      signedByKnownDevice: boolean;
      /** The device, once its signature has verified. */
      device?: BoundaryDevice;
    };

export const STATUS: Record<BoundaryReason, 400 | 401 | 403 | 409> = {
  non_canonical: 400,
  bad_schema: 400,
  unknown_device: 401,
  bad_signature: 401,
  device_revoked: 403,
  plot_not_assigned: 403,
  media_hash_mismatch: 409,
};

function reject(reason: BoundaryReason, device?: BoundaryDevice): Extract<BoundaryResult, { ok: false }> {
  return device ? { ok: false, status: STATUS[reason], reason, signedByKnownDevice: true, device } : { ok: false, status: STATUS[reason], reason, signedByKnownDevice: false };
}

export async function checkBoundary(input: BoundaryInput, deps: BoundaryDeps): Promise<BoundaryResult> {
  // 1. Canonical bytes: two encodings of one payload must never both verify.
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.payloadString);
  } catch {
    return reject('bad_schema');
  }
  let canonical: string;
  try {
    canonical = jcs(parsed);
  } catch {
    return reject('non_canonical');
  }
  if (canonical !== input.payloadString) return reject('non_canonical');

  // 2. Schema.
  const schema = capturePayloadV1.safeParse(parsed);
  if (!schema.success) return reject('bad_schema');
  const payload = schema.data;

  // 3. Device, 4. signature over the exact received string.
  const device = await deps.findDevice(payload.deviceId);
  if (!device) return reject('unknown_device');
  if (!(await verifySignature(device.publicJwk, input.payloadString, input.signature))) return reject('bad_signature');

  // 5. Revocation.
  if (device.revokedAt !== null) return reject('device_revoked', device);

  // 6. Plot assignment: the plot must be assigned to the phone's agent (a boundary rule, not a check).
  if (!(await deps.isPlotAssigned(device.agentId, payload.plotId))) return reject('plot_not_assigned', device);

  // 7. The uploaded bytes are the signed bytes, in order (S1).
  if (input.files.length !== payload.media.length) return reject('media_hash_mismatch', device);
  // The signed size must be the uploaded byte length too, so media.size never stores an unchecked claim.
  for (let i = 0; i < input.files.length; i++) {
    const bytes = new Uint8Array(await input.files[i]!.arrayBuffer());
    const signed = payload.media[i]!;
    if (bytes.length !== signed.size) return reject('media_hash_mismatch', device);
    if ((await sha256Hex(bytes)) !== signed.sha256) return reject('media_hash_mismatch', device);
  }

  return { ok: true, payload, payloadHash: await sha256Hex(input.payloadString), device };
}
