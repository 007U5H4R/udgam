---
id: TASK-18
title: 'TKT-17: EUDR map file, printable certificate and link-preview metadata'
status: To Do
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:06'
labels:
  - P1
  - 'sp:3'
milestone: m-0
dependencies:
  - TASK-17
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: feature
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** the buyer can download the EUDR due-diligence map file, print the certificate, and share a link that previews properly.

**Related EVAL.** EVAL-078, 087 (print), 090 (tags present; unfurl verified in M-003) · **Related TC.** TC-067, TC-070, TC-071, TC-072, TC-080, TC-081
**Dependencies.** TKT-16 · **Estimate.** sp:3 · **Milestone.** M-001
Source: tickets.md § TKT-17 · Plan: technical-plan.md § TKT-17
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 GeoJSON FeatureCollection with commodity, HS code, quantity, country, producer ID, polygon (or point under 4 ha) — field list verified against the EU primary source in Stage 6
- [ ] #2 Light print stylesheet (warnings ≥ 7.4:1)
- [ ] #3 Server-rendered OG + Twitter tags with the approved `og/verify.png` asset
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->
