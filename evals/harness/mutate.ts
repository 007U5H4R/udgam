import { booleanPointInPolygon, point } from '@turf/turf';
import { jcs, sha256Hex, sign } from '../../src/lib/crypto';
import { distanceToEdgeM, haversineM } from '../../src/lib/geo/distance';
import type { LatLng } from '../../src/lib/geo/types';
import type { FaultMode, ProviderFault } from '../../src/lib/remote-sensing/fixture';
import type { ProviderName } from '../../src/lib/remote-sensing/types';
import { CHECK_IDS, type CapturePayloadV1, type CheckId, type Submission, type VerifyContext } from '../../src/lib/verification/types';
import {
  buildRemoteSensing,
  FIXTURE_CROP,
  PLACEHOLDER_YIELD_REFERENCE,
  REVOKED_AT,
  SERVER_RECEIVED_AT,
  type DeviceKeys,
  type HarnessInputs,
} from './context';
import type { EvalCase, Mutation } from './dataset';
import { toLngLat, toLocal, type PlotFeature } from './fixtures';

// The mutation engine (technical-plan §22 TSK-03.4, evaluation-plan §7.3, TC-014). A case is its
// base case (recursively) plus its mutations. Mutations record *intent* (e.g. "40 m inside the
// nearest edge"), and the intent is materialised once against the case's own plot and device, so a
// base case written for P01 means the same thing on P04. Every case gets a fresh submission, context
// and provider: nothing is shared between cases, so results do not depend on order.

export class UnknownMutationOp extends Error {
  constructor(readonly op: string) {
    super(`unknown mutation op "${op}"`);
    this.name = 'UnknownMutationOp';
  }
}

/** A mutation parameter the op does not take, or a value outside the op's allowed set (§7.3). */
export class InvalidMutationParam extends TypeError {
  constructor(
    readonly op: string,
    readonly param: string,
    detail: string,
  ) {
    super(`mutation ${op}: ${detail}`);
    this.name = 'InvalidMutationParam';
  }
}

/**
 * The parameters each op takes (evaluation-plan §7.3). Any other key is a dataset typo that would
 * silently change a case's meaning, so it throws. `note` is free text and allowed on every op.
 */
const OP_PARAMS: Record<string, readonly string[]> = {
  gps_place: ['where', 'distance_m'],
  gps_accuracy: ['accuracy_m'],
  exif_gps: ['mode', 'distance_m'],
  exif_time: ['mode', 'offset_min'],
  client_clock: ['offset_from_server_min'],
  prev_event: ['distance_km', 'minutes_before', 'none'],
  reuse_media: ['from_case', 'which', 'transform'],
  chain: ['seq_delta', 'prev_hash'],
  season_cumulative: ['ratio_after_event', 'ratio_before_event'],
  photos: ['count'],
  provider_fault: ['provider', 'mode', 'cache'],
  check_throws: ['check', 'error'],
  device: ['id', 'state'],
  tamper_after_sign: ['field'],
  proof_tamper: ['target', 'field', 'variants'],
};

export type ThrowCheck = { check: CheckId; error: string };

export type BuiltCase = {
  submission: Submission;
  context: VerifyContext;
  providerFaults: ProviderFault[];
  throwCheck?: ThrowCheck;
  /** Where the engine had to adapt an intent to the fixture (reported with the case result). */
  notes: string[];
};

type Where = 'inside_centroid' | 'inside_near_edge' | 'outside_edge' | 'outside_notch';

type Draft = {
  plot: string;
  device: string;
  gps: { where: Where; distanceM?: number };
  accuracyM: number;
  exifGps: { mode: 'match' | 'absent' | 'offset'; distanceM?: number };
  exifTime: { mode: 'match' | 'absent' | 'offset'; offsetMin?: number };
  clientClockOffsetMin: number;
  prevEvent: { distanceKm: number; minutesBefore: number } | null;
  reuse: { fromCase: string; which: 'all' | 'one'; reEncode: boolean } | null;
  chain: { seqDelta: number; prevHash: 'correct' | 'stale' | 'genesis' };
  season: { after: number; before?: number } | null;
  photos: number;
  faults: ProviderFault[];
  throwCheck?: ThrowCheck;
  deviceState?: 'enrolled' | 'revoked' | 'unknown';
  tamper: string[];
  seenFrom: string[];
};

/** Accepted events on a device whose chain is not at genesis (its head is entry PRIOR). */
const PRIOR_DEVICE_EVENTS = 12;
/** agent-A's accepted entries on revoked D-A2, which re-enrolled D-A3 inherits as agent history (EVAL-021). */
const OTHER_DEVICE_EVENTS: Record<string, number> = { 'D-A3': 12 };
const DEFAULT_CHERRY_KG = 42.5;
const NEVER_ENROLLED = 'K-X';

function defaults(): Omit<Draft, 'plot' | 'device'> {
  return {
    gps: { where: 'inside_centroid' },
    accuracyM: 8,
    exifGps: { mode: 'match' },
    exifTime: { mode: 'match' },
    clientClockOffsetMin: 0,
    prevEvent: null,
    reuse: null,
    chain: { seqDelta: 0, prevHash: 'genesis' },
    season: null,
    photos: 2,
    faults: [],
    tamper: [],
    seenFrom: [],
  };
}

const num = (m: Mutation, k: string): number => {
  const v = m[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new InvalidMutationParam(m.op, k, `${k} must be a number, got ${JSON.stringify(v)}`);
  return v;
};
const oneOf = <T extends string>(m: Mutation, k: string, allowed: readonly T[]): T => {
  const v = m[k];
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new InvalidMutationParam(m.op, k, `${k} must be one of ${allowed.join(', ')}, got ${JSON.stringify(v)}`);
  }
  return v as T;
};

/** Refuse keys the op does not take (after the op itself is known). */
function checkParams(m: Mutation): void {
  const allowed = OP_PARAMS[m.op];
  if (!allowed) throw new UnknownMutationOp(m.op);
  for (const k of Object.keys(m)) {
    if (k !== 'op' && k !== 'note' && !allowed.includes(k)) throw new InvalidMutationParam(m.op, k, `unknown parameter ${k} (takes ${allowed.join(', ')})`);
  }
}

/** Apply one mutation's intent to a draft (pure: returns a new draft). */
function apply(d: Draft, m: Mutation): Draft {
  checkParams(m);
  switch (m.op) {
    case 'gps_place': {
      const where = oneOf(m, 'where', ['inside_centroid', 'inside_near_edge', 'outside_edge', 'outside_notch'] as const);
      return { ...d, gps: where === 'inside_centroid' ? { where } : { where, distanceM: num(m, 'distance_m') } };
    }
    case 'gps_accuracy':
      return { ...d, accuracyM: num(m, 'accuracy_m') };
    case 'exif_gps': {
      const mode = oneOf(m, 'mode', ['match', 'absent', 'offset'] as const);
      return { ...d, exifGps: mode === 'offset' ? { mode, distanceM: num(m, 'distance_m') } : { mode } };
    }
    case 'exif_time': {
      const mode = oneOf(m, 'mode', ['match', 'absent', 'offset'] as const);
      return { ...d, exifTime: mode === 'offset' ? { mode, offsetMin: num(m, 'offset_min') } : { mode } };
    }
    case 'client_clock':
      return { ...d, clientClockOffsetMin: num(m, 'offset_from_server_min') };
    case 'prev_event':
      if (m.none !== undefined && m.none !== true) throw new InvalidMutationParam(m.op, 'none', `none must be true when given, got ${JSON.stringify(m.none)}`);
      return { ...d, prevEvent: m.none === true ? null : { distanceKm: num(m, 'distance_km'), minutesBefore: num(m, 'minutes_before') } };
    case 'reuse_media': {
      if (typeof m.from_case !== 'string') throw new InvalidMutationParam(m.op, 'from_case', 'from_case must be a case id');
      const which = oneOf(m, 'which', ['all', 'one'] as const);
      if (m.transform !== undefined) oneOf(m, 'transform', ['re-encode'] as const);
      return { ...d, reuse: { fromCase: m.from_case, which, reEncode: m.transform === 're-encode' } };
    }
    case 'chain':
      return { ...d, chain: { seqDelta: num(m, 'seq_delta'), prevHash: oneOf(m, 'prev_hash', ['correct', 'stale', 'genesis'] as const) } };
    case 'season_cumulative':
      return {
        ...d,
        season: { after: num(m, 'ratio_after_event'), ...(m.ratio_before_event !== undefined ? { before: num(m, 'ratio_before_event') } : {}) },
      };
    case 'photos': {
      const count = num(m, 'count');
      if (!Number.isInteger(count) || count < 1 || count > 3) throw new InvalidMutationParam(m.op, 'count', `count must be 1–3, got ${count}`);
      return { ...d, photos: count };
    }
    case 'provider_fault': {
      const provider = oneOf<ProviderName>(m, 'provider', ['gfw', 'sentinel-hub']);
      const mode = oneOf<FaultMode>(m, 'mode', ['timeout', 'http_500', 'malformed']);
      // §7.3: the only cache value is `empty` (a cold cache); anything else is a typo, not "warm".
      if (m.cache !== undefined) oneOf(m, 'cache', ['empty'] as const);
      const fault: ProviderFault = { provider, mode, cacheEmpty: m.cache === 'empty' };
      return { ...d, faults: [...d.faults.filter((f) => f.provider !== provider), fault] };
    }
    case 'check_throws': {
      const check = oneOf<CheckId>(m, 'check', CHECK_IDS);
      if (typeof m.error !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(m.error)) throw new InvalidMutationParam(m.op, 'error', 'error must be an error class name');
      return { ...d, throwCheck: { check, error: m.error } };
    }
    case 'device': {
      if (m.id !== undefined && typeof m.id !== 'string') throw new InvalidMutationParam(m.op, 'id', 'id must be a device id');
      if (typeof m.id === 'string') d = { ...d, device: m.id };
      if (m.state === undefined) return d;
      const state = oneOf(m, 'state', ['enrolled', 'revoked', 'unknown', 'never_enrolled'] as const);
      return { ...d, deviceState: state === 'never_enrolled' ? 'unknown' : state };
    }
    case 'tamper_after_sign':
      if (typeof m.field !== 'string') throw new InvalidMutationParam(m.op, 'field', 'field must be a payload path');
      return { ...d, tamper: [...d.tamper, m.field] };
    case 'proof_tamper':
      throw new Error('proof_tamper belongs to the harness-proof suite (TKT-15/18), not to verifier cases');
    default:
      throw new UnknownMutationOp(m.op);
  }
}

/** The fully resolved intent of a case: its base chain's intents, then its own. */
function resolveDraft(c: EvalCase, byId: Map<string, EvalCase>, depth = 0): Draft {
  if (depth > 32) throw new Error(`base_case chain too deep at ${c.id}`);
  let base: Draft | null = null;
  if (c.input.base_case) {
    const b = byId.get(c.input.base_case);
    if (!b) throw new Error(`${c.id}: base_case ${c.input.base_case} not in the dataset`);
    base = resolveDraft(b, byId, depth + 1);
  }
  const plot = c.input.plot ?? base?.plot;
  const device = c.input.device ?? base?.device;
  if (!plot || !device) throw new Error(`${c.id}: no plot or device (directly or through base_case)`);
  let d: Draft = { ...(base ?? defaults()), plot, device, seenFrom: c.input.context?.seen_media_from ?? base?.seenFrom ?? [] };
  for (const m of c.input.mutations ?? []) d = apply(d, m);
  return d;
}

// ── Geometry ──────────────────────────────────────────────────────────────────────────────────────

type XY = [number, number];
const R = 6_371_008.8;
const rad = (x: number) => (x * Math.PI) / 180;
const deg = (x: number) => (x * 180) / Math.PI;

function centroidXY(ring: XY[]): XY {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i]!;
    const [x1, y1] = ring[i + 1]!;
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Great-circle destination (spherical, mean radius), matching haversineM. */
function destination(from: LatLng, bearingDeg: number, distM: number): LatLng {
  const d = distM / R;
  const th = rad(bearingDeg);
  const p1 = rad(from.lat);
  const l1 = rad(from.lng);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: deg(p2), lng: deg(l2) };
}

/** A point exactly `distM` away by haversineM (never a hair short, so a rounded speed is not under-reported). */
function atDistance(from: LatLng, bearingDeg: number, distM: number): LatLng {
  let t = distM;
  let p = destination(from, bearingDeg, t);
  for (let i = 0; i < 4; i++) {
    t *= distM / haversineM(from, p);
    p = destination(from, bearingDeg, t);
  }
  while (haversineM(from, p) < distM) {
    t += 1e-6;
    p = destination(from, bearingDeg, t);
  }
  return p;
}

/** Place the browser GPS point per gps_place (evaluation-plan §7.3; distance from the nearest edge). */
function placeGps(f: PlotFeature, gps: Draft['gps'], notes: string[]): LatLng {
  const anchor = f.properties.anchor;
  const poly = f.geometry;
  const ring = poly.coordinates[0]!.map((p) => toLocal(anchor, p));
  const toLL = (xy: XY): LatLng => {
    const [lng, lat] = toLngLat(anchor, xy) as [number, number];
    return { lat, lng };
  };
  const isInside = (ll: LatLng, g = poly) => booleanPointInPolygon(point([ll.lng, ll.lat]), g);

  if (gps.where === 'inside_centroid') {
    const ll = toLL(centroidXY(ring));
    if (!isInside(ll)) throw new Error(`${f.properties.id}: centroid is not inside the plot`);
    return ll;
  }
  const d = gps.distanceM;
  if (d === undefined || d <= 0) throw new TypeError(`gps_place ${gps.where}: distance_m must be > 0`);

  let start: XY;
  let dir: XY;
  let slope = 1; // d(distance to edge)/d(t) along dir
  if (gps.where === 'outside_notch') {
    const { notch, notchEdge } = f.properties;
    if (!notch || notchEdge === undefined) throw new Error(`gps_place outside_notch: plot ${f.properties.id} has no notch`);
    const corner = ring[notchEdge + 1]!;
    const nc = centroidXY(notch.coordinates[0]!.map((p) => toLocal(anchor, p)));
    const len = Math.hypot(nc[0] - corner[0], nc[1] - corner[1]);
    start = corner;
    dir = [(nc[0] - corner[0]) / len, (nc[1] - corner[1]) / len];
    slope = Math.SQRT1_2;
  } else {
    const i = gps.where === 'inside_near_edge' ? (f.properties.notchEdge ?? f.properties.anchorEdge) : f.properties.anchorEdge;
    const a = ring[i]!;
    const b = ring[i + 1]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const outward: XY = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len]; // right of a→b is outside a CCW ring
    start = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    dir = gps.where === 'inside_near_edge' ? [-outward[0], -outward[1]] : outward;
  }

  let t = d / slope;
  let ll = toLL([start[0] + dir[0] * t, start[1] + dir[1] * t]);
  let got = distanceToEdgeM(ll, poly);
  for (let k = 0; k < 40 && Math.abs(got - d) > 0.005; k++) {
    t *= d / got;
    ll = toLL([start[0] + dir[0] * t, start[1] + dir[1] * t]);
    got = distanceToEdgeM(ll, poly);
  }
  const wantInside = gps.where === 'inside_near_edge';
  if (wantInside && Math.abs(got - d) > 0.05) {
    // The plot is too small to be `d` metres inside anywhere on this ray (e.g. EVAL-013 inherits
    // EVAL-002's 40 m on 0.6 ha P02). Keep the intent — inside, as far from the edge as the plot
    // allows — and say so in the case notes.
    let best = { t: 0, got: 0, ll };
    for (let k = 1; k <= 400; k++) {
      const tk = (k / 400) * 2 * d;
      const p = toLL([start[0] + dir[0] * tk, start[1] + dir[1] * tk]);
      if (!isInside(p)) break;
      const g = distanceToEdgeM(p, poly);
      if (g > best.got) best = { t: tk, got: g, ll: p };
    }
    if (best.got < d) {
      notes.push(`gps_place inside_near_edge ${d} m is deeper than ${f.properties.id} allows on its edge ray; placed ${Math.round(best.got)} m inside instead`);
      return best.ll;
    }
  }
  if (Math.abs(got - d) > 0.05 || isInside(ll) !== wantInside) {
    throw new Error(`gps_place ${gps.where} ${d} m on ${f.properties.id}: got ${got.toFixed(2)} m, inside=${isInside(ll)}`);
  }
  if (gps.where === 'outside_notch' && !isInside(ll, f.properties.notch!)) throw new Error(`gps_place outside_notch: point left the notch of ${f.properties.id}`);
  return ll;
}

// ── Materialise ───────────────────────────────────────────────────────────────────────────────────

const addMinutes = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();
const round1 = (x: number) => Math.round(x * 10) / 10;
const photoHash = (caseId: string, i: number, reEncoded = false) => sha256Hex(`harness/${caseId}/photo/${i}${reEncoded ? '/re-encoded' : ''}`);
const eventHash = (deviceId: string, n: number) => sha256Hex(`harness/${deviceId}/event/${n}`);

function tamper(payload: CapturePayloadV1, field: string): CapturePayloadV1 {
  const out = structuredClone(payload) as unknown as Record<string, unknown>;
  const path = field.split('.');
  let parent: Record<string, unknown> = out;
  for (const k of path.slice(0, -1)) {
    const next = parent[k];
    if (next === null || typeof next !== 'object') throw new TypeError(`tamper_after_sign: no field ${field}`);
    parent = next as Record<string, unknown>;
  }
  const key = path[path.length - 1]!;
  const v = parent[key];
  if (typeof v === 'number') parent[key] = key === 'lat' || key === 'lng' ? Math.round((v + 0.001) * 1e7) / 1e7 : v + 1;
  else if (typeof v === 'string') parent[key] = /^[0-9a-f]{64}$/.test(v) ? `${v.slice(0, -1)}${v.endsWith('0') ? '1' : '0'}` : `${v}-tampered`;
  else throw new TypeError(`tamper_after_sign: ${field} is not a number or string`);
  return out as unknown as CapturePayloadV1;
}

/**
 * Build one case's (Submission, VerifyContext) from its plot fixture, device, base case and mutations.
 * Pure per case: reads the dataset, fixtures and per-run keys, and shares nothing between calls.
 */
export async function buildCase(c: EvalCase, ds: HarnessInputs, keys: DeviceKeys): Promise<BuiltCase> {
  const byId = new Map(ds.dataset.cases.map((x) => [x.id, x]));
  byId.set(c.id, c);
  const d = resolveDraft(c, byId);

  const feature = ds.plots[d.plot];
  const spec = ds.dataset.fixtures.plots.find((p) => p.id === d.plot);
  if (!feature || !spec) throw new Error(`${c.id}: no fixture for plot ${d.plot}`);
  const deviceSpec = ds.dataset.fixtures.devices.find((x) => x.id === d.device);
  if (!deviceSpec) throw new Error(`${c.id}: no device ${d.device} in the dataset fixtures`);
  if (deviceSpec.state === 'never_enrolled') {
    throw new Error(`${c.id}: ${d.device} is never enrolled; the capture boundary refuses it before verify() (integration suite)`);
  }
  const signer = d.deviceState === 'unknown' ? NEVER_ENROLLED : d.device;
  const deviceKey = keys[d.device];
  const signerKey = keys[signer];
  if (!deviceKey || !signerKey) throw new Error(`${c.id}: no key for ${signer}`);

  // Where and when.
  const notes: string[] = [];
  const at = placeGps(feature, d.gps, notes);
  const serverReceivedAt = SERVER_RECEIVED_AT;
  const capturedAt = addMinutes(serverReceivedAt, d.clientClockOffsetMin);

  // Chain position (TP10): genesis = a fresh device chain; otherwise the device head is entry PRIOR.
  const genesis = d.chain.prevHash === 'genesis';
  const lastSeq = genesis ? 0 : PRIOR_DEVICE_EVENTS;
  const lastEventHash = genesis ? null : await eventHash(d.device, PRIOR_DEVICE_EVENTS);
  const seq = genesis ? 1 + d.chain.seqDelta : lastSeq + d.chain.seqDelta;
  let prevEventHash: string;
  if (genesis) prevEventHash = 'genesis';
  else if (d.chain.prevHash === 'correct') prevEventHash = lastEventHash!;
  else prevEventHash = await eventHash(d.device, Math.max(0, Math.min(seq - 1, PRIOR_DEVICE_EVENTS - 1)));

  // Photos: fresh per case, or reused from another case (reuse_media), and what the server has seen.
  const hashesOf = async (caseId: string, n: number, reEncoded = false) => Promise.all(Array.from({ length: n }, (_, i) => photoHash(caseId, i, reEncoded)));
  const photosOf = (caseId: string) => {
    const src = byId.get(caseId);
    if (!src) throw new Error(`${c.id}: reuse_media from ${caseId}, which is not in the dataset`);
    return resolveDraft(src, byId).photos;
  };
  const hashes = await hashesOf(c.id, d.photos);
  if (d.reuse) {
    const src = await hashesOf(d.reuse.fromCase, photosOf(d.reuse.fromCase), d.reuse.reEncode);
    const n = d.reuse.which === 'all' ? Math.min(hashes.length, src.length) : 1;
    for (let i = 0; i < n; i++) hashes[i] = src[i]!;
  }
  const seen = new Set<string>();
  for (const id of d.seenFrom) for (const h of await hashesOf(id, photosOf(id))) seen.add(h);
  const seenMediaHashes = new Set(hashes.filter((h) => seen.has(h)));

  // EXIF on every photo, relative to the browser GPS and the client time.
  const exifGps: LatLng | null =
    d.exifGps.mode === 'absent' ? null : d.exifGps.mode === 'match' ? { lat: at.lat, lng: at.lng } : atDistance(at, 90, d.exifGps.distanceM!);
  const takenAt = d.exifTime.mode === 'absent' ? null : d.exifTime.mode === 'match' ? capturedAt : addMinutes(capturedAt, d.exifTime.offsetMin!);

  // Season yield (TP6): s = cumulative kg × ratio ÷ area ÷ maxKgHa; solve the kg before this event.
  const yieldReference = { ...PLACEHOLDER_YIELD_REFERENCE };
  const kgPerU = (yieldReference.maxKgHa * spec.area_ha) / yieldReference.cherryToCleanRatio;
  let cherryKg = DEFAULT_CHERRY_KG;
  let seasonCherryKgBefore = 0;
  if (d.season) {
    if (d.season.before !== undefined) cherryKg = Math.round((d.season.after - d.season.before) * kgPerU * 2) / 2;
    seasonCherryKgBefore = d.season.after * kgPerU - cherryKg;
    if (cherryKg < 0.5 || seasonCherryKgBefore < 0) throw new Error(`${c.id}: season_cumulative ${JSON.stringify(d.season)} is not reachable on ${d.plot}`);
  }

  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: d.plot,
    deviceId: d.device,
    seq,
    prevEventHash,
    capturedAt,
    gps: { lat: at.lat, lng: at.lng, accuracyM: round1(d.accuracyM) },
    cherryKg,
    media: hashes.map((sha256, i) => ({ sha256, size: 2_400_000 + 37_000 * i, mime: 'image/jpeg' })),
  };
  const signature = await sign(signerKey.pair.privateKey, jcs(payload));
  const finalPayload = d.tamper.reduce(tamper, payload);

  const submission: Submission = {
    payload: finalPayload,
    payloadHash: await sha256Hex(jcs(finalPayload)),
    signature,
    media: finalPayload.media.map((m) => ({ sha256: m.sha256, exif: { gps: exifGps ? { ...exifGps } : null, takenAt } })),
    serverReceivedAt,
  };

  const revoked = deviceSpec.state === 'revoked' || d.deviceState === 'revoked';
  const previousEvent = d.prevEvent
    ? { ...atDistance(at, 0, d.prevEvent.distanceKm * 1000), capturedAt: addMinutes(capturedAt, -d.prevEvent.minutesBefore) }
    : null;
  const providerFaults = d.faults.map((f) => ({ ...f }));
  const context: VerifyContext = {
    device: { id: d.device, publicJwk: deviceKey.publicJwk, revokedAt: revoked ? REVOKED_AT : null, lastSeq, lastEventHash },
    agentPriorAcceptedEvents: lastSeq + (OTHER_DEVICE_EVENTS[d.device] ?? 0),
    previousEvent,
    plot: { id: d.plot, crop: FIXTURE_CROP, polygon: structuredClone(feature.geometry), areaHa: spec.area_ha },
    seenMediaHashes,
    seasonCherryKgBefore,
    yieldReference,
    remoteSensing: buildRemoteSensing(ds.profiles, providerFaults),
  };

  return { submission, context, providerFaults, notes, ...(d.throwCheck ? { throwCheck: { ...d.throwCheck } } : {}) };
}
