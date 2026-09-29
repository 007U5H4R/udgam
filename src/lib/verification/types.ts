import type { LatLng, PlotPolygon } from '../geo/types';
import type { RemoteSensingProvider } from '../remote-sensing/types';

// The verification contract (technical-plan §6.1, Solution-PRD §4.1). Later tickets add checks, not shapes.

/** The twelve checks, in registry order (§6.3). */
export const CHECK_IDS = [
  'signature_valid',
  'chain_continuity',
  'photo_uniqueness',
  'geofence',
  'gps_accuracy',
  'exif_gps_agreement',
  'exif_time_agreement',
  'movement_plausibility',
  'deforestation_overlap',
  'ndvi_cultivation',
  'ndvi_harvest_window',
  'yield_plausibility',
] as const;
export type CheckId = (typeof CHECK_IDS)[number];

export type CheckStatus = 'ok' | 'flag' | 'fail' | 'unavailable';
export type Provider = 'gfw' | 'sentinel-hub';

export type CheckResult = {
  id: CheckId;
  status: CheckStatus;
  score: number;
  weight: number;
  hardFail: boolean;
  evidence: string;
  provider?: Provider;
};

export type Verdict = 'Verified' | 'Needs Review' | 'Rejected';

export type VerifyResult = {
  verdict: Verdict;
  score: number;
  checks: CheckResult[];
  unavailableProviders: string[];
  capReasons: string[];
  config: { version: string; hash: string };
};

/** Capture payload v1: the exact object the phone signs (§5.2). */
export type CapturePayloadV1 = {
  v: 1;
  plotId: string;
  deviceId: string;
  seq: number;
  prevEventHash: string;
  capturedAt: string;
  gps: { lat: number; lng: number; accuracyM: number };
  cherryKg: number;
  media: { sha256: string; size: number; mime: string }[];
};

/** What the server read from a photo's EXIF (TKT-08 fills it; TP25 reads a zone-less time as IST). */
export type ExifFacts = { gps: LatLng | null; takenAt: string | null };

export type Submission = {
  payload: CapturePayloadV1;
  payloadHash: string;
  signature: string;
  media: { sha256: string; exif: ExifFacts }[];
  serverReceivedAt: string;
};

export type VerifyContext = {
  device: { id: string; publicJwk: JsonWebKey; revokedAt: string | null; lastSeq: number; lastEventHash: string | null };
  /** On any device (TP10). */
  agentPriorAcceptedEvents: number;
  /** This device's last accepted event. */
  previousEvent: { lat: number; lng: number; capturedAt: string } | null;
  /**
   * `historyEndMonth` (TKT-07): the month (YYYY-MM) the plot's registration checks read its 12-month NDVI
   * history to — the NDVI-history cache bucket (§7) — so a capture reuses that answer. Absent (never
   * registered, or the harness): the capture month in IST.
   */
  plot: { id: string; crop: 'arabica' | 'robusta'; polygon: PlotPolygon; areaHa: number; historyEndMonth?: string };
  /** The subset of this submission's hashes already in `media` for accepted events. */
  seenMediaHashes: Set<string>;
  /** TP6: this plot's accepted, non-Rejected cherry kg in the season, before this capture. */
  seasonCherryKgBefore: number;
  /** TP6: the crop's reference row; null when none is seeded (yield_plausibility → unavailable). */
  yieldReference: { maxKgHa: number; cherryToCleanRatio: number; source: string } | null;
  /** Cache-wrapped (§7). */
  remoteSensing: RemoteSensingProvider;
};

export type VerifyOptions = { enabled?: CheckId[]; onCheck?: (r: CheckResult) => void };
