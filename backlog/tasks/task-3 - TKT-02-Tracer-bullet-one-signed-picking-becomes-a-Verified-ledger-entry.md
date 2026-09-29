---
id: TASK-3
title: 'TKT-02: Tracer bullet: one signed picking becomes a Verified ledger entry'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:06'
labels:
  - P0
  - 'sp:8'
milestone: m-0
dependencies:
  - TASK-2
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: feature
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** the thinnest complete path through the riskiest assumption: a phone signs a capture, the server verifies it, three checks run, the verdict is scored with the S10 caps, and the capture plus verdict are appended to the hash-chain ledger in one transaction.

**Notes.** seeded device and plot, no enrolment or plot UI yet. Resolve GAP-5 (per-check score values and weights) and GAP-8 (evidence sentence format) here, record as TP decisions.

**Related EVAL.** EVAL-001, 002, 022, 030, 053, 066, 067, 018 · **Related TC.** TC-006, TC-007, TC-008, TC-009, TC-010, TC-011, TC-012, TC-013
**Dependencies.** TKT-01 · **Estimate.** sp:8 · **Milestone.** M-001
Source: tickets.md § TKT-02 · Plan: technical-plan.md § TKT-02
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `lib/crypto` implements RFC 8785 canonical JSON, SHA-256 and ECDSA P-256 sign/verify, identical in browser and Node
- [ ] #2 `lib/ledger` hash-chain adapter appends entries (`seq, prev_hash, kind, payload_hash, ts, entry_hash`) — checkpoints come in TKT-15
- [ ] #3 `lib/verification` has the check-registry contract (`CheckResult` per Solution-PRD §4.1), the scorer with thresholds and caps (S4 + S10), and checks `signature_valid`, `geofence`, `photo_uniqueness`
- [ ] #4 `/api/capture` multipart handler verifies at the boundary, runs `verify()`, writes `harvest_events`, `media`, `verification_runs` and ledger entries in one transaction
- [ ] #5 A minimal capture page (one seeded device key, one seeded plot) signs and uploads a single photo + kg and shows the verdict and evidence lines
- [ ] #6 A check that throws reports `unavailable`
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
