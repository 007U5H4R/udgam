---
id: TASK-12
title: 'TKT-11: Saved-on-phone retry, pickings list, help and language'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:06'
labels:
  - P1
  - 'sp:5'
milestone: m-0
dependencies:
  - TASK-11
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: feature
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** nothing is lost when the network drops, and farmers can see all their pickings and get help.

**Related EVAL.** EVAL-068 (client side), 088 (capture views) · **Related TC.** TC-050, TC-051, TC-052, TC-053, TC-080, TC-081
**Dependencies.** TKT-10 · **Estimate.** sp:5 · **Milestone.** M-001
Source: tickets.md § TKT-11 · Plan: technical-plan.md § TKT-11
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Failed sends keep the signed payload and photos in IndexedDB with the amber "Couldn't send" sheet (s7) and a working Try again
- [ ] #2 Pickings tab (s8) with verdict chips and Not-accepted reasons
- [ ] #3 Help tab (verdict meanings, photo tips, call the office, language, this phone)
- [ ] #4 ಕನ್ನಡ/English switch with Kannada strings marked for native review
- [ ] #5 Four screen states on data-backed views
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
