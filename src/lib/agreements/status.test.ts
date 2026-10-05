import { describe, expect, it } from 'vitest';
import type { AgreementView, DeliveredBatch, SettlementView } from './read';
import { adminStatus, buyerStatus } from './read';

// DES-101 (QA-M002-1, EXE40): once the buyer has graded a delivered batch and the FPO has not settled it
// yet, the buyer sees "Graded · waiting for the FPO to settle" (neutral: waiting on someone), not
// "Funded · waiting for delivery". The admin sees the same agreement as "Ready to settle".

const batch = (grade: DeliveredBatch['grade']): DeliveredBatch => ({
  batchId: 'B-1',
  shortHash: 'abcdefabcdef',
  deliveredKg: 612,
  pickings: 2,
  verifiedPickings: 2,
  deliveredAt: '2026-10-01T05:00:00.000Z',
  grade,
  conditions: [],
});

const view = (delivered: DeliveredBatch[], settlements: SettlementView[] = []): AgreementView =>
  ({
    row: { id: 'AG-1', status: 'funded' } as AgreementView['row'],
    buyerName: 'Buyer',
    fpoName: 'Hosahalli FPO',
    delivered,
    settlements,
    deadlinePassed: false,
  }) as AgreementView;

describe('buyerStatus after grading (DES-101)', () => {
  it('a graded, unsettled batch reads "Graded · waiting for the FPO to settle" with the neutral mark', () => {
    const s = buyerStatus(view([batch(80)]));
    // the detail chip is short (it never wraps), like the admin's "Waiting for the buyer’s grade"
    expect(s).toEqual({ mark: 'na', word: 'Graded · waiting for the FPO to settle', short: 'Waiting for the FPO to settle' });
    expect(adminStatus(view([batch(80)])).word).toBe('Ready to settle');
  });

  it('still asks for the grade first, and still says waiting for delivery when nothing was delivered', () => {
    expect(buyerStatus(view([batch(null)])).word).toBe('Delivered · needs your grade');
    expect(buyerStatus(view([])).word).toBe('Funded · waiting for delivery');
  });

  it('a graded batch that was already judged Not released keeps the not-released words', () => {
    const judged: SettlementView = {
      id: 'ST-1',
      batchId: 'B-1',
      outcome: 'not_released',
      reasons: [{ condition: 'grade', text: 'x' }],
      createdAt: '2026-10-02T05:00:00.000Z',
      txHash: '0x',
      blockNumber: 1,
      deliveredKg: 612,
      grade: 60,
      pickings: 2,
      verifiedPickings: 2,
    };
    expect(buyerStatus(view([batch(60)], [judged])).word).toBe('Not released yet · 1 condition not met');
  });
});
