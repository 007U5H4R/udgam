---
id: TASK-15
title: 'TKT-14: Batches, custody transfer and the buyer list'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:06'
labels:
  - P1
  - 'sp:5'
milestone: m-0
dependencies:
  - TASK-3
  - TASK-5
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: feature
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** the admin groups Verified pickings into a batch and hands it to a buyer, who sees it in their list.

**Related EVAL.** EVAL-077, 080 (buyer boundary) · **Related TC.** TC-059, TC-060, TC-080, TC-081
**Dependencies.** TKT-02, TKT-04 · **Estimate.** sp:5 · **Milestone.** M-001
Source: tickets.md § TKT-14 · Plan: technical-plan.md § TKT-14
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Batch from Verified events of one crop only
- [ ] #2 Quantity = Σ kg
- [ ] #3 Score = min(event scores)
- [ ] #4 An event in at most one batch (unique constraint)
- [ ] #5 Custody transfer signed and anchored
- [ ] #6 Batch locked after transfer
- [ ] #7 Buyer list shows batches transferred to their organisation only, each linking to its certificate
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
