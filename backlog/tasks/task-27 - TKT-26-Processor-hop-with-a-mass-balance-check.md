---
id: TASK-27
title: 'TKT-26: Processor hop with a mass-balance check'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:07'
labels:
  - P2
  - 'sp:5'
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
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** a batch can pass through a processor (pulping, drying) with input and output weights recorded, and an implausible loss or gain is flagged.

**Related EVAL.** EVAL-100–102, EVAL-105 · **Related TC.** TC-086
**Dependencies.** TKT-14, TKT-23, TKT-24 · **Estimate.** sp:5 · **Milestone.** M-002
Source: tickets.md § TKT-26 · Plan: technical-plan.md § TKT-26
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Processor custody transfer signed and anchored
- [ ] #2 Configurable mass-balance band per process
- [ ] #3 Outside-band results flagged with an evidence sentence
- [ ] #4 Certificate journey shows the extra step
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
