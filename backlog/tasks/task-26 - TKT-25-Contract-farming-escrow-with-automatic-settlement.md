---
id: TASK-26
title: 'TKT-25: Contract farming escrow with automatic settlement'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:07'
labels:
  - P2
  - 'sp:8'
milestone: m-1
dependencies:
  - TASK-15
  - TASK-24
  - TASK-25
documentation:
  - tickets.md
  - technical-plan.md
priority: medium
type: feature
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** a buyer funds an agreement in mock INR; payment releases only when delivered kg ≥ agreed, the buyer's signed quality grade ≥ agreed, and every included picking is Verified.

**Related EVAL.** EVAL-093–099, EVAL-105 · **Related TC.** TC-084, TC-085
**Dependencies.** TKT-14, TKT-23, TKT-24 · **Estimate.** sp:8 · **Milestone.** M-002
Source: tickets.md § TKT-25 · Plan: technical-plan.md § TKT-25
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `ContractFarming` + mock ERC-20 INR contracts with Foundry tests for every condition combination
- [ ] #2 Buyer quality attestation signed
- [ ] #3 Agreement and settlement screens per TKT-23
- [ ] #4 No release on any failed condition
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
