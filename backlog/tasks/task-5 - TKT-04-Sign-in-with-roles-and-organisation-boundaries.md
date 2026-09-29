---
id: TASK-5
title: 'TKT-04: Sign-in with roles and organisation boundaries'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:06'
labels:
  - P0
  - 'sp:3'
milestone: m-0
dependencies:
  - TASK-2
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: feature
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** agents, FPO admins and buyers sign in (Better Auth, email + password, seeded demo accounts) and only reach their own surfaces and their organisation's data.

**Related EVAL.** EVAL-080 · **Related TC.** TC-018, TC-019, TC-020, TC-080, TC-081
**Dependencies.** TKT-01 · **Estimate.** sp:3 · **Milestone.** M-001
Source: tickets.md § TKT-04 · Plan: technical-plan.md § TKT-04
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Route groups `/(agent)`, `/(admin)`, `/(buyer)` guarded on the server
- [ ] #2 Every query scoped by organisation
- [ ] #3 `/verify/*` stays public
- [ ] #4 Sign-in screen in the frozen visual language
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
