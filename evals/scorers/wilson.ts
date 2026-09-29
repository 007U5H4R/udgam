// Wilson 95 % score interval (evaluation-plan §4.1: information next to every rate, never a gate).

const Z = 1.959963984540054; // two-sided 95 %

export type Interval = { lower: number; upper: number };

export function wilson(k: number, n: number): Interval {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 0 || n < 0 || k > n) throw new RangeError(`wilson: need integers 0 ≤ k ≤ n, got ${k}/${n}`);
  if (n === 0) return { lower: 0, upper: 1 };
  const p = k / n;
  const z2 = Z * Z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lower: k === 0 ? 0 : Math.max(0, centre - half), upper: k === n ? 1 : Math.min(1, centre + half) };
}

/** A k-of-n rate with its Wilson interval; `rate` is null for an empty population. */
export type Rate = { k: number; n: number; rate: number | null; wilson95: Interval };

export function rate(k: number, n: number): Rate {
  return { k, n, rate: n === 0 ? null : k / n, wilson95: wilson(k, n) };
}
