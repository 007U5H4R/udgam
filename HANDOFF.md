# HANDOFF — Udgam

**Stage just completed:** Stage 4 · UI/UX Design — **approved 2026-09-29** (Final · Opal-inspired). Design is FROZEN (see top of `Design.md`).
**Next stage:** Stage 5 · Problem Breakdown (`bw-problem-breakdown`, Fable / Medium). Runs locally or in the cloud. Stage 6 runs locally (Campfire). **Stage 7 must run in an owner-opened claude.ai/code cloud session (S11).**

## Outputs of Stage 4
- `Design.md` — all 25 sections, Design Freeze block, tokens (§12), states (§18), QA gates (§24), certificate web spec (§25).
- `.design/exploration/final/` — approved mockup: `index.html` (capture app, 8 screens + language sheet; hash deep links `#s1…#s8`, `#s3-kg`), `verify.html` (certificate; `#loading`, `#mismatch`; light print), `admin.html` (review queue; `#loading`, `#empty`, `#error`), `cherry.svg` (brand object v2, three-cherry cluster).
- `.design/exploration/og/` — link-preview mockup + `verify.png` (1200 × 630, ~324 KB).
- `.design/exploration/index.html` — gallery (final + rejected A/B/C for the record), `plans.md` (briefs, research), `shots/` (evidence screenshots). `ref/` (Opal reference screenshots) is local only, gitignored.
- `decisions.md` — D1–D8 appended.

## Key decisions (Stage 4)
D1 Opal-inspired visual language · D2 three-cherry cluster brand object · D3 plot card = Home hero, proof card = certificate hero · D4 tabs Home · Pickings · Help, full-screen record flow · D5 farmer-facing verdict words + one verdict template · D6 native camera with slots/review; keypad weight entry · D7 light print certificate; admin overrides need a reason · D8 roles unchanged (DISC10).

## Open items (not blocking)
- Should farmers log in themselves? (D8) — owner decision pending.
- Kannada strings need native-speaker review. Dark UI needs a midday sunlight field test (Design.md §22/§23).
- User actions still pending from Stage 1: create GFW, Copernicus, ArcGIS, Oracle Cloud accounts (provision the A1 instance early). Domain: `udgam.in` is taken; `udgamtrace.in` / `udgam.co.in` show no registration record.

## What Stage 5 must do
Invoke `bw-problem-breakdown`. Read first: `Solution-PRD.md` (F1–F20, N1–N7, S10), `evaluation-plan.md` (S1–S7, CF-01–CF-14, GAP-1–GAP-9), `evals/eval-dataset.json` (EVAL-001–092), `Design.md` (frozen; §5, §13, §16, §18), `decisions.md`. Produce `milestones.md` (M-001 slice, M-002 contract farming, M-003 deploy) and `tickets.md` as tracer-bullet vertical slices with a dependency DAG, provisional `TKT-`/`TSK-` IDs, type + priority, acceptance criteria, DoD, and links to `TC-`/`EVAL-` IDs. Include Stage 6 prerequisites for S11 (cloud setup script, `.env.example`, fixture-provider default) as tickets. Preserve all existing IDs.
