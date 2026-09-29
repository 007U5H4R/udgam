---
id: TASK-17
title: 'TKT-16: Public certificate page with in-browser proof'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:06'
labels:
  - P1
  - 'sp:8'
milestone: m-0
dependencies:
  - TASK-15
  - TASK-16
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: feature
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** anyone scanning the QR sees where the coffee came from and has their own browser confirm the records match the sealed ledger.

**Related EVAL.** EVAL-064, 071, 084, 087, 088, 089 (certificate) · **Related TC.** TC-065, TC-066, TC-067, TC-068, TC-069, TC-080, TC-081
**Dependencies.** TKT-14, TKT-15 · **Estimate.** sp:8 · **Milestone.** M-001
Source: tickets.md § TKT-16 · Plan: technical-plan.md § TKT-16
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Matches `.design/exploration/final/verify.html` (proof first on phones, map, journey, origin table, entries, organic line, honest limits)
- [ ] #2 Proof recomputed in the browser with the loading and mismatch states
- [ ] #3 Wrong or missing `h` stops the feed from serving data (resolves GAP-6)
- [ ] #4 Pseudonymous producer IDs only (EV16)
- [ ] #5 QR generation for a batch
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
