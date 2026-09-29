# Milestones — Udgam

**Stage:** 5 · Problem Breakdown · **Status:** Approved by owner 2026-09-29 · **Date:** 2026-09-29
**Inputs:** `Solution-PRD.md` (F1–F20, N1–N7, S1–S11), `evaluation-plan.md` (S1–S7, CF-01–CF-14, GAP-1–GAP-9), `evals/eval-dataset.json` (EVAL-001–092), `Design.md` (frozen 2026-09-29), `decisions.md`.
**Execution venue:** every ticket below is built in an owner-opened claude.ai/code cloud session (S11). Campfire and vault syncs happen locally after each phase.
IDs: milestones `M-###` are permanent. Tickets keep `TKT-##` as a cross-reference; native Campfire IDs (Stage 6) are in `tickets.md` → Campfire mapping.

---

## M-001 · Trust at the edge, end to end (the vertical slice)
- **Campfire:** milestone `m-0`; TASK-2 … TASK-22, TASK-31.
- **Objective:** prove the riskiest assumption. A picking captured on a phone is signed on the device, checked against the plot, the photo history and satellite data, given an honest verdict, sealed in a tamper-evident ledger, and re-verified by anyone from a QR code in their own browser. Measured by the evaluation harness, not asserted.
- **Scope:** F1–F15, N1–N7; design surfaces capture app, admin review, buyer list, public certificate, link preview (Design.md frozen).
- **Deliverables:** running app on a cloud or local machine with seeded Kodagu demo data; `pnpm eval` report meeting S1, S2, S4, S6, S7; automated demo script (EVAL-073); clean-room verifier; baseline-v1.
- **Tickets:** TKT-01 … TKT-21, TKT-30 (added 2026-09-29, TP28).
- **Dependencies:** approved Stages 1–4 (done); Stage 6 technical plan and test cases.
- **Entry criteria:** Stage 6 approved; cloud environment set up from TKT-01's script.
- **Exit criteria:** S1 ≥ 95 % (and ≥ 90 % per scenario, EV5), S2 ≤ 5 %, S4 < 3 s, S6 100 %, S7 yes, all CF-01–CF-14 clear, EVAL-073/074 pass, per-phase QA passed, owner demo sign-off.
- **Definition of Done:** base DoD (tickets.md) for every ticket + eval-run-v1 persisted in `/evals/results/` + baseline-v1 frozen (EV13).
- **Sequence / priority / status:** 1 · P0 · Not started.
- **Risks:** satellite free-tier quotas or account delays (fixture provider keeps the slice demonstrable); single-signal attacks (addressed by S10 caps); dark UI in sunlight (field test); Kannada strings unreviewed.

## M-002 · Contract farming on real smart contracts
- **Campfire:** milestone `m-1`; TASK-23 … TASK-27.
- **Objective:** turn verified batches into enforceable agreements: escrowed payment that releases only when quantity, quality and verification conditions are all met; add the processor hop with a mass-balance check.
- **Scope:** F16–F18.
- **Deliverables:** Foundry/Anvil EVM ledger adapter behind the same `Ledger` interface; `BatchRegistry`, `ContractFarming` and mock ERC-20 INR contracts with Foundry tests; agreement, settlement and processor-transfer screens (after a small design addendum).
- **Tickets:** TKT-22 … TKT-26.
- **Dependencies:** M-001 ledger interface and batches (TKT-14, TKT-15); design addendum TKT-23 before any M-002 UI.
- **Entry criteria:** M-001 exit met; TKT-22 spike confirms Foundry runs in the cloud environment and on ARM.
- **Exit criteria:** settlement releases only when all three conditions hold and never otherwise (EVAL-093–105, added in Stage 6, TP23); mass-balance outside the band is flagged; M-001 regression suite still green.
- **Definition of Done:** base DoD + Foundry tests + M-002 eval cases pass.
- **Sequence / priority / status:** 2 · P2 · Not started.
- **Risks:** Foundry on ARM (spike first); M-002 screens are not in the frozen design (addendum required, Design.md scope-change rule).

## M-003 · Public deployment and demo
- **Campfire:** milestone `m-2`; TASK-28 … TASK-30.
- **Objective:** run the product on the owner's Oracle Cloud Always Free instance behind HTTPS on the product domain and rehearse the grant demo on production.
- **Scope:** F19, F20; production verification of F14 observability, OG metadata and link unfurl.
- **Deliverables:** Docker Compose on Oracle A1 (app, Anvil, Caddy), keep-busy cron, ledger-key persistence and backup, real provider keys as secrets, published evaluation report, three consecutive production rehearsals (EV12).
- **Tickets:** TKT-27 … TKT-29.
- **Dependencies:** M-001 exit (M-002 optional for the demo); owner actions: Oracle account + A1 instance, domain registration (`udgamtrace.in` or `udgam.co.in`), GFW / Copernicus / ArcGIS keys.
- **Entry criteria:** Stage 10 QA gate approved (build-workflow Stage 11 entry).
- **Exit criteria:** S3 ≤ 30 s on the reference condition (EVAL-070), S5 < 10 min on production three times in a row (EVAL-072), EVAL-085 and EVAL-090 pass, health route and alerting observable.
- **Definition of Done:** base DoD + production verification evidence recorded in `QA-report.md`.
- **Sequence / priority / status:** 3 · P1 · Not started.
- **Risks:** Oracle Always Free capacity and idle reclamation (provision early, keep-busy cron, PAYG upgrade option); free-tier limit changes.
