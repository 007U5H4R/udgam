import { describe, expect, it } from 'vitest';
import { evidence } from '../verification/evidence';
import { publicEvidence } from './copy';

// Stage 8 · DES-208 / DES-213: the certificate words a recorded evidence sentence for its public readers.
// The phone's sequence numbers ("Entry 11 follows entry 10") read against the table's own "#" column, and
// "hard fail" is verifier jargon beside a green result. Everything else, a "(demo data)" label included
// (EXE12), is shown as recorded.
describe('publicEvidence (DES-208, DES-213)', () => {
  it('drops the phone sequence numbers from the chain sentence', () => {
    expect(publicEvidence(evidence.chain_continuity.ok({ seq: 1 }))).toBe('First entry from this phone');
    expect(publicEvidence(evidence.chain_continuity.ok({ seq: 11 }))).toBe('Follows the previous entry from this phone');
    expect(publicEvidence('Entry 2 follows entry 1 from this phone')).toBe('Follows the previous entry from this phone');
  });

  it('says "limit" for the forest-loss and yield hard-fail limits, keeping "(demo data)"', () => {
    expect(publicEvidence('0.0% of plot area lost since 2021 (hard fail at 10.0%) (demo data)')).toBe('0.0% of plot area lost since 2021 (limit 10.0%) (demo data)');
    expect(publicEvidence(evidence.deforestation_overlap.ok({ lossPct: 0 }))).toBe('0.0% of plot area lost since 2021 (limit 10.0%)');
    expect(publicEvidence(evidence.yield_plausibility.ok({ ratio: 0.5 }))).not.toMatch(/hard fail/);
    expect(publicEvidence(evidence.yield_plausibility.ok({ ratio: 0.5 }))).toMatch(/, limit 2\.00x\)$/);
  });

  it('leaves every other sentence as recorded', () => {
    for (const s of ['Signed by enrolled phone DV-7K2M', 'Living canopy around the picking date: NDVI 0.71 (needs ≥ 0.45) (demo data)', 'First entry from this phone']) {
      expect(publicEvidence(s)).toBe(s);
    }
  });
});
