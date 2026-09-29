---
id: TASK-11
title: 'TKT-10: Capture app to the frozen design'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:06'
labels:
  - P1
  - 'sp:8'
milestone: m-0
dependencies:
  - TASK-3
  - TASK-6
  - TASK-7
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: feature
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** the farmer-facing capture flow exactly as approved: Home with the plot card, photo slots, review, weight keypad, checking screen, three verdict screens.

**Related EVAL.** EVAL-086, 089 (capture pages), 070 (instrumented here, measured in M-003) · **Related TC.** TC-043, TC-044, TC-045, TC-046, TC-047, TC-048, TC-049, TC-080, TC-081
**Dependencies.** TKT-02, TKT-05, TKT-06 · **Estimate.** sp:8 · **Milestone.** M-001
Source: tickets.md § TKT-10 · Plan: technical-plan.md § TKT-10
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Matches `.design/exploration/final/index.html` screens s1–s6
- [ ] #2 Native camera via file input with capture (F4), original bytes hashed and signed (S1)
- [ ] #3 Checking screen shows the real checks as they finish (transport — streaming vs polling — decided in Stage 6 within S2's synchronous model)
- [ ] #4 Tab bar hidden in the record flow
- [ ] #5 All strings externalised
- [ ] #6 Installable PWA manifest
- [ ] #7 320 × 568 keeps the primary action visible
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
