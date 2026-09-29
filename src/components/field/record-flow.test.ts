import { describe, expect, it } from 'vitest';
import type { VerdictView } from '../../client/capture-client';
import { initialFlow, reduce, usedPhotos, type FlowAction, type FlowState } from './record-flow';

// TSK-10.6: the record flow (photos → review → weight → checking → verdict | saved) as a pure reducer.

const file = (name = 'a.jpg') => new File([new Uint8Array([0xff, 0xd8, 0xff, 1])], name, { type: 'image/jpeg' });
const run = (s: FlowState, ...actions: FlowAction[]) => actions.reduce(reduce, s);
const keys = (s: FlowState, ...ks: string[]) => run(s, ...ks.map((k) => ({ type: 'key', k }) as FlowAction));
const H = 'a'.repeat(64);

/** A flow on the weight step with one photo used. */
function atWeight(): FlowState {
  return run(initialFlow('PL-1'), { type: 'take', slot: 0, file: file() }, { type: 'use', sha256: H, size: 4, mime: 'image/jpeg' }, { type: 'continue' });
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
    let s = reduce(initialFlow('PL-1'), { type: 'take', slot: 0, file: file() });
    expect(s).toMatchObject({ step: 'review', reviewing: 0 });
    s = reduce(s, { type: 'use', sha256: H, size: 4, mime: 'image/jpeg' });
    expect(s.step).toBe('photos');
    expect(s.reviewing).toBeUndefined();
    expect(usedPhotos(s)).toEqual([expect.objectContaining({ slot: 0, sha256: H, size: 4, mime: 'image/jpeg' })]);
    s = run(s, { type: 'take', slot: 1, file: file() }, { type: 'use', sha256: 'b'.repeat(64), size: 4, mime: 'image/jpeg' });
    s = run(s, { type: 'take', slot: 2, file: file() }, { type: 'use', sha256: 'c'.repeat(64), size: 4, mime: 'image/jpeg' });
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
