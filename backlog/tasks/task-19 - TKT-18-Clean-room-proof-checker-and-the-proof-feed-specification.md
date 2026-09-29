---
id: TASK-19
title: 'TKT-18: Clean-room proof checker and the proof-feed specification'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:06'
labels:
  - P0
  - 'sp:3'
milestone: m-0
dependencies:
  - TASK-16
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: task
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** prove S6 independently: a small standalone checker, written only from the published feed specification and sharing no code with the app, verifies (and rejects tampered) proofs.

**Related EVAL.** EVAL-058–063 (checker side) · **Related TC.** TC-073
**Dependencies.** TKT-15 · **Estimate.** sp:3 · **Milestone.** M-001
Source: tickets.md § TKT-18 · Plan: technical-plan.md § TKT-18
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `docs/proof-feed.md` specification (resolves GAP-9)
- [ ] #2 `evals/scorers/independent-verifier` uses only platform WebCrypto
- [ ] #3 Passes the intact batch and fails every tamper case
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
