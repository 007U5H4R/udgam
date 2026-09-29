import { describe, expect, it } from 'vitest';
import type { VerdictView } from '../../client/capture-client';
import { MAX_PHOTO_BYTES } from '../../lib/capture/limits';
import { initialFlow, photoProblem, reduce, usedPhotos, type FlowAction, type FlowState, type Slot } from './record-flow';

// TSK-10.6: the record flow (photos → review → weight → checking → verdict | saved) as a pure reducer.

const file = (name = 'a.jpg') => new File([new Uint8Array([0xff, 0xd8, 0xff, 1])], name, { type: 'image/jpeg' });
const run = (s: FlowState, ...actions: FlowAction[]) => actions.reduce(reduce, s);
const keys = (s: FlowState, ...ks: string[]) => run(s, ...ks.map((k) => ({ type: 'key', k }) as FlowAction));
const H = 'a'.repeat(64);
/** Take a photo into `slot` and accept it ("Use this photo" hashed it). */
function pick(slot: Slot, sha256 = H, f = file()): FlowAction[] {
  return [
    { type: 'take', slot, file: f },
    { type: 'use', slot, file: f, sha256, size: 4, mime: 'image/jpeg' },
  ];
}

/** A flow on the weight step with one photo used. */
function atWeight(): FlowState {
  return run(initialFlow('PL-1'), ...pick(0), { type: 'continue' });
}

const verdict: VerdictView = { eventId: 'HE-1', verdict: 'Verified', score: 95, checks: [], idempotent: false };

describe('photos and review', () => {
  it('starts on photos with three empty slots and no kg', () => {
    const s = initialFlow('PL-1');
    expect(s).toMatchObject({ step: 'photos', plotId: 'PL-1', kg: '' });
    expect(s.photos.map((p) => p.slot)).toEqual([0, 1, 2]);
    expect(usedPhotos(s)).toHaveLength(0);
  });

  it('continue with 0 photos sets needOne and stays on photos', () => {
    const s = reduce(initialFlow('PL-1'), { type: 'continue' });
    expect(s.step).toBe('photos');
    expect(s.needOne).toBe(true);
  });

  it('take → review of that slot; use → back to photos with the hash kept; the third use goes to weight', () => {
    const f0 = file();
    let s = reduce(initialFlow('PL-1'), { type: 'take', slot: 0, file: f0 });
    expect(s).toMatchObject({ step: 'review', reviewing: 0 });
    s = reduce(s, { type: 'use', slot: 0, file: f0, sha256: H, size: 4, mime: 'image/jpeg' });
    expect(s.step).toBe('photos');
    expect(s.reviewing).toBeUndefined();
    expect(usedPhotos(s)).toEqual([expect.objectContaining({ slot: 0, sha256: H, size: 4, mime: 'image/jpeg' })]);
    s = run(s, ...pick(1, 'b'.repeat(64)));
    s = run(s, ...pick(2, 'c'.repeat(64)));
    expect(s.step).toBe('weight');
    expect(usedPhotos(s)).toHaveLength(3);
  });

  it('retake drops the reviewed photo and goes back to photos (the screen reopens the camera)', () => {
    const s = run(initialFlow('PL-1'), { type: 'take', slot: 1, file: file() }, { type: 'retake' });
    expect(s.step).toBe('photos');
    expect(s.photos[1]!.file).toBeUndefined();
    expect(s.retakeSlot).toBe(1);
  });

  it('back from review discards the photo that was not used', () => {
    const s = run(initialFlow('PL-1'), { type: 'take', slot: 0, file: file() }, { type: 'back' });
    expect(s.step).toBe('photos');
    expect(s.photos[0]!.file).toBeUndefined();
  });
});

describe('"Use this photo" is tied to the photo it hashed (TASK-11 fix round 1)', () => {
  it('a hash for another slot, or for an earlier file of the same slot, is ignored', () => {
    const old = file('old.jpg');
    const fresh = file('new.jpg');
    // hashing of `old` was still running when the farmer went back and took a new photo into slot 0
    const s = run(initialFlow('PL-1'), { type: 'take', slot: 0, file: old }, { type: 'back' }, { type: 'take', slot: 0, file: fresh });
    expect(run(s, { type: 'use', slot: 0, file: old, sha256: H, size: 4, mime: 'image/jpeg' })).toBe(s);
    expect(run(s, { type: 'use', slot: 1, file: fresh, sha256: H, size: 4, mime: 'image/jpeg' })).toBe(s);
    expect(usedPhotos(run(s, { type: 'use', slot: 0, file: fresh, sha256: H, size: 4, mime: 'image/jpeg' }))).toHaveLength(1);
  });

  it('a refused photo stays on review with the reason; Take again or Back clears it; a stale refusal is ignored', () => {
    const f = file();
    const s = run(initialFlow('PL-1'), { type: 'take', slot: 2, file: f }, { type: 'refuse', slot: 2, file: f, why: 'type' });
    expect(s).toMatchObject({ step: 'review', reviewing: 2, photoError: 'type' });
    expect(usedPhotos(s)).toHaveLength(0);
    expect(reduce(s, { type: 'retake' }).photoError).toBeUndefined();
    expect(reduce(s, { type: 'back' }).photoError).toBeUndefined();
    const other = run(initialFlow('PL-1'), { type: 'take', slot: 2, file: file() });
    expect(reduce(other, { type: 'refuse', slot: 2, file: f, why: 'size' })).toBe(other);
  });

  it('photoProblem: JPEG or HEIC (as sniffed) of at most 10 MB only', () => {
    expect(MAX_PHOTO_BYTES).toBe(10 * 1024 * 1024);
    expect(photoProblem({ mime: 'image/jpeg', size: 10 * 1024 * 1024 })).toBeNull();
    expect(photoProblem({ mime: 'image/heic', size: 3_000_000 })).toBeNull();
    expect(photoProblem({ mime: 'image/jpeg', size: 10 * 1024 * 1024 + 1 })).toBe('size');
    expect(photoProblem({ mime: 'image/png', size: 1000 })).toBe('type');
    expect(photoProblem({ mime: 'image/webp', size: 1000 })).toBe('type');
    expect(photoProblem({ mime: 'application/octet-stream', size: 11 * 1024 * 1024 })).toBe('type');
  });
});

describe('weight keypad', () => {
  it('keys 4, 2, ., 5 → "42.5"', () => {
    expect(keys(atWeight(), '4', '2', '.', '5').kg).toBe('42.5');
  });

  it('"." then "3" is refused: only .5 or .0', () => {
    expect(keys(atWeight(), '.', '3').kg).toBe('0.');
    expect(keys(atWeight(), '4', '.', '0').kg).toBe('4.0');
    expect(keys(atWeight(), '4', '.', '5', '5').kg).toBe('4.5'); // one decimal only
  });

  it('5, 0, 1 is refused at the third key: the maximum is 500', () => {
    expect(keys(atWeight(), '5', '0', '1').kg).toBe('50');
    expect(keys(atWeight(), '5', '0', '0').kg).toBe('500');
    expect(keys(atWeight(), '5', '0', '0', '.', '5').kg).toBe('500.'); // 500.5 > 500
  });

  it('⌫ deletes the last character; a leading 0 is replaced; one decimal point only', () => {
    expect(keys(atWeight(), '4', '2', '⌫').kg).toBe('4');
    expect(keys(atWeight(), '0', '7').kg).toBe('7');
    expect(keys(atWeight(), '4', '.', '.').kg).toBe('4.');
    expect(keys(atWeight(), '⌫').kg).toBe('');
  });

  it('back from weight returns to photos and keeps the photos', () => {
    const s = reduce(atWeight(), { type: 'back' });
    expect(s.step).toBe('photos');
    expect(usedPhotos(s)).toHaveLength(1);
  });
});

describe('send, checks and the verdict', () => {
  it('send with kg "" (or 0) is a no-op', () => {
    const s = atWeight();
    expect(reduce(s, { type: 'send' })).toBe(s);
    const zero = keys(s, '0');
    expect(reduce(zero, { type: 'send' })).toBe(zero);
  });

  it('send → checking; check lines fill the map; verdict → the verdict step', () => {
    let s = run(keys(atWeight(), '4', '2', '.', '5'), { type: 'send' });
    expect(s.step).toBe('checking');
    s = run(s, { type: 'check', id: 'geofence', status: 'ok' }, { type: 'check', id: 'gps_accuracy', status: 'flag' });
    expect([...s.checks]).toEqual([
      ['geofence', 'ok'],
      ['gps_accuracy', 'flag'],
    ]);
    s = reduce(s, { type: 'verdict', v: verdict });
    expect(s).toMatchObject({ step: 'verdict', result: verdict });
  });

  it('a check line after the verdict is ignored', () => {
    const s = run(keys(atWeight(), '4'), { type: 'send' }, { type: 'verdict', v: verdict });
    const after = reduce(s, { type: 'check', id: 'geofence', status: 'fail' });
    expect(after.checks.has('geofence')).toBe(false);
    expect(after).toBe(s);
  });

  it('a boundary refusal shows the verdict step as Not accepted; offline or server → saved', () => {
    const sent = run(keys(atWeight(), '4'), { type: 'send' });
    expect(reduce(sent, { type: 'fail', kind: 'rejected', reason: 'plot_not_assigned' })).toMatchObject({
      step: 'verdict',
      error: { kind: 'rejected', reason: 'plot_not_assigned' },
    });
    expect(reduce(sent, { type: 'fail', kind: 'offline' })).toMatchObject({ step: 'saved', error: { kind: 'offline' } });
    expect(reduce(sent, { type: 'fail', kind: 'server' })).toMatchObject({ step: 'saved', error: { kind: 'server' } });
  });

  it('send again from saved clears the checks and the error', () => {
    const saved = run(keys(atWeight(), '4'), { type: 'send' }, { type: 'check', id: 'geofence', status: 'ok' }, { type: 'fail', kind: 'offline' });
    const again = reduce(saved, { type: 'send' });
    expect(again.step).toBe('checking');
    expect(again.checks.size).toBe(0);
    expect(again.error).toBeUndefined();
  });
});
