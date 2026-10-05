import { jcs, sha256Hex, sign } from '../../src/lib/crypto';
import type { CapturePayloadV1 } from '../../src/lib/verification/types';
import { demoPhoto, SLOTS } from './photos';

// A phone's capture, built the way the capture app builds it (technical-plan §5.2, §3.1): photos with
// EXIF, the payload naming each photo's SHA-256, its RFC 8785 form signed with the phone's key, and the
// multipart form /api/capture reads. Used by the seed's history and the staged attacks.

const MIN = 60_000;
const r7 = (n: number): number => Math.round(n * 1e7) / 1e7;

export type Signer = { deviceId: string; agentId: string; privateKey: CryptoKey; nextSeq: number; lastEventHash: string };

/** A signed capture as the phone builds it (§5.2): payload, signature and the photo files. */
export async function signedCapture(
  signer: Signer,
  o: { plotId: string; capturedAt: string; gps: { lat: number; lng: number; accuracyM: number }; cherryKg: number; photos: Uint8Array<ArrayBuffer>[] },
): Promise<{ payload: CapturePayloadV1; payloadString: string; signature: string; payloadHash: string }> {
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: o.plotId,
    deviceId: signer.deviceId,
    seq: signer.nextSeq,
    prevEventHash: signer.lastEventHash,
    capturedAt: o.capturedAt,
    gps: o.gps,
    cherryKg: o.cherryKg,
    media: await Promise.all(o.photos.map(async (b) => ({ sha256: await sha256Hex(b), size: b.length, mime: 'image/jpeg' }))),
  };
  const payloadString = jcs(payload);
  return { payload, payloadString, signature: await sign(signer.privateKey, payloadString), payloadHash: await sha256Hex(payloadString) };
}

/** The multipart form /api/capture reads: payload, signature, photo0..photoN. */
export function captureForm(c: { payloadString: string; signature: string }, photos: Uint8Array<ArrayBuffer>[]): FormData {
  const fd = new FormData();
  fd.set('payload', c.payloadString);
  fd.set('signature', c.signature);
  photos.forEach((b, i) => fd.set(`photo${i}`, new File([b], `photo${i}.jpg`, { type: 'image/jpeg' })));
  return fd;
}

/** Photos for one capture: one per slot in screen order, EXIF a few metres and minutes from the capture. */
export function photosFor(o: { count: 1 | 2 | 3; at: string; gps: { lat: number; lng: number }; variant: number; label: string }): Promise<Uint8Array<ArrayBuffer>[]> {
  const exifGps = { lat: r7(o.gps.lat + 3 / 111_195), lng: o.gps.lng }; // 3 m north of the phone's fix
  return Promise.all(
    SLOTS.slice(0, o.count).map((slot, k) =>
      demoPhoto({ slot, variant: o.variant + k, gps: exifGps, takenAt: new Date(Date.parse(o.at) - (1 + k) * MIN).toISOString(), label: `${o.label}-${slot}` }),
    ),
  );
}

