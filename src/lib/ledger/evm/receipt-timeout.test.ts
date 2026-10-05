import { describe, expect, it } from 'vitest';
import { receiptTimeoutMs } from './client';

// TASK-25 r2 #3: append's receipt wait grows with the deployment's confirmations, so 12 confirmations on a
// 12 s-block chain (about 144 s) are waited for instead of timing out at a flat 30 s.

describe('receiptTimeoutMs', () => {
  it('one confirmation (Anvil) keeps the base timeout', () => {
    expect(receiptTimeoutMs(1)).toBe(30_000);
    expect(receiptTimeoutMs(1, 5_000)).toBe(5_000);
  });

  it('every further confirmation adds 15 s: 12 confirmations wait 195 s', () => {
    expect(receiptTimeoutMs(12)).toBe(195_000);
    expect(receiptTimeoutMs(12) > 12 * 12_000).toBe(true);
    expect(receiptTimeoutMs(2, 10_000)).toBe(25_000);
  });
});
