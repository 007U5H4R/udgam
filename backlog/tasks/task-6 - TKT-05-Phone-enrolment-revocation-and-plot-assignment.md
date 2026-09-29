---
id: TASK-6
title: 'TKT-05: Phone enrolment, revocation and plot assignment'
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
  - TASK-5
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: feature
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** an admin issues a one-time code; the agent's phone creates its own non-extractable key and is enrolled; the admin can revoke a phone; agents are assigned plots.

**Related EVAL.** EVAL-082, 051, 052, 054, 021 · **Related TC.** TC-021, TC-022, TC-023, TC-024, TC-025, TC-080, TC-081
**Dependencies.** TKT-02, TKT-04 · **Estimate.** sp:5 · **Milestone.** M-001
Source: tickets.md § TKT-05 · Plan: technical-plan.md § TKT-05
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Codes single-use, expire after 24 h, rate-limited
- [ ] #2 Enrolment and revocation anchored
- [ ] #3 Revoked or unknown keys hard-fail `signature_valid`
- [ ] #4 `agent_plots` assignment table added (resolves GAP-2) and captures for unassigned plots fail as scenario 5
- [ ] #5 First-run language sheet (ಕನ್ನಡ / English) shown during enrolment
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
