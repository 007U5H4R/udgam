import { describe, expect, it } from 'vitest';
import { scoreProofRun, type ProofRun } from './proof-verifier';

// TSK-18.6: the proof-verifier scorer (evaluation-plan §4.6 S6, EV11). Both verifiers' results for the
// intact feed and the 7 tamper variants → coverage, tamper rejection, per-variant steps, CF-04.

const VARIANTS = [
  ['payload-field', 'payload-hash'],
  ['merkle-sibling', 'merkle-path'],
  ['checkpoint-signature', 'checkpoint-signature'],
  ['other-key', 'unknown-key'],
  ['dropped-entry', 'closure-incomplete'],
  ['reordered-entries', 'merkle-path'],
  ['wrong-short-hash', 'short-hash'],
] as const;

function run(overrides: Partial<ProofRun> = {}): ProofRun {
  return {
    closureEntries: 120,
    intact: { lib: { ok: true, verified: 120, step: null }, cleanRoom: { ok: true, verified: 120, step: null } },
    variants: VARIANTS.map(([variant, expectedStep]) => ({
      variant,
      expectedStep,
      lib: { ok: false, verified: 0, step: expectedStep },
      cleanRoom: { ok: false, verified: 0, step: expectedStep },
    })),
    ...overrides,
  };
}

describe('scoreProofRun', () => {
  it('all verified and every tamper rejected at its step → full marks, CF-04 not fired', () => {
    const s = scoreProofRun(run());
    expect(s.coverage).toEqual({ lib: 1, cleanRoom: 1 });
    expect(s.tamperRejected).toEqual({ lib: 1, cleanRoom: 1 });
    expect(s.perVariant).toHaveLength(7);
    expect(s.perVariant[0]).toEqual({
      variant: 'payload-field',
      expectedStep: 'payload-hash',
      lib: { rejected: true, step: 'payload-hash' },
      cleanRoom: { rejected: true, step: 'payload-hash' },
      stepMatches: true,
    });
    expect(s.perVariant.every((v) => v.stepMatches)).toBe(true);
    expect(s.cf04).toEqual({ fired: false, variants: [] });
  });

  it('coverage = entries verified ÷ closure entries, 0 for a verifier that rejects the intact feed', () => {
    const s = scoreProofRun(
      run({ intact: { lib: { ok: true, verified: 120, step: null }, cleanRoom: { ok: false, verified: 90, step: 'closure-incomplete' } } }),
    );
    expect(s.coverage).toEqual({ lib: 1, cleanRoom: 0 });
    const partial = scoreProofRun(run({ closureEntries: 160 }));
    expect(partial.coverage).toEqual({ lib: 0.75, cleanRoom: 0.75 });
  });

  it('a variant accepted by the clean-room checker alone fires CF-04 and lowers its rejection rate', () => {
    const r = run();
    r.variants[3]!.cleanRoom = { ok: true, verified: 120, step: null };
    const s = scoreProofRun(r);
    expect(s.tamperRejected).toEqual({ lib: 1, cleanRoom: 6 / 7 });
    expect(s.perVariant[3]).toMatchObject({ variant: 'other-key', cleanRoom: { rejected: false, step: null }, stepMatches: false });
    expect(s.cf04).toEqual({ fired: true, variants: ['other-key'] });
  });

  it('a variant accepted by the library verifier alone fires CF-04', () => {
    const r = run();
    r.variants[0]!.lib = { ok: true, verified: 120, step: null };
    expect(scoreProofRun(r).cf04).toEqual({ fired: true, variants: ['payload-field'] });
  });

  it('rejected at the wrong step: no CF-04, but stepMatches is false', () => {
    const r = run();
    r.variants[5]!.cleanRoom = { ok: false, verified: 3, step: 'entry-hash' };
    const s = scoreProofRun(r);
    expect(s.cf04.fired).toBe(false);
    expect(s.tamperRejected.cleanRoom).toBe(1);
    expect(s.perVariant[5]!.stepMatches).toBe(false);
  });

  it('no variants → rejection rates are 0, not NaN', () => {
    expect(scoreProofRun(run({ variants: [] })).tamperRejected).toEqual({ lib: 0, cleanRoom: 0 });
  });
});
