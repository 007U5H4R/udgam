import { generateKeyPair, jcs, sha256Hex, sign } from '../../src/lib/crypto';
import type { Polygon } from '../../src/lib/geo/types';
import { buildProfile } from '../../evals/fixtures/remote-sensing/profiles';
import { createFixtureProvider } from '../../src/lib/remote-sensing/fixture';
import type { RemoteSensingProvider } from '../../src/lib/remote-sensing/types';
import type { CapturePayloadV1, Submission, VerifyContext } from '../../src/lib/verification/types';

// Hand-built submissions and contexts for verification unit tests. A ~2 ha rectangle near Madikeri
// with axis-aligned edges, so a point due north of the top edge's midpoint is its meridian distance out.
export const LAT = 12.42;
export const LNG = 75.74;
const DY = 0.00064;
const DX = 0.00065;
export const PLOT: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [LNG - DX, LAT - DY],
      [LNG + DX, LAT - DY],
      [LNG + DX, LAT + DY],
      [LNG - DX, LAT + DY],
      [LNG - DX, LAT - DY],
    ],
  ],
};
const M_PER_DEG = 111_195.08;
export const CENTRE = { lat: LAT, lng: LNG };
/** A point `m` metres north of the plot's top edge (negative = inside, south of it). */
export const northOfTop = (m: number) => ({ lat: LAT + DY + m / M_PER_DEG, lng: LNG });

export const noRemoteSensing: RemoteSensingProvider = {
  name: 'fixture',
  forestLoss: () => Promise.reject(new Error('remote sensing not used in this test')),
  ndviHistory: () => Promise.reject(new Error('remote sensing not used in this test')),
  ndviWindow: () => Promise.reject(new Error('remote sensing not used in this test')),
};

/**
 * The default for makeContext (TKT-07): an honest plot's satellite answers (no forest loss, perennial
 * canopy, living canopy around the picking), so a test about other checks is not capped by remote ones.
 */
export const honestRemoteSensing: RemoteSensingProvider = createFixtureProvider({
  profiles: {},
  fallback: buildProfile({ plotId: 'PL-TEST', areaHa: 2, lossPct: 0, history: 'perennial_canopy', window: 'living_canopy' }),
});

export type TestDevice = { id: string; pair: CryptoKeyPair; publicJwk: JsonWebKey };

export async function makeDevice(id = 'DV-TEST0001'): Promise<TestDevice> {
  const pair = await generateKeyPair(false);
  return { id, pair, publicJwk: await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey) };
}

export const photoHash = (n: number) => (n.toString(16).padStart(2, '0')).repeat(32);

export type SubmissionInput = {
  device: TestDevice;
  gps?: { lat: number; lng: number; accuracyM: number };
  cherryKg?: number;
  mediaHashes?: string[];
  seq?: number;
  prevEventHash?: string;
  capturedAt?: string;
  plotId?: string;
};

export async function makePayload(i: SubmissionInput): Promise<CapturePayloadV1> {
  return {
    v: 1,
    plotId: i.plotId ?? 'PL-TEST',
    deviceId: i.device.id,
    seq: i.seq ?? 1,
    prevEventHash: i.prevEventHash ?? 'genesis',
    capturedAt: i.capturedAt ?? '2026-10-14T04:12:33.120Z',
    gps: i.gps ?? { ...CENTRE, accuracyM: 8 },
    cherryKg: i.cherryKg ?? 42.5,
    media: (i.mediaHashes ?? [photoHash(1), photoHash(2)]).map((sha256, k) => ({ sha256, size: 1000 + k, mime: 'image/jpeg' })),
  };
}

/** A submission signed by the device over jcs(payload). */
export async function makeSubmission(i: SubmissionInput): Promise<Submission> {
  const payload = await makePayload(i);
  const payloadString = jcs(payload);
  return {
    payload,
    payloadHash: await sha256Hex(payloadString),
    signature: await sign(i.device.pair.privateKey, payloadString),
    media: payload.media.map((m) => ({ sha256: m.sha256, exif: { gps: null, takenAt: null } })),
    serverReceivedAt: '2026-10-14T04:12:34.000Z',
  };
}

export function makeContext(device: TestDevice, over: Partial<VerifyContext> = {}): VerifyContext {
  return {
    device: { id: device.id, publicJwk: device.publicJwk, revokedAt: null, lastSeq: 0, lastEventHash: null },
    agentPriorAcceptedEvents: 0,
    previousEvent: null,
    plot: { id: 'PL-TEST', crop: 'arabica', polygon: PLOT, areaHa: 2 },
    seenMediaHashes: new Set(),
    seasonCherryKgBefore: 0,
    yieldReference: { maxKgHa: 783, cherryToCleanRatio: 1 / 6, source: 'placeholder' },
    remoteSensing: honestRemoteSensing,
    ...over,
  };
}
