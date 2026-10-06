import { describe, expect, it } from 'vitest';
import { blockWindows, LOG_RANGE_BLOCKS } from './log-range';

// Stage 9 CR-206: the shared bounded log scan of the registry and escrow clients.

const b = BigInt;
const all = (start: number, head: number, size: number, order?: 'oldest-first' | 'newest-first') => [...blockWindows(b(start), b(head), b(size), order)].map(([f, t]) => [Number(f), Number(t)]);

describe('blockWindows', () => {
  it('covers start..head oldest first in windows of at most `size` blocks', () => {
    expect(all(10, 30, 8)).toEqual([
      [10, 17],
      [18, 25],
      [26, 30],
    ]);
  });

  it('covers start..head newest first, the last window clipped at start', () => {
    expect(all(10, 30, 8, 'newest-first')).toEqual([
      [23, 30],
      [15, 22],
      [10, 14],
    ]);
  });

  it('yields one window for a single block, and nothing when start is past head', () => {
    expect(all(7, 7, 8)).toEqual([[7, 7]]);
    expect(all(7, 7, 8, 'newest-first')).toEqual([[7, 7]]);
    expect(all(8, 7, 8)).toEqual([]);
    expect(all(8, 7, 8, 'newest-first')).toEqual([]);
  });

  it('treats a size below 1 as 1, and defaults to 5,000 blocks per call', () => {
    expect(all(0, 2, 0)).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    expect(LOG_RANGE_BLOCKS).toBe(5_000);
    expect(all(0, 12_000, LOG_RANGE_BLOCKS, 'newest-first')).toEqual([
      [7_001, 12_000],
      [2_001, 7_000],
      [0, 2_000],
    ]);
  });
});
