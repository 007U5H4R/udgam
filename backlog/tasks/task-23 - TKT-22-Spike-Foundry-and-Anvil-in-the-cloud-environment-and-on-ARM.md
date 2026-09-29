---
id: TASK-23
title: 'TKT-22: Spike: Foundry and Anvil in the cloud environment and on ARM'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:07'
labels:
  - P2
  - 'sp:2'
milestone: m-1
dependencies:
  - TASK-2
documentation:
  - tickets.md
  - technical-plan.md
priority: medium
type: spike
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** confirm before any contract work that Foundry installs and Anvil runs in the claude.ai/code environment (x86) and on Oracle A1 (linux-aarch64).

**Related EVAL.** — (feeds EVAL-093–104) · **Related TC.** —
**Dependencies.** TKT-01 · **Estimate.** sp:2 · **Milestone.** M-002
Source: tickets.md § TKT-22 · Plan: technical-plan.md § TKT-22
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Written answer with the exact install commands, versions and any blockers
- [ ] #2 `cloud-setup.sh` extended if it works. Throwaway code only
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
