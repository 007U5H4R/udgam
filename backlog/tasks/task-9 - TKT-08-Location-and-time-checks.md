---
id: TASK-9
title: 'TKT-08: Location and time checks'
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
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: feature
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** complete scenario 1 (GPS spoofing) and scenario 6 (timestamp manipulation) detection.

**Related EVAL.** EVAL-003, 004, 005, 007, 008, 009, 010, 011, 013, 014, 020, 023–029, 033, 034, 055–057 · **Related TC.** TC-011, TC-035, TC-036, TC-037
**Dependencies.** TKT-02 · **Estimate.** sp:5 · **Milestone.** M-001
Source: tickets.md § TKT-08 · Plan: technical-plan.md § TKT-08
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Checks `gps_accuracy`, `exif_gps_agreement`, `exif_time_agreement`, `movement_plausibility`, and the geofence buffer rule (min(accuracy, 25 m)) with concave-polygon correctness
- [ ] #2 GAP-1 resolved (absent EXIF time → flag; 7-day fail rule defined) and recorded
- [ ] #3 Evidence sentences in the §7.4 format
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
