---
id: TASK-10
title: 'TKT-09: Yield, chain and replay checks; idempotent retry'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:06'
labels:
  - P0
  - 'sp:5'
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
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** complete scenario 2 (replay) and scenario 4 (yield inflation) detection and make a retried identical payload safe.

**Related EVAL.** EVAL-012, 031, 032, 035, 036, 045–050, 068 · **Related TC.** TC-011, TC-038, TC-039, TC-040, TC-041, TC-042
**Dependencies.** TKT-02, TKT-05, TKT-06 · **Estimate.** sp:5 · **Milestone.** M-001
Source: tickets.md § TKT-09 · Plan: technical-plan.md § TKT-09
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `crop_yield_reference` table seeded from a verified Coffee Board of India source (cited)
- [ ] #2 `yield_plausibility` season rule (> 1.5× U flag, > 2× hard fail) with GAP-3 resolved (season window, cherry-to-clean conversion point)
- [ ] #3 `chain_continuity` (flag)
- [ ] #4 `photo_uniqueness` across agents and plots
- [ ] #5 An identical signed payload resubmitted returns the original verdict without a new event (EV15, resolves GAP-4)
- [ ] #6 GAP-7 recorded as a declared limitation
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
