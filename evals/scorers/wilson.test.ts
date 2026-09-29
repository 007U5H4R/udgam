import { describe, expect, it } from 'vitest';
import { wilson } from './wilson';

// evaluation-plan §4.1 worked values: 10/10 → 72.2 %; 40/40 → 91.2 %; 38/40 → 83.5 %.
describe('wilson (95 % score interval)', () => {
  it.each([
    [10, 10, 0.722],
    [40, 40, 0.912],
    [38, 40, 0.835],
  ])('%i/%i has lower bound %f', (k, n, lower) => {
    expect(wilson(k, n).lower).toBeCloseTo(lower, 3);
  });

  it('bounds the point estimate', () => {
    const w = wilson(7, 10);
    expect(w.lower).toBeLessThan(0.7);
    expect(w.upper).toBeGreaterThan(0.7);
    expect(wilson(10, 10).upper).toBe(1);
    expect(wilson(0, 10).lower).toBe(0);
  });

  it('an empty population is the whole interval', () => {
    expect(wilson(0, 0)).toEqual({ lower: 0, upper: 1 });
  });

  it('rejects impossible counts', () => {
    expect(() => wilson(3, 2)).toThrow(RangeError);
    expect(() => wilson(-1, 2)).toThrow(RangeError);
  });
});
