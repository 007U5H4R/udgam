import { describe, expect, it } from 'vitest';
import { percentile, summarizeLatency } from './latency';

// TSK-16.10: the latency scorer behind S4 (EVAL-071) and S3 (EVAL-070).
describe('summarizeLatency (TSK-16.10)', () => {
  it('[100,200,300] with 3000 ms → p50 200, p95 290 (linear interpolation), max 300, pass', () => {
    expect(summarizeLatency([100, 200, 300], 3000)).toEqual({ n: 3, p50: 200, p95: 290, max: 300, thresholdMs: 3000, pass: true });
  });

  it('order does not matter', () => {
    expect(summarizeLatency([300, 100, 200], 3000)).toMatchObject({ p50: 200, p95: 290, max: 300 });
  });

  it('any sample at the threshold fails the gate (EVAL-071: "at or above 3 s")', () => {
    expect(summarizeLatency([100, 3000], 3000).pass).toBe(false);
    expect(summarizeLatency([100, 2999.9], 3000).pass).toBe(true);
  });

  it('one sample is every percentile', () => {
    expect(summarizeLatency([1234], 3000)).toMatchObject({ p50: 1234, p95: 1234, max: 1234 });
  });

  it('refuses no samples, negative or non-finite ones, and p outside [0, 1]', () => {
    expect(() => summarizeLatency([], 3000)).toThrow(RangeError);
    expect(() => summarizeLatency([-1], 3000)).toThrow(RangeError);
    expect(() => summarizeLatency([Number.NaN], 3000)).toThrow(RangeError);
    expect(() => percentile([1, 2], 1.5)).toThrow(RangeError);
  });

  it('percentile interpolates between order statistics', () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(percentile([10, 20, 30, 40], 0)).toBe(10);
    expect(percentile([10, 20, 30, 40], 1)).toBe(40);
  });
});
