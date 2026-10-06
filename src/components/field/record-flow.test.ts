import { describe, expect, it } from 'vitest';
import type { VerdictView } from '../../client/capture-client';
import { MAX_PHOTO_BYTES } from '../../lib/capture/limits';
import { t } from '../../lib/i18n';
import { duplicateSlot, initialFlow, kgOutOfRange, kgPrompt, photoProblem, reduce, usedPhotos, type FlowAction, type FlowState, type Slot } from './record-flow';

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

describe('DES-019: a refused key or an unlikely weight is never silent', () => {
  it('a refused key sets kgRefused; the next accepted key clears it', () => {
    let s = keys(atWeight(), '.', '3');
    expect(s.kg).toBe('0.');
    expect(s.kgRefused).toBe(true);
    s = keys(s, '5');
    expect(s.kg).toBe('0.5');
    expect(s.kgRefused).toBe(false);
    expect(keys(atWeight(), '5', '0', '1').kgRefused).toBe(true); // over 500
    expect(keys(atWeight(), '4', '.', '5', '5').kgRefused).toBe(true); // one decimal only
    expect(keys(atWeight(), '4', '.', '.').kgRefused).toBe(true); // one decimal point only
  });

  it('Delete is never a refusal, even on an empty number', () => {
    expect(keys(atWeight(), '⌫').kgRefused).toBe(false);
    expect(keys(atWeight(), '4', '⌫').kgRefused).toBe(false);
  });

  it('kgOutOfRange: more than twice the last pickings, or under half of them; never without a range', () => {
    const range = { min: 38, max: 44 };
    expect(kgOutOfRange(42.5, range)).toBe(false);
    expect(kgOutOfRange(88, range)).toBe(false);
    expect(kgOutOfRange(88.5, range)).toBe(true);
    expect(kgOutOfRange(499, range)).toBe(true);
    expect(kgOutOfRange(19, range)).toBe(false);
    expect(kgOutOfRange(18.5, range)).toBe(true);
    expect(kgOutOfRange(499, null)).toBe(false);
    expect(kgOutOfRange(null, range)).toBe(false);
  });
});

describe('DES-028: the "Yes, send" label only shows with its reason', () => {
  const range = { min: 38.5, max: 51 };

  it('reducer: "4", ".", "3" keeps "4." and marks the refused key', () => {
    const s = keys(atWeight(), '4', '.', '3');
    expect(s.kg).toBe('4.');
    expect(s.kgRefused).toBe(true);
  });

  it('a refused key on a likely weight: the rule alone, and the normal Send label', () => {
    expect(kgPrompt('49.', true, range)).toEqual({ lines: ['rule'], warn: true, pill: 'send' });
  });

  it('a refused key on an unlikely weight: the rule and the check line together, so "Yes, send" keeps its reason', () => {
    expect(kgPrompt('4.', true, range)).toEqual({ lines: ['rule', 'check'], warn: true, pill: 'sendCheck' });
  });

  it('an unlikely weight with no refused key: the check line and "Yes, send"', () => {
    expect(kgPrompt('4', false, range)).toEqual({ lines: ['check'], warn: true, pill: 'sendCheck' });
  });

  it('a likely weight: the own range and the normal Send label; nothing typed: "Type the weight"', () => {
    expect(kgPrompt('42.5', false, range)).toEqual({ lines: ['hint'], warn: false, pill: 'send' });
    expect(kgPrompt('', false, range)).toEqual({ lines: ['hint'], warn: false, pill: 'type' });
    expect(kgPrompt('', true, range)).toEqual({ lines: ['rule'], warn: true, pill: 'type' });
  });

  it('no range yet: never "Yes, send"; only the rule after a refused key', () => {
    expect(kgPrompt('4', false, null)).toEqual({ lines: [], warn: false, pill: 'send' });
    expect(kgPrompt('4.', true, null)).toEqual({ lines: ['rule'], warn: true, pill: 'send' });
  });
});

describe('DES-006: Try again from the saved sheet', () => {
  const saved = () => run(keys(atWeight(), '4'), { type: 'send' }, { type: 'fail', kind: 'offline' });

  it('the first failure is not marked again; a failed Try again is', () => {
    expect(saved().error).toEqual({ kind: 'offline' });
    const again = run(saved(), { type: 'send' }, { type: 'fail', kind: 'offline' });
    expect(again).toMatchObject({ step: 'saved', error: { kind: 'offline', again: true } });
  });

  it('while Try again runs, the sheet it came from is kept as `retry` until the first check arrives', () => {
    const trying = reduce(saved(), { type: 'send' });
    expect(trying).toMatchObject({ step: 'checking', retry: { kind: 'offline' } });
    const checking = reduce(trying, { type: 'check', id: 'geofence', status: 'ok' });
    expect(checking.retry).toBeUndefined();
    expect(reduce(trying, { type: 'verdict', v: verdict }).retry).toBeUndefined();
  });

  it('a first Send from the weight step has no retry', () => {
    expect(run(keys(atWeight(), '4'), { type: 'send' }).retry).toBeUndefined();
  });
});

describe('the same photo twice (CR-107)', () => {
  const sameAgain = (): FlowState => {
    const again = file('same-again.jpg');
    return run(initialFlow('PL-1'), ...pick(0, H), { type: 'take', slot: 1, file: again }, { type: 'use', slot: 1, file: again, sha256: H, size: 4, mime: 'image/jpeg' });
  };

  it('a photo whose bytes are already in another slot is not added: review says which slot', () => {
    const s = sameAgain();
    expect(s).toMatchObject({ step: 'review', reviewing: 1, photoError: 'duplicate', duplicateOf: 0 });
    expect(usedPhotos(s).map((p) => p.slot)).toEqual([0]);
    expect(duplicateSlot(s, H, 1)).toBe(0);
    expect(duplicateSlot(s, H, 0)).toBeNull();
    expect(duplicateSlot(s, 'b'.repeat(64), 1)).toBeNull();
  });

  it('Take again or Back clears it; the first photo stays; another photo is then added as usual', () => {
    const s = sameAgain();
    for (const next of [reduce(s, { type: 'retake' }), reduce(s, { type: 'back' })]) {
      expect(next.photoError).toBeUndefined();
      expect(next.duplicateOf).toBeUndefined();
      expect(usedPhotos(next).map((p) => p.slot)).toEqual([0]);
    }
    expect(usedPhotos(run(reduce(s, { type: 'back' }), ...pick(1, 'b'.repeat(64)))).map((p) => p.slot)).toEqual([0, 1]);
  });

  it('the same photo again in its own slot (Take again, then the same file) is not a duplicate', () => {
    const s = run(initialFlow('PL-1'), ...pick(0, H), ...pick(0, H));
    expect(s.photoError).toBeUndefined();
    expect(usedPhotos(s)).toHaveLength(1);
  });

  it('a duplicate never blocks Send of the photos already added (TP28)', () => {
    const s = run(reduce(sameAgain(), { type: 'back' }), { type: 'continue' }, { type: 'key', k: '4' }, { type: 'send' });
    expect(s.step).toBe('checking');
  });

  it('says which slot, in English and in the Kannada draft', () => {
    expect(t('rec.review.duplicate', { n: 1 })).toBe('This photo is already in slot 1. Take or choose a different one.');
    expect(t('rec.review.duplicate', { n: 2 }, 'kn')).toContain('2');
  });
});
