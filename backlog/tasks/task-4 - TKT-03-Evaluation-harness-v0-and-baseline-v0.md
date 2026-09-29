---
id: TASK-4
title: 'TKT-03: Evaluation harness v0 and baseline-v0'
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
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: feature
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** `pnpm eval` builds cases from `evals/eval-dataset.json`, runs `verify()` with the fixture provider, and writes a results JSON and a Markdown report from real output, so every later ticket is measured.

**Related EVAL.** EVAL-091, 092 · **Related TC.** TC-014, TC-015, TC-016, TC-017
**Dependencies.** TKT-02 · **Estimate.** sp:5 · **Milestone.** M-001
Source: tickets.md § TKT-03 · Plan: technical-plan.md § TKT-03
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One command from a clean clone
- [ ] #2 Per-scenario detection, false-positive rate, per-case status
- [ ] #3 Cases whose checks don't exist yet are reported as `not_yet_implemented`, never dropped
- [ ] #4 Provenance (commit, dataset version, config) in every result
- [ ] #5 `evals/results/baseline-v0.json` committed (EV13)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
