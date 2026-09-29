---
id: TASK-16
title: 'TKT-15: Ledger checkpoints and the proof feed'
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
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** entries are sealed under signed Merkle checkpoints and served as proofs anyone can verify.

**Related EVAL.** EVAL-058–063, 065 · **Related TC.** TC-061, TC-062, TC-063, TC-064
**Dependencies.** TKT-02 · **Estimate.** sp:5 · **Milestone.** M-001
Source: tickets.md § TKT-15 · Plan: technical-plan.md § TKT-15
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Checkpoint every 100 entries or on demand
- [ ] #2 Server ledger key generated at first boot outside the repo, public key at `/.well-known/udgam-ledger-key`
- [ ] #3 `getProof` / isomorphic `verifyProof`
- [ ] #4 `/api/verify/[batchId]` proof feed forces a checkpoint when the batch has newer entries (S7)
- [ ] #5 Feed format documented (feeds GAP-9)
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
