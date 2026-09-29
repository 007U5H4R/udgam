---
id: TASK-13
title: 'TKT-12: Admin review queue with re-run and signed overrides'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:06'
labels:
  - P1
  - 'sp:5'
milestone: m-0
dependencies:
  - TASK-5
  - TASK-8
  - TASK-9
  - TASK-10
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: feature
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** the FPO office sees every Needs-a-check picking with its evidence, re-runs unavailable checks, and accepts or rejects with a reason that is signed and anchored.

**Related EVAL.** EVAL-069, 075, 076, 088 (admin) · **Related TC.** TC-054, TC-055, TC-056, TC-057, TC-080, TC-081
**Dependencies.** TKT-04, TKT-07, TKT-08, TKT-09 · **Estimate.** sp:5 · **Milestone.** M-001
Source: tickets.md § TKT-12 · Plan: technical-plan.md § TKT-12
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Matches `.design/exploration/final/admin.html` (queue, detail, score with cap reason, all checks with evidence, photos, plot card)
- [ ] #2 Re-run retries only the unavailable providers
- [ ] #3 Override needs a reason ≥ 10 characters, is signed and anchored as `admin_override`
- [ ] #4 Hard-failed rejections show no override
- [ ] #5 Loading / empty / error states
- [ ] #6 768 px list→detail
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
