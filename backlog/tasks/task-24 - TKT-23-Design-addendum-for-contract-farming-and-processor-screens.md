---
id: TASK-24
title: 'TKT-23: Design addendum for contract-farming and processor screens'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:07'
labels:
  - P2
  - 'sp:3'
milestone: m-1
dependencies: []
documentation:
  - tickets.md
  - technical-plan.md
priority: medium
type: docs
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** the agreement, settlement and processor-transfer screens are not in the frozen design; add them through a short Stage 4 re-entry before they are built.

**Related EVAL.** EVAL-105 (design gates for the addendum screens) · **Related TC.** —
**Dependencies.** — · **Estimate.** sp:3 · **Milestone.** M-002
Source: tickets.md § TKT-23 · Plan: technical-plan.md § TKT-23
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Design.md addendum + mockups in `.design/exploration/final/` in the frozen visual language
- [ ] #2 Owner approval recorded as a D# decision
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
