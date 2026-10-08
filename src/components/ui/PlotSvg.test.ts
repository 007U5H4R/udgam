import { describe, expect, it } from 'vitest';
import { HOME_BOX, youTagTransform } from './PlotSvg';

// DES-024: the "You" label stays inside the Home map: above its dot normally, below it when the dot is
// near the top (it met the farmer-name line above the map), flipped left near the right edge.

describe('youTagTransform', () => {
  it('mid-map: above and to the right', () => {
    expect(youTagTransform({ x: 180, y: 111 }, HOME_BOX)).toBe('translate(12px, -30px)');
  });

  it('near the right edge: above and to the left', () => {
    expect(youTagTransform({ x: 300, y: 111 }, HOME_BOX)).toBe('translate(calc(-100% - 12px), -30px)');
  });

  it('near the top (the dot clamped at the edge outside the plot): below the dot', () => {
    expect(youTagTransform({ x: 10, y: 10 }, HOME_BOX)).toBe('translate(12px, 12px)');
    expect(youTagTransform({ x: 350, y: 43 }, HOME_BOX)).toBe('translate(calc(-100% - 12px), 12px)');
    expect(youTagTransform({ x: 10, y: 44 }, HOME_BOX)).toBe('translate(12px, -30px)');
  });
});
