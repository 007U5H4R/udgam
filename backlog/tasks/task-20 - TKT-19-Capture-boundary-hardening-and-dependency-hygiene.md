---
id: TASK-20
title: 'TKT-19: Capture-boundary hardening and dependency hygiene'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:06'
labels:
  - P1
  - 'sp:3'
milestone: m-0
dependencies:
  - TASK-3
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: chore
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** the upload endpoint rejects anything malformed, oversized or of the wrong type before it reaches verification, and dependencies stay free of known high-severity issues.

**Related EVAL.** EVAL-081, 083, 085 · **Related TC.** TC-074, TC-075, TC-076
**Dependencies.** TKT-02 · **Estimate.** sp:3 · **Milestone.** M-001
Source: tickets.md § TKT-19 · Plan: technical-plan.md § TKT-19
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Per-photo 10 MB cap, content-type and magic-byte checks, count ≤ 3, payload schema validation, rate limiting
- [ ] #2 Rejected attempts still anchored as rejected `harvest_event` where signed (Solution-PRD §7 rule 2)
- [ ] #3 `pnpm audit` gate in CI
- [ ] #4 No secrets in logs or client bundle
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
