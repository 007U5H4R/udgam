// Latency summary for the performance gates (technical-plan §13, TSK-16.10; S4 = EVAL-071, S3 = EVAL-070).
// Percentiles use linear interpolation between order statistics (the "R-7" / Excel PERCENTILE.INC rule):
// for sorted samples x[0..n-1] and 0 ≤ p ≤ 1, h = (n − 1)·p and P = x[⌊h⌋] + (h − ⌊h⌋)·(x[⌊h⌋+1] − x[⌊h⌋]).
// The gate is on the maximum: every run must finish under the threshold (EVAL-071 "any load at or above 3 s"
// fails). Pure.

export type LatencySummary = { n: number; p50: number; p95: number; max: number; thresholdMs: number; pass: boolean };

/** The p-th percentile (0 ≤ p ≤ 1) of `sorted` (ascending), by linear interpolation. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) throw new RangeError('percentile: no samples');
  if (!(p >= 0 && p <= 1)) throw new RangeError(`percentile: p must be in [0, 1], got ${p}`);
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo]! + (h - lo) * (sorted[hi]! - sorted[lo]!);
}

/** p50, p95 and max of the samples; `pass` iff every sample is strictly under `thresholdMs`. */
export function summarizeLatency(samplesMs: number[], thresholdMs: number): LatencySummary {
  if (samplesMs.length === 0) throw new RangeError('summarizeLatency: no samples');
  if (samplesMs.some((x) => !Number.isFinite(x) || x < 0)) throw new RangeError('summarizeLatency: samples must be finite and non-negative');
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const max = sorted.at(-1)!;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { n: sorted.length, p50: r2(percentile(sorted, 0.5)), p95: r2(percentile(sorted, 0.95)), max, thresholdMs, pass: max < thresholdMs };
}
