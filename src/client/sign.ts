import { jcs, sign } from '../lib/crypto';
import type { CapturePayloadV1 } from '../lib/verification/types';

// Browser side of capture (technical-plan §5.2, §9): build payload v1 from the photos' hashes, canonicalise
// (RFC 8785) and sign with the device key. Isomorphic, so it is unit-tested in Node. The hashes and MIME
// types come from hashFile when each photo is accepted (TKT-10): the MIME is the sniffed one, which the
// server checks against the bytes (TASK-20 fix round 2 removed buildAndSign, which signed `File.type`).

/** A draft whose photos were already hashed when accepted (TKT-10): Submit only canonicalises and signs. */
export type HashedDraft = {
  plotId: string;
  deviceId: string;
  seq: number;
  prevEventHash: string;
  gps: { lat: number; lng: number; accuracyM: number };
  cherryKg: number;
  media: CapturePayloadV1['media'];
};

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;

/** Build payload v1 from pre-computed photo hashes, canonicalise (RFC 8785) and sign. */
export async function signCapture(
  draft: HashedDraft,
  key: CryptoKey,
  now: () => Date = () => new Date(),
): Promise<{ payload: CapturePayloadV1; payloadString: string; signature: string }> {
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: draft.plotId,
    deviceId: draft.deviceId,
    seq: draft.seq,
    prevEventHash: draft.prevEventHash,
    capturedAt: now().toISOString(),
    gps: { lat: round(draft.gps.lat, 7), lng: round(draft.gps.lng, 7), accuracyM: round(draft.gps.accuracyM, 1) },
    cherryKg: draft.cherryKg,
    media: draft.media,
  };
  const payloadString = jcs(payload);
  return { payload, payloadString, signature: await sign(key, payloadString) };
}
