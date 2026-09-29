---
id: TASK-30
title: 'TKT-29: Production rehearsals and published evaluation report'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:07'
labels:
  - P1
  - 'sp:3'
milestone: m-2
dependencies:
  - TASK-29
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: task
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** show the product works where evaluators will see it.

**Related EVAL.** EVAL-070, 072 · **Related TC.** —
**Dependencies.** TKT-28 · **Estimate.** sp:3 · **Milestone.** M-003
Source: tickets.md § TKT-29 · Plan: technical-plan.md § TKT-29
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Three consecutive production demo runs under 10 minutes (S5, EV12)
- [ ] #2 Capture-to-verdict ≤ 30 s on the reference condition (S3, EV9)
- [ ] #3 Evaluation report published in `/evals/reports`
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
