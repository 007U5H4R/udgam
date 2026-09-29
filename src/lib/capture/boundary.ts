import { jcs, sha256Hex, verify as verifySignature } from '../crypto';
import type { CapturePayloadV1 } from '../verification/types';
import { capturePayloadV1 } from './payload';

// The capture boundary (technical-plan §3.1 step 2, Review focus 1–2). Order matters:
// canonical form → schema → device → signature over the RECEIVED bytes (authenticate) → revocation →
// plot assignment (§6.4, TP5) → media sizes and hashes. A failure is a 4xx. Once the signature has
// verified, the pipeline anchors the refusal as a rejected harvest_event (Solution-PRD §7 rule 2); an
// unsigned or garbled request (non_canonical, bad_schema, unknown_device, bad_signature) is only logged
// (TSK-19.4). The signature is checked before revocation so that only the phone's own key can learn (or
// be recorded as) a revoked or unassigned phone. The cheaper upload checks (count, size, magic bytes)
// run earlier, in parse.ts (TSK-19.2).

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
  | 'media_hash_mismatch'
  | 'media_count'
  | 'media_too_large'
  | 'media_type';

export type BoundaryStatus = 400 | 401 | 403 | 409 | 413 | 415;

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
      status: BoundaryStatus;
      reason: BoundaryReason;
      /** True when an enrolled device's key verified the signature (the rejection can name the device). */
      signedByKnownDevice: boolean;
      /** The device, once its signature has verified. */
      device?: BoundaryDevice;
    };

export const STATUS: Record<BoundaryReason, BoundaryStatus> = {
  non_canonical: 400,
  bad_schema: 400,
  unknown_device: 401,
  bad_signature: 401,
  device_revoked: 403,
  plot_not_assigned: 403,
  media_hash_mismatch: 409,
  media_count: 400,
  media_too_large: 413,
  media_type: 415,
};

const unsigned = (reason: BoundaryReason) => ({ ok: false as const, status: STATUS[reason], reason, signedByKnownDevice: false as const });

/** A refusal after the device's key verified the signature: attributable, so the pipeline anchors it. */
function reject(reason: BoundaryReason, device: BoundaryDevice): Extract<BoundaryResult, { ok: false }> {
  return { ok: false, status: STATUS[reason], reason, signedByKnownDevice: true, device };
}

export type AuthResult =
  | { ok: true; payload: CapturePayloadV1; payloadHash: string; device: BoundaryDevice }
  | (Extract<BoundaryResult, { ok: false }> & { signedByKnownDevice: false });

/**
 * Steps 1–4: canonical bytes, schema, the enrolled device and its signature over the exact received
 * string. Success means the payload is attributable to that device's key; nothing else is checked.
 */
export async function authenticate(input: Pick<BoundaryInput, 'payloadString' | 'signature'>, deps: Pick<BoundaryDeps, 'findDevice'>): Promise<AuthResult> {
  // 1. Canonical bytes: two encodings of one payload must never both verify.
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.payloadString);
  } catch {
    return unsigned('bad_schema');
  }
  let canonical: string;
  try {
    canonical = jcs(parsed);
  } catch {
    return unsigned('non_canonical');
  }
  if (canonical !== input.payloadString) return unsigned('non_canonical');

  // 2. Schema.
  const schema = capturePayloadV1.safeParse(parsed);
  if (!schema.success) return unsigned('bad_schema');
  const payload = schema.data;

  // 3. Device, 4. signature over the exact received string.
  const device = await deps.findDevice(payload.deviceId);
  if (!device) return unsigned('unknown_device');
  if (!(await verifySignature(device.publicJwk, input.payloadString, input.signature))) return unsigned('bad_signature');
  return { ok: true, payload, payloadHash: await sha256Hex(input.payloadString), device };
}

export async function checkBoundary(input: BoundaryInput, deps: BoundaryDeps): Promise<BoundaryResult> {
  const auth = await authenticate(input, deps);
  if (!auth.ok) return auth;
  const { payload, payloadHash, device } = auth;

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

  return { ok: true, payload, payloadHash, device };
}
