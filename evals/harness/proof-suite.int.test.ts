import { describe, expect, it } from 'vitest';
import { runProofSuite } from './proof-suite';

// TSK-15.8: the harness proof suite (EVAL-058–063, EVAL-066 Node half) with the library verifier.
// The clean-room checker column (TKT-18) is reported, never dropped.

describe('runProofSuite (EVAL-058–063, 066)', () => {
  it('passes the intact 50-event batch at 100 % coverage and rejects every tamper at its step', async () => {
    const results = await runProofSuite();
    const byId = new Map(results.map((r) => [r.id, r]));
    expect([...byId.keys()].sort()).toEqual(['EVAL-058', 'EVAL-059', 'EVAL-060', 'EVAL-061', 'EVAL-062', 'EVAL-063', 'EVAL-066']);

    const intact = byId.get('EVAL-058')!;
    expect(intact.status).toBe('passed');
    expect(intact.metrics).toMatchObject({ closureEntries: expect.any(Number), coverage: 1 });
    expect(intact.metrics!.closureEntries).toBeGreaterThanOrEqual(5 + 1 + 50 * 2 + 1 + 1 + 1 + 1);
    expect(intact.metrics!.checkpoints).toBeGreaterThanOrEqual(2); // automatic at 100 plus on demand

    const steps: Record<string, string[]> = {
      'EVAL-059': ['payload-hash'],
      'EVAL-060': ['merkle-path'],
      'EVAL-061': ['checkpoint-signature'],
      'EVAL-062': ['unknown-key'],
      'EVAL-063': ['closure-incomplete', 'merkle-path'],
    };
    for (const [id, expected] of Object.entries(steps)) {
      const r = byId.get(id)!;
      expect(r.status, id).toBe('passed');
      expect(r.variants.map((v) => v.lib.step), id).toEqual(expected);
      expect(r.variants.every((v) => v.lib.rejected && v.stepMatches), id).toBe(true);
    }
    expect(byId.get('EVAL-063')!.variants.map((v) => v.variant)).toEqual(['drop_entry', 'swap_adjacent']);

    expect(byId.get('EVAL-066')!.status).toBe('passed');

    for (const r of results) expect(r.cleanRoom, r.id).toEqual({ status: 'not_yet_implemented' });
    expect(results.every((r) => r.suite === 'harness-proof')).toBe(true);
  }, 120_000);
});
