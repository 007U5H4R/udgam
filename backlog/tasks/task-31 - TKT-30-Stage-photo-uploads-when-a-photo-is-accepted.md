---
id: TASK-31
title: 'TKT-30: Stage photo uploads when a photo is accepted'
status: To Do
assignee: []
created_date: '2026-09-29 03:33'
labels:
  - P1
  - 'sp:3'
milestone: m-0
dependencies:
  - TASK-11
  - TASK-20
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: enhancement
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** Take photo upload off the Submit-to-verdict path so capture-to-verdict stays within 30 s on field networks (S3, EV9, TP13/TP28).

**Related EVAL.** EVAL-070 · **Related TC.** TC-093, TC-094
**Dependencies.** TKT-10, TKT-19 · **Estimate.** sp:3 · **Milestone.** M-001
Source: tickets.md § TKT-30 · Plan: technical-plan.md § TKT-30
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Tapping Use this photo uploads its original bytes to POST /api/capture/stage in the background; the signed payload is unchanged (S1)
- [ ] #2 Submit sends only the payload, signature and any photos not yet staged; the server re-hashes each staged file against the signed sha256 before verification
- [ ] #3 Staged files belong to the uploading agent, expire after 1 h, are capped at 10 MB each and 12 per agent, and never count as seen for photo_uniqueness
- [ ] #4 An expired or foreign staged hash returns 409 media_not_staged and the client resends the bytes once; nothing is lost
- [ ] #5 EVAL-070 timing split shows upload no longer on the Submit-to-verdict path
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md; no secrets committed; commits carry the TASK id
<!-- DOD:END -->
