---
id: TASK-28
title: 'TKT-27: Oracle Cloud Always Free deployment'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:07'
labels:
  - P1
  - 'sp:5'
milestone: m-2
dependencies:
  - TASK-22
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: chore
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** the app, Anvil and Caddy run on the owner's Oracle A1 instance with HTTPS on the product domain.

**Related EVAL.** — (enables EVAL-070, 072, 085, 090) · **Related TC.** TC-087, TC-088, TC-089
**Dependencies.** TKT-21 (and owner: Oracle account + A1 instance, domain) · **Estimate.** sp:5 · **Milestone.** M-003
Source: tickets.md § TKT-27 · Plan: technical-plan.md § TKT-27
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Docker Compose for linux-aarch64
- [ ] #2 Caddy + Let's Encrypt
- [ ] #3 Ledger key and database on persistent block storage with an off-instance backup
- [ ] #4 Keep-busy cron against idle reclamation
- [ ] #5 One-command redeploy
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
