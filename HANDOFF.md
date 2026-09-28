# HANDOFF — Udgam

**Stage just completed:** Stage 3 · Evaluation Design (`bw-evaluation-design`, Fable / High), run in a cloud session on 2026-09-28.
**Gate status:** **awaiting owner sign-off.** `evaluation-plan.md` §17 is unticked, and six decisions are `proposed` (see Open questions). Do not start Stage 4 until the owner approves Stage 3.
**Branch:** `stage-3-evaluation-design` (pushed; not merged to `main`, no PR opened).
**Where next stages run:** a claude.ai/code cloud session on `007U5H4R/udgam` for Stages 4, 5, and 7 onward; Stage 6 (Campfire onboarding) runs locally. See `CLAUDE.md` for path mapping and cloud limits.

## Outputs
- `evaluation-plan.md` (project root): **the only copy of the plan** (EV1). It answers "what would make this unacceptable for release?" (§1) and covers S1–S7 gate definitions (§4), critical failure conditions CF-01 to CF-14 (§5), category gates (§6), dataset design and mutation vocabulary (§7), scorer specs (§8), automated/manual/human review (§9), baselines (§10), regression (§11), results and provenance fields (§12), `/evals` layout and commands (§13), spec gaps GAP-1 to GAP-9 (§14), and open questions (§15).
- `evals/eval-dataset.json`: 92 seeded cases, EVAL-001 to EVAL-092, dataset version 0.1.0. Validated against the schema with ajv (JSON Schema 2020-12), and a negative control (an attack case expecting Verified) was correctly rejected.
- `evals/eval-dataset.schema.json`: the case schema, extended from eval-framework with verdict, catching-check, hard-fail, evidence, suite, class, scenario, gate, CF-link, and viewport fields.
- `decisions.md`: EV1–EV16 appended. Existing DISC and S entries were not touched.
- `evals/scorers/`, `results/`, `reports/` are **not created**: no empty stubs. Stage 7 creates them with real content.

## Key decisions this stage
Plan at the root (EV1) · AI category not applicable (EV2) · S1–S7 with fixed formulas plus 14 critical conditions (EV3) · detection requires attribution to the expected check; false positives include Needs Review; fixed case classes (EV4) · mutation-based dataset with yield written in multiples of U, so no unverified Coffee Board figures (EV8) · S4 timed from navigation start (EV10) · S6 checked by the page and a clean-room checker plus a tamper suite (EV11) · three consecutive production rehearsals for S5 (EV12) · ledger-only baseline v0, frozen-config baseline v1, new cases before any config change (EV13) · regression and semver dataset versioning (EV14).

## Findings the owner should know
1. **As specified, the verdict maths lets single-signal attacks through.** With equal weights, one non-hard `fail` scores 91.7, which is Verified; two fails score 83.3, still Verified. About half the S1 attack cases are single-signal, so S1 would fail unless EV7 (or carefully set weights) is adopted.
2. **S3 is at risk from photo upload size.** On placeholder numbers (3 × 4 MB at 5 Mbit/s up), upload is about 19 s, plus a GPS wait of up to 10 s and a cold provider call of up to 8 s, which comes to about 37 s. Photo size and network speed are assumptions until field calibration (HR3). Stage 6 should consider starting GPS on screen open and uploading photos early; S3 stays at 30 s.
3. **Honest pruning and small clearings look identical to the satellites** (EVAL-019 / EVAL-040). Only Needs Review is right for both. This is an R&D finding for the pitch.
4. **Small-sample honesty.** A perfect 10/10 in one scenario has a Wilson 95 % lower bound of 72.2 %; 40/40 gives 91.2 %. Reports print these intervals. The seeded set proves rule coverage; it does not measure a field detection rate.
5. **Spec gaps for Stage 6** (§14): EXIF-time-absent behaviour, a missing agent-to-plot assignment table, the season window for yield, retry idempotency, check score values and weights, whether `h` guards the proof feed, salami re-scoring, the evidence format, and a published proof-format document.

## Open questions for owner — decide at the Stage 3 gate
| # | Decision | Recommendation |
|---|---|---|
| Q1 | **EV7**: any `fail`, or a `flag` on deforestation/yield, caps the verdict at Needs Review (amends the S4 verdict rule) | **Accept.** It is the only way to meet S1 without tuning weights to the eval set, and it sends the pruning/clearing ambiguity to a human. Cost: more honest cases in the review queue (tracked as "honest review load"). |
| Q2 | **EV5**: add a ≥ 90 % per-scenario detection floor alongside the pooled ≥ 95 % | **Accept.** It is stricter than S1, and it stops one blind scenario hiding behind the pool. |
| Q3 | **EV6**: declare known limitations (inside-polygon spoof with matching EXIF; re-encoded replay; salami re-scoring) and exclude them from S1 | **Accept.** Disclosure is more credible to grant evaluators than an unexplained miss or a silent omission. Approve the disclosure wording at HR2. |
| Q4 | **EV9**: S3 timed from Submit tap to verdict card; reference network 10/5 Mbit/s, 80 ms; photo size from the demo phone | **Accept, and do HR3 early:** about 10 real captures on your Android phone outdoors, recording EXIF presence, GPS accuracy, file sizes, and upload time. This replaces the placeholders before baseline-v1. |
| Q5 | Add a perceptual near-duplicate photo check to catch re-encoded replays? | **Not in M1.** Keep EVAL-036 as a disclosed limitation and reconsider after baseline-v1. It would be a new check (Solution-PRD scope change). |
| Q6 | **EV15**: an identical signed payload is idempotent (returns the original event) | **Accept.** Without it, the manual-retry path in Solution-PRD §6 rejects honest agents. |
| Q7 | **EV16**: public certificate and GeoJSON show no farmer name or identifier, only a pseudonymous producer_id | **Accept.** The polygon stays public per F12. If you want farmer names shown, reject this and EVAL-084 is retired. |

## Owner actions still pending (carried from Stages 1–2)
Domain check (udgam.in) · Oracle account and A1 instance (provision early) · GFW API key · Copernicus Data Space account · ArcGIS Location Platform key · confirm there is no hard deadline. **New:** HR3 field-calibration captures (Q4).

## Could not do in this session
- **EUR-Lex was not reachable** (the fetch returned empty content), so the EUDR GeoJSON/DDS field list and the 4 ha polygon-versus-point rule are **unverified** here. EVAL-078 marks this; confirm from the primary source in Stage 6. No EUDR dates or Coffee Board figures are stated in the Stage 3 artifacts.
- **Interactive brainstorming** (`superpowers:brainstorming`, the stage skill's underlying skill) needs the owner live. Owner-level choices were therefore recorded as `proposed` decisions instead.

## To sync locally (the cloud session cannot reach these)
- **Campfire board:** the project is not onboarded yet (Stage 6). Nothing to sync as tickets now. At Stage 6, create or plan tickets for: harness and scorers (§8), the clean-room proof checker (EV11), the dataset extension to target size (§7.5), baseline-v0 and baseline-v1 (§10), CI eval job (§11), the perf runner for S3/S4, and the spec gaps GAP-1 to GAP-9. If a Campfire ticket for "Stage 3 evaluation design" is being tracked locally, move it to Done after the owner approves.
- **Campfire Decisions view:** it auto-parses `decisions.md`, so EV1–EV16 appear once the branch is merged or pulled locally.
- **Obsidian vault** (`Udgam/`) and **auto-memory** (`udgam-project-state.md`): record "Stage 3 done 2026-09-28, awaiting sign-off; 92 EVAL cases seeded; EV1–EV16 (EV5, EV6, EV7, EV9, EV15, EV16 proposed); findings: single-signal verdict maths, S3 upload risk, pruning/clearing ambiguity."

## Next stage — Stage 4 · UI/UX Design (after Stage 3 approval)
**Skill:** `bw-ui-ux-design` (via `t-design`). **Model / effort:** Sonnet 5 / Medium. Start a fresh session.
**Read first:** `CLAUDE.md` (path mapping) → this file → `Solution-PRD.md` (§2 F1–F15 and N4/N5, §3.1 surfaces, §5.4 certificate, §6 flows, §7 error rules) → `evaluation-plan.md` §1, §4.3–4.6, §6 (design gate), §7.4 (evidence contract) → `evals/eval-dataset.json` cases EVAL-070 to EVAL-090 (UI-facing) → `.claude/workflow/web-deliverables.md` → `.claude/workflow/og-image-guidelines.md` (the certificate page is public).
**Do:** produce `Design.md` and an approved HTML mockup in `.design/exploration/` for the four surfaces (agent capture PWA, admin review queue, buyer dashboard, public certificate), plus an OG image mockup for `/verify/[batchId]`. Priorities that come from the evaluation plan:
- The **verdict card** must show the catching evidence line without extra taps (EVAL-074), and the text follows the value-and-threshold evidence format (§7.4).
- The **verification panel** must show a final state within 3 s (S4) and name the exact failing step on a tamper (EVAL-059 to EVAL-064).
- **Capture at 375 px:** no horizontal scroll, targets at least 24 × 24 CSS px (EVAL-086). Stage 4 may raise these, not lower them.
- **Four screen states** for the review queue, buyer dashboard, certificate, and capture submit (EVAL-088), including the Needs Review "provider unavailable, re-run" state and the network-failure "payload kept, retry" state.
- **Organic** wording as an attestation only (EVAL-079, CF-11). No farmer PII on public pages if EV16 is accepted (EVAL-084).

Append `D#` decisions. Preserve all DISC, S, EV, EVAL, CF, and GAP IDs. If Stage 4 needs new EVAL design cases, append them from EVAL-093 upward.
