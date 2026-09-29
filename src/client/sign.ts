import { jcs, sha256Hex, sign } from '../lib/crypto';
import type { CapturePayloadV1 } from '../lib/verification/types';

// Browser side of capture (technical-plan §5.2, §9): build payload v1 from the exact photo bytes,
// canonicalise (RFC 8785) and sign with the device key. Isomorphic, so it is unit-tested in Node.

export type CaptureDraft = {
  plotId: string;
  deviceId: string;
  seq: number;
  prevEventHash: string;
  gps: { lat: number; lng: number; accuracyM: number };
  cherryKg: number;
  files: File[];
};

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;

/** A draft whose photos were already hashed when accepted (TKT-10): Submit only canonicalises and signs. */
export type HashedDraft = Omit<CaptureDraft, 'files'> & { media: CapturePayloadV1['media'] };

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

export async function buildAndSign(
  draft: CaptureDraft,
  key: CryptoKey,
  now: () => Date = () => new Date(),
): Promise<{ payload: CapturePayloadV1; payloadString: string; signature: string }> {
  const media = await Promise.all(
    draft.files.map(async (f) => ({
      sha256: await sha256Hex(new Uint8Array(await f.arrayBuffer())),
      size: f.size,
      mime: f.type || 'image/jpeg',
    })),
  );
  const { files: _files, ...rest } = draft;
  void _files;
  return signCapture({ ...rest, media }, key, now);
}
