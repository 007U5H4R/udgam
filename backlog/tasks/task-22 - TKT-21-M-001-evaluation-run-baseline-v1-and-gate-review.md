---
id: TASK-22
title: 'TKT-21: M-001 evaluation run, baseline-v1 and gate review'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:33'
labels:
  - P0
  - 'sp:3'
milestone: m-0
dependencies:
  - TASK-19
  - TASK-21
  - TASK-4
  - TASK-14
  - TASK-18
  - TASK-20
  - TASK-31
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: task
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** measure M-001 against its gates and freeze the baseline for everything after.

**Related EVAL.** all M1 cases; gates S1, S2, S4, S6, S7 · **Related TC.** TC-079
**Dependencies.** TKT-18, TKT-20, all M-001 tickets · **Estimate.** sp:3 · **Milestone.** M-001
Source: tickets.md § TKT-21 · Plan: technical-plan.md § TKT-21
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `evals/results/eval-run-v1.json` + `evals/reports/eval-report-v1.md` from real output
- [ ] #2 S1 (≥ 95 % pooled, ≥ 90 % per scenario), S2, S4, S6, S7 met
- [ ] #3 CF-01–CF-14 clear
- [ ] #4 `baseline-v1.json` frozen (EV13)
- [ ] #5 Failures open Bug tickets, thresholds never lowered
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
