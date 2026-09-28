# HANDOFF — Udgam

**Stage just completed:** Stage 2 · Solution Design (brainstormed in four approved sections: system shape + domain model, verification pipeline, ledger + certificate, capture/errors/eval/testing).
**Solution-PRD.md approved** by Tushar Pathak on 2026-09-28 (§13 ticked).
**Where next stages run:** a claude.ai/code cloud session on the private repo `007U5H4R/udgam` (Stages 3, 4, 5, and 7 onward). Stage 6 (Campfire onboarding) runs locally. See `CLAUDE.md` for path mapping and cloud limits.

## Outputs
- `Solution-PRD.md` — approach, F1–F20 requirements, N1–N7, architecture, 12-check registry, scoring, ledger interface + hash-chain design, certificate, flows, error rules, eval harness shape, testing strategy, risks.
- `decisions.md` — S1–S9 appended (S1 supersedes DISC5's downscale clause).
- `Discovery-PRD.md` — approved 2026-09-24; Q24 row annotated with S1.

## Key decisions this stage
Original bytes signed (S1) · synchronous verification with 8 s provider timeouts (S2) · monolith + pure lib modules (S3) · 12-check registry, 80/50 thresholds, unavailable caps at Needs Review (S4, S6) · deforestation any-loss flag / ≥ 10 % hard fail (S5) · hash-chain + signed Merkle checkpoints, isomorphic proof verify (S7) · DB-enforced batch invariants (S8) · JCS + SHA-256 + P-256 (S9).

## Still pending from Stage 1 (user actions)
Domain check (udgam.in) · Oracle account + A1 instance (provision early) · GFW API key · Copernicus Data Space account · ArcGIS Location Platform key · confirm no hard deadline.

## Next stage — Stage 3 · Evaluation Design
Invoke `bw-evaluation-design` (Fable / High) with `~/.claude/rules/eval-framework.md`. Read first: `Solution-PRD.md` §4, §8, §11; `Discovery-PRD.md` §6, §7. Produce `evaluation-plan.md`, seed `/evals` (dataset schema for legitimate + attack cases, scorers for detection/false-positive rate, results/reports layout), append `EV#` decisions. Must answer "what makes this unacceptable to release?" using S1–S7 as gates. Preserve all DISC/S IDs.
