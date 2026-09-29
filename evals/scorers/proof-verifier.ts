// proof-verifier (evaluation-plan §4.6 S6, §9 scorer table; EV11): scores the harness proof suite from
// both verifiers' results — the library verifier (verifyFeed, which the certificate page runs) and
// the clean-room checker (evals/scorers/independent-verifier). Coverage = entries verified ÷ closure
// entries (0 for a verifier that rejects the intact feed); tamper rejection = variants rejected ÷
// variants. Any variant accepted by either verifier fires CF-04. A rejection at a step other than the
// documented one is not CF-04 but fails `stepMatches` (and so its case).

/** One verifier's verdict on one feed. `verified` = entries it verified; `step` = its failing step. */
export type VerifierOutcome = { ok: boolean; verified: number; step: string | null };

export type ProofRun = {
  closureEntries: number;
  intact: { lib: VerifierOutcome; cleanRoom: VerifierOutcome };
  variants: { variant: string; expectedStep: string; lib: VerifierOutcome; cleanRoom: VerifierOutcome }[];
};

export type VariantScore = {
  variant: string;
  expectedStep: string;
  lib: { rejected: boolean; step: string | null };
  cleanRoom: { rejected: boolean; step: string | null };
  stepMatches: boolean;
};

export type ProofScore = {
  coverage: { lib: number; cleanRoom: number };
  tamperRejected: { lib: number; cleanRoom: number };
  perVariant: VariantScore[];
  cf04: { fired: boolean; variants: string[] };
};

const coverageOf = (o: VerifierOutcome, closure: number) => (o.ok && closure > 0 ? Math.min(o.verified, closure) / closure : 0);
const verdict = (o: VerifierOutcome) => ({ rejected: !o.ok, step: o.ok ? null : o.step });

export function scoreProofRun(run: ProofRun): ProofScore {
  const perVariant = run.variants.map((v) => {
    const lib = verdict(v.lib);
    const cleanRoom = verdict(v.cleanRoom);
    return { variant: v.variant, expectedStep: v.expectedStep, lib, cleanRoom, stepMatches: lib.step === v.expectedStep && cleanRoom.step === v.expectedStep };
  });
  const n = perVariant.length;
  const rejected = (side: 'lib' | 'cleanRoom') => (n === 0 ? 0 : perVariant.filter((v) => v[side].rejected).length / n);
  const accepted = perVariant.filter((v) => !v.lib.rejected || !v.cleanRoom.rejected).map((v) => v.variant);
  return {
    coverage: { lib: coverageOf(run.intact.lib, run.closureEntries), cleanRoom: coverageOf(run.intact.cleanRoom, run.closureEntries) },
    tamperRejected: { lib: rejected('lib'), cleanRoom: rejected('cleanRoom') },
    perVariant,
    cf04: { fired: accepted.length > 0, variants: accepted },
  };
}
