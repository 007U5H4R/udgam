---
id: TASK-25
title: 'TKT-24: EVM ledger adapter and BatchRegistry contract'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:07'
labels:
  - P2
  - 'sp:5'
milestone: m-1
dependencies:
  - TASK-16
  - TASK-23
documentation:
  - tickets.md
  - technical-plan.md
priority: medium
type: feature
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** the same `Ledger` interface also writes entry hashes to a `BatchRegistry` contract on Anvil; proofs gain a transaction hash and block number.

**Related EVAL.** EVAL-058–063 (re-run on EVM), EVAL-103, EVAL-104 · **Related TC.** TC-082, TC-083
**Dependencies.** TKT-15, TKT-22 · **Estimate.** sp:5 · **Milestone.** M-002
Source: tickets.md § TKT-24 · Plan: technical-plan.md § TKT-24
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Adapter switchable by config
- [ ] #2 Hash-chain store remains the payload system of record
- [ ] #3 Foundry tests
- [ ] #4 The M-001 proof and tamper cases pass against the EVM adapter too
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
