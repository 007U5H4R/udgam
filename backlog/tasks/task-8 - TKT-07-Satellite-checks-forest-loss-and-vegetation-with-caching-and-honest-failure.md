---
id: TASK-8
title: >-
  TKT-07: Satellite checks: forest loss and vegetation, with caching and honest
  failure
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:06'
labels:
  - P0
  - 'sp:8'
milestone: m-0
dependencies:
  - TASK-4
  - TASK-7
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: feature
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** plots are checked against Global Forest Watch tree-cover loss since 2021 and Copernicus Sentinel-2 NDVI; provider failures never become rejections.

**Related EVAL.** EVAL-006, 015, 016, 017, 019, 037–043, 044 · **Related TC.** TC-011, TC-028, TC-030, TC-031, TC-032, TC-033, TC-034
**Dependencies.** TKT-03, TKT-06 · **Estimate.** sp:8 · **Milestone.** M-001
Source: tickets.md § TKT-07 · Plan: technical-plan.md § TKT-07
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `RemoteSensingProvider` interface with fixture (default), GFW and Sentinel Hub Statistical API adapters
- [ ] #2 Per-plot per-month cache
- [ ] #3 8 s timeout per call
- [ ] #4 Checks `deforestation_overlap` (any loss flag, ≥ 10 % hard fail, S5), `ndvi_cultivation`, `ndvi_harvest_window`
- [ ] #5 Timeouts, HTTP errors and cloud-blocked windows return `unavailable` and cap at Needs Review (S6)
- [ ] #6 Registration runs the deforestation query and the 12-month history (F2)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
