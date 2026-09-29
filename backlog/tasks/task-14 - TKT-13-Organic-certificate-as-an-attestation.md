---
id: TASK-14
title: 'TKT-13: Organic certificate as an attestation'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:06'
labels:
  - P2
  - 'sp:2'
milestone: m-0
dependencies:
  - TASK-7
documentation:
  - tickets.md
  - technical-plan.md
priority: medium
type: feature
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** an admin attaches an organic certificate to a plot; it is hashed and anchored and always described as an attestation.

**Related EVAL.** EVAL-079 · **Related TC.** TC-058, TC-080, TC-081
**Dependencies.** TKT-06 · **Estimate.** sp:2 · **Milestone.** M-001
Source: tickets.md § TKT-13 · Plan: technical-plan.md § TKT-13
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 File hash, issuer, validity dates stored and anchored
- [ ] #2 Every surface wording "Certified by <issuer> — certificate on record", never "verified organic" (DISC4)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
