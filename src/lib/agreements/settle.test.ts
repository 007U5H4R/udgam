import { describe, expect, it } from 'vitest';
import { judge, REASON_BITS } from './settle';

// TSK-25.6 (the planned unit file; spec review nit): the three-condition decision as value vs threshold,
// with fixed literals. The contract decides on chain; this is what the screens and the reasons show.

const terms = { agreedKg: 500, minGrade: 80 };
const facts = { deliveredKg: 512, pickings: 2, verifiedPickings: 2, grade: 90 as const };

describe('judge (three conditions)', () => {
  it('all three met: quantity, grade and every picking Verified', () => {
    expect(judge(facts, terms)).toEqual([
      { condition: 'quantity', met: true, value: '512.0 kg', threshold: '500.0 kg', text: 'Delivered 512.0 kg of 500.0 kg agreed' },
      { condition: 'grade', met: true, value: 'Excellent · 90', threshold: 'Very good · 80', text: 'Graded Excellent · 90; minimum Very good · 80' },
      { condition: 'all_verified', met: true, value: '2 of 2', threshold: 'all Verified', text: '2 of 2 pickings Verified' },
    ]);
  });

  it('quantity at the boundary is met; half a kilogram short is not, and says how short', () => {
    expect(judge({ ...facts, deliveredKg: 500 }, terms)[0]!.met).toBe(true);
    expect(judge({ ...facts, deliveredKg: 499.5 }, terms)[0]).toEqual({
      condition: 'quantity',
      met: false,
      value: '499.5 kg',
      threshold: '500.0 kg',
      text: 'Delivered 499.5 kg of 500.0 kg agreed (0.5 kg short)',
    });
  });

  it('grade at the minimum is met; below it or not graded is not', () => {
    expect(judge({ ...facts, grade: 80 }, terms)[1]!.met).toBe(true);
    expect(judge({ ...facts, grade: 70 }, terms)[1]).toMatchObject({ met: false, text: 'Graded Good · 70; minimum Very good · 80' });
    expect(judge({ ...facts, grade: null }, terms)[1]).toMatchObject({ met: false, value: 'not graded', text: 'Not graded yet; minimum Very good · 80' });
  });

  it('one picking not Verified, or no pickings at all, fails verification', () => {
    expect(judge({ ...facts, verifiedPickings: 1 }, terms)[2]).toMatchObject({ met: false, value: '1 of 2', text: '1 of 2 pickings Verified' });
    expect(judge({ ...facts, pickings: 0, verifiedPickings: 0 }, terms)[2]!.met).toBe(false);
  });

  it('the contract reason bits: quantity 1, grade 2, verification 4', () => {
    expect(REASON_BITS).toEqual({ quantity: 1, grade: 2, all_verified: 4 });
  });
});
