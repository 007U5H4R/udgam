---
id: TASK-7
title: 'TKT-06: Plot registration on a satellite map'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:06'
labels:
  - P0
  - 'sp:5'
milestone: m-0
dependencies:
  - TASK-5
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: feature
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** an admin registers a farmer and draws or uploads a plot boundary; the area is computed and the plot is anchored.

**Related EVAL.** EVAL-044 (edit path), 005, 026 (geometry fixtures) · **Related TC.** TC-026, TC-027, TC-028, TC-029, TC-080, TC-081
**Dependencies.** TKT-04 · **Estimate.** sp:5 · **Milestone.** M-001
Source: tickets.md § TKT-06 · Plan: technical-plan.md § TKT-06
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Leaflet + leaflet-draw on Esri World Imagery (MapTiler fallback via one config value)
- [ ] #2 Drag-point editing with point add/remove buttons as the non-drag alternative (WCAG 2.5.7)
- [ ] #3 GeoJSON/KML upload
- [ ] #4 Area in hectares on save
- [ ] #5 `plot_registered` anchored
- [ ] #6 Editing a polygon re-anchors and marks registration checks stale (feeds EVAL-044 in TKT-07)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
