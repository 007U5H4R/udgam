---
id: TASK-2
title: 'TKT-01: Walking skeleton that builds and runs in the cloud session'
status: In Progress
assignee: []
created_date: '2026-09-29 02:23'
updated_date: '2026-09-29 03:51'
labels:
  - P0
  - 'sp:3'
milestone: m-0
dependencies: []
documentation:
  - tickets.md
  - technical-plan.md
priority: high
type: chore
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Objective.** a Next.js App Router + TypeScript app with Tailwind, shadcn/ui, Drizzle on file-backed libSQL, Vitest and Playwright, running end to end in a claude.ai/code cloud session: `/api/health` reports database status and a home page renders with the frozen design tokens.

**Notes.** S11 prerequisites live here. No product logic.

**Related EVAL.** EVAL-083 (secrets scan wired) · **Related TC.** TC-001, TC-002, TC-003, TC-004, TC-005
**Dependencies.** — · **Estimate.** sp:3 · **Milestone.** M-001
Source: tickets.md § TKT-01 · Plan: technical-plan.md § TKT-01
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `pnpm dev` serves `/` and `/api/health` (`{db:"ok"}`)
- [ ] #2 Scripts `typecheck`, `lint`, `test`, `test:e2e`, `eval` exist (eval may be a stub that fails loudly until TKT-03)
- [ ] #3 Design tokens from Design.md §12 in one CSS file, Figtree + Noto Sans Kannada loaded
- [ ] #4 `scripts/cloud-setup.sh` installs Node, pnpm, Playwright browsers (Foundry deferred to TKT-22) and is idempotent
- [ ] #5 `.env.example` names every variable (auth secret, ledger key path, `REMOTE_SENSING_PROVIDER=fixture` default, GFW, Copernicus, ArcGIS/MapTiler keys) with no values
- [ ] #6 CI workflow runs typecheck + lint + test on push
- [ ] #7 Secret scanning in CI
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Acceptance criteria met, tests written first (TDD) and passing
- [ ] #2 Linked TC- and EVAL- cases automated (or manual with evidence) and passing; no regression in the latest pnpm eval run
- [ ] #3 pnpm typecheck && pnpm lint && pnpm test green in CI on the ticket's last commit; UI matches frozen Design.md (four states, 375/768/1440, a11y); no secrets committed; commits carry the TASK id
<!-- DOD:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-29: Stage 7 started in cloud session https://claude.ai/code/session_01HGo9cNkjpsmZsaQ31tkm9J (env udgam, branch build/stage7, Opus 5.5 High).
<!-- SECTION:NOTES:END -->
