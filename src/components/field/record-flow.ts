import type { VerdictView } from '../../client/capture-client';
import { MAX_PHOTO_BYTES } from '../../lib/capture/limits';
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
  /** Why the reviewed photo cannot be used (TASK-11 fix round 1): not a camera JPEG/HEIC, too large, or unreadable. */
  photoError?: PhotoProblem;
  kg: string;
  /** DES-019: the last key was refused (a third decimal, a decimal other than .0/.5, over 500): the screen says the rule. */
  kgRefused?: boolean;
  checks: Map<CheckId, CheckStatus>;
  result?: VerdictView;
  /** `again`: this failure followed a Try again (DES-006: "Still no network"). */
  error?: FlowError;
  /** DES-006: a Try again is running and no check has arrived yet: the saved sheet it came from stays up, busy. */
  retry?: FlowError;
  /** How many times Send or Try again ran. */
  sends?: number;
};

export type FlowError = { kind: 'offline' | 'server' | 'rejected'; reason?: string; retryAfterSec?: number; again?: boolean };

export type PhotoProblem = 'type' | 'size' | 'read';

export type FlowAction =
  | { type: 'take'; slot: Slot; file: File }
  /** "Use this photo": the hash of `file` in `slot` (ignored if the screen has moved on to another photo). */
  | { type: 'use'; slot: Slot; file: File; sha256: string; size: number; mime: string }
  /** "Use this photo" found a photo the server would refuse, or could not read it. */
  | { type: 'refuse'; slot: Slot; file: File; why: PhotoProblem }
  | { type: 'retake' }
  | { type: 'continue' }
  | { type: 'key'; k: string }
  | { type: 'send' }
  | { type: 'check'; id: CheckId; status: CheckStatus }
  | { type: 'verdict'; v: VerdictView }
  | { type: 'fail'; kind: 'offline' | 'server' | 'rejected'; reason?: string; retryAfterSec?: number }
  | { type: 'back' };

export const MAX_KG = 500;

/** The camera types the capture boundary takes, as sniffed from the bytes (lib/media/sniff). */
const CAMERA_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/heic']);

/** Why the server would refuse this photo (415 / 413), or null: never sign a photo it will refuse. */
export function photoProblem(h: { mime: string; size: number }): 'type' | 'size' | null {
  if (!CAMERA_TYPES.has(h.mime)) return 'type';
  return h.size > MAX_PHOTO_BYTES ? 'size' : null;
}

/** Is `slot` / `file` still the photo on the review screen? */
const isReviewing = (s: FlowState, slot: Slot, file: File) => s.step === 'review' && s.reviewing === slot && s.photos[slot]?.file === file;

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

/**
 * DES-019: a weight far from the farmer's own last pickings (more than twice the most, or under half the
 * least) is likely mistyped (425 for 42.5): the screen asks to check it before sending. Never without a range.
 */
export function kgOutOfRange(kg: number | null, range: { min: number; max: number } | null): boolean {
  if (kg === null || range === null) return false;
  return kg > range.max * 2 || kg < range.min / 2;
}

export type KgLine = 'rule' | 'check' | 'hint';

/**
 * What the weight screen says under the number, and the Send pill's label. DES-019: a refused key says the
 * half-kilo rule; a weight far from the farmer's range says so and the pill asks "Yes, send …". DES-028: the
 * "Yes, send" label never shows without its reason, so a refused key on an unlikely weight shows both lines.
 */
export function kgPrompt(
  kg: string,
  refused: boolean,
  range: { min: number; max: number } | null,
): { lines: KgLine[]; warn: boolean; pill: 'type' | 'send' | 'sendCheck' } {
  const value = kgValue(kg);
  const unlikely = kgOutOfRange(value, range);
  const lines: KgLine[] = [];
  if (refused) lines.push('rule');
  if (unlikely) lines.push('check');
  else if (!refused && range) lines.push('hint');
  return { lines, warn: refused || unlikely, pill: value === null ? 'type' : unlikely ? 'sendCheck' : 'send' };
}

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
      return {
        ...s,
        step: 'review',
        reviewing: a.slot,
        retakeSlot: undefined,
        needOne: false,
        photoError: undefined,
        photos: withPhoto(s.photos, a.slot, { slot: a.slot, file: a.file }),
      };
    case 'use': {
      if (!isReviewing(s, a.slot, a.file)) return s;
      const photos = withPhoto(s.photos, a.slot, { slot: a.slot, file: a.file, sha256: a.sha256, size: a.size, mime: a.mime });
      const next = { ...s, photos, reviewing: undefined, photoError: undefined };
      return { ...next, step: usedPhotos(next).length === 3 ? 'weight' : 'photos' };
    }
    case 'refuse':
      if (!isReviewing(s, a.slot, a.file)) return s;
      return { ...s, photoError: a.why };
    case 'retake':
      if (s.step !== 'review' || s.reviewing === undefined) return s;
      return {
        ...s,
        step: 'photos',
        retakeSlot: s.reviewing,
        reviewing: undefined,
        photoError: undefined,
        photos: withPhoto(s.photos, s.reviewing, { slot: s.reviewing }),
      };
    case 'continue':
      if (s.step !== 'photos') return s;
      return usedPhotos(s).length === 0 ? { ...s, needOne: true } : { ...s, step: 'weight', needOne: false };
    case 'key': {
      if (s.step !== 'weight') return s;
      const kg = typeKey(s.kg, a.k);
      return { ...s, kg, kgRefused: kg === s.kg && a.k !== '⌫' };
    }
    case 'send':
      if ((s.step !== 'weight' && s.step !== 'saved') || kgValue(s.kg) === null || usedPhotos(s).length === 0) return s;
      return {
        ...s,
        step: 'checking',
        checks: new Map(),
        result: undefined,
        error: undefined,
        retry: s.step === 'saved' ? s.error : undefined,
        sends: (s.sends ?? 0) + 1,
      };
    case 'check': {
      if (s.step !== 'checking') return s;
      const checks = new Map(s.checks);
      checks.set(a.id, a.status);
      return { ...s, checks, retry: undefined };
    }
    case 'verdict':
      if (s.step !== 'checking') return s;
      return { ...s, step: 'verdict', result: a.v, retry: undefined };
    case 'fail':
      if (s.step !== 'checking') return s;
      return {
        ...s,
        step: a.kind === 'rejected' ? 'verdict' : 'saved',
        retry: undefined,
        error: {
          kind: a.kind,
          ...(a.reason !== undefined ? { reason: a.reason } : {}),
          ...(a.retryAfterSec !== undefined ? { retryAfterSec: a.retryAfterSec } : {}),
          ...((s.sends ?? 0) > 1 ? { again: true } : {}),
        },
      };
    case 'back':
      if (s.step === 'weight') return { ...s, step: 'photos' };
      if (s.step === 'review' && s.reviewing !== undefined)
        return { ...s, step: 'photos', reviewing: undefined, photoError: undefined, photos: withPhoto(s.photos, s.reviewing, { slot: s.reviewing }) };
      return s;
  }
}
