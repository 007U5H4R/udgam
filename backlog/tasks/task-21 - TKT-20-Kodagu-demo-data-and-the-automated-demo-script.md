---
id: TASK-21
title: 'TKT-20: Kodagu demo data and the automated demo script'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:06'
labels:
  - P0
  - 'sp:5'
milestone: m-0
dependencies:
  - TASK-8
  - TASK-11
  - TASK-12
  - TASK-13
  - TASK-15
  - TASK-17
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: task
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** one command seeds a believable Hosahalli FPO and runs the whole grant demo end to end without manual database edits.

**Related EVAL.** EVAL-073, 074 · **Related TC.** TC-077, TC-078
**Dependencies.** TKT-07, TKT-10, TKT-11, TKT-12, TKT-14, TKT-16 · **Estimate.** sp:5 · **Milestone.** M-001
Source: tickets.md § TKT-20 · Plan: technical-plan.md § TKT-20
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Seed: 1 FPO, 1 buyer, ≥ 10 Kodagu plots, agents, devices, legitimate history, the four attack cases ready to submit
- [ ] #2 Playwright demo script (register plot → capture → verdict → batch → transfer → certificate verified) at 375 px and 1280 px
- [ ] #3 The four attacks show the evidence that caught them
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
