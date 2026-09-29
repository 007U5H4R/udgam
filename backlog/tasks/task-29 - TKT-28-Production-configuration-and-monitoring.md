---
id: TASK-29
title: 'TKT-28: Production configuration and monitoring'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:07'
labels:
  - P1
  - 'sp:3'
milestone: m-2
dependencies:
  - TASK-28
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: task
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** real providers, absolute-URL link previews and failure you can see at 3 AM.

**Related EVAL.** EVAL-085, 090 · **Related TC.** TC-090, TC-091, TC-092
**Dependencies.** TKT-27 · **Estimate.** sp:3 · **Milestone.** M-003
Source: tickets.md § TKT-28 · Plan: technical-plan.md § TKT-28
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Provider keys as environment secrets
- [ ] #2 OG and canonical URLs absolute HTTPS on the domain
- [ ] #3 `/api/health` monitored with an alert to the owner
- [ ] #4 Structured logs retained
- [ ] #5 Dependency audit clean in production
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
