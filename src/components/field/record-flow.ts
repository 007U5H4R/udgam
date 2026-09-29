import type { VerdictView } from '../../client/capture-client';
import type { CheckId, CheckStatus } from '../../lib/verification/types';

// The record flow as a pure state machine (TSK-10.6): photos → review → weight → checking → verdict,
// or → saved when the send could not finish. No browser APIs: the screens dispatch actions and do the
// side effects (camera input, hashing, signing, the NDJSON stream).

export type Slot = 0 | 1 | 2;
export type FlowPhoto = { slot: Slot; file?: File; sha256?: string; size?: number; mime?: string };

export type FlowState = {
  step: 'photos' | 'review' | 'weight' | 'checking' | 'verdict' | 'saved';
  plotId: string;
  photos: FlowPhoto[];
  /** The slot on the review screen. */
  reviewing?: Slot;
  /** The slot whose photo "Take again" dropped (the screen reopens its camera input). */
  retakeSlot?: Slot;
  /** "At least 1 photo is needed." */
  needOne?: boolean;
  kg: string;
  checks: Map<CheckId, CheckStatus>;
  result?: VerdictView;
  error?: { kind: 'offline' | 'server' | 'rejected'; reason?: string; retryAfterSec?: number };
};

export type FlowAction =
  | { type: 'take'; slot: Slot; file: File }
  | { type: 'use'; sha256: string; size: number; mime: string }
  | { type: 'retake' }
  | { type: 'continue' }
  | { type: 'key'; k: string }
  | { type: 'send' }
  | { type: 'check'; id: CheckId; status: CheckStatus }
  | { type: 'verdict'; v: VerdictView }
  | { type: 'fail'; kind: 'offline' | 'server' | 'rejected'; reason?: string; retryAfterSec?: number }
  | { type: 'back' };

export const MAX_KG = 500;

export function initialFlow(plotId: string): FlowState {
  return { step: 'photos', plotId, photos: [{ slot: 0 }, { slot: 1 }, { slot: 2 }], kg: '', checks: new Map() };
}

/** The photos accepted with "Use this photo" (hashed), in slot order: what the payload signs. */
export const usedPhotos = (s: FlowState): Required<FlowPhoto>[] => s.photos.filter((p): p is Required<FlowPhoto> => p.sha256 !== undefined && p.file !== undefined);

/** The kg the Send pill carries, or null when nothing sendable is typed. */
export function kgValue(kg: string): number | null {
  const v = Number(kg);
  return kg !== '' && Number.isFinite(v) && v > 0 && v <= MAX_KG ? v : null;
}

const withPhoto = (photos: FlowPhoto[], slot: Slot, p: FlowPhoto) => photos.map((x) => (x.slot === slot ? p : x));

/** The weight keypad: digits, '.', '⌫'; one decimal that is .0 or .5 (cherryKg is a multiple of 0.5), at most 500. */
function typeKey(kg: string, k: string): string {
  if (k === '⌫') return kg.slice(0, -1);
  if (k === '.') return kg.includes('.') ? kg : `${kg || '0'}.`;
  if (!/^\d$/.test(k)) return kg;
  let next: string;
  if (kg.includes('.')) {
    if (kg.split('.')[1] !== '' || (k !== '0' && k !== '5')) return kg;
    next = kg + k;
  } else {
    next = kg === '0' ? k : kg + k;
  }
  return Number(next) > MAX_KG ? kg : next;
}

export function reduce(s: FlowState, a: FlowAction): FlowState {
  switch (a.type) {
    case 'take':
      if (s.step !== 'photos') return s;
      return { ...s, step: 'review', reviewing: a.slot, retakeSlot: undefined, needOne: false, photos: withPhoto(s.photos, a.slot, { slot: a.slot, file: a.file }) };
    case 'use': {
      if (s.step !== 'review' || s.reviewing === undefined) return s;
      const slot = s.reviewing;
      const current = s.photos[slot]!;
      const photos = withPhoto(s.photos, slot, { ...current, sha256: a.sha256, size: a.size, mime: a.mime });
      const next = { ...s, photos, reviewing: undefined };
      return { ...next, step: usedPhotos(next).length === 3 ? 'weight' : 'photos' };
    }
    case 'retake':
      if (s.step !== 'review' || s.reviewing === undefined) return s;
      return { ...s, step: 'photos', retakeSlot: s.reviewing, reviewing: undefined, photos: withPhoto(s.photos, s.reviewing, { slot: s.reviewing }) };
    case 'continue':
      if (s.step !== 'photos') return s;
      return usedPhotos(s).length === 0 ? { ...s, needOne: true } : { ...s, step: 'weight', needOne: false };
    case 'key':
      if (s.step !== 'weight') return s;
      return { ...s, kg: typeKey(s.kg, a.k) };
    case 'send':
      if ((s.step !== 'weight' && s.step !== 'saved') || kgValue(s.kg) === null || usedPhotos(s).length === 0) return s;
      return { ...s, step: 'checking', checks: new Map(), result: undefined, error: undefined };
    case 'check': {
      if (s.step !== 'checking') return s;
      const checks = new Map(s.checks);
      checks.set(a.id, a.status);
      return { ...s, checks };
    }
    case 'verdict':
      if (s.step !== 'checking') return s;
      return { ...s, step: 'verdict', result: a.v };
    case 'fail':
      if (s.step !== 'checking') return s;
      return {
        ...s,
        step: a.kind === 'rejected' ? 'verdict' : 'saved',
        error: { kind: a.kind, ...(a.reason !== undefined ? { reason: a.reason } : {}), ...(a.retryAfterSec !== undefined ? { retryAfterSec: a.retryAfterSec } : {}) },
      };
    case 'back':
      if (s.step === 'weight') return { ...s, step: 'photos' };
      if (s.step === 'review' && s.reviewing !== undefined) return { ...s, step: 'photos', reviewing: undefined, photos: withPhoto(s.photos, s.reviewing, { slot: s.reviewing }) };
      return s;
  }
}
