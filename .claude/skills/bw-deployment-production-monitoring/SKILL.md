---
name: bw-deployment-production-monitoring
description: Build-workflow Stage 11 — Deployment + Production Monitoring. Use only after the QA-report.md gate is approved to finish the branch, deploy with evidence-first verification, stand up monitoring, and write lesson-learnt.md. Invoked by workflow/build-workflow.md.
---

# Stage 11 · Deployment + Production Monitoring

**Model/effort:** Opus 5.5 (`claude-opus-5-5`), Standard. **Underlying skill:** `superpowers:finishing-a-development-branch` + CI/CD.
Global rules: `~/.claude/CLAUDE.md` (blast-radius / confirm before externally-visible actions). Orchestrator: `~/.claude/workflow/build-workflow.md`.

## Trigger
Stage 11, **only after** Design Critique, both Stage-9 responsibilities, Security Review, and the `QA-report.md` gate (Evaluation + Release gates) are approved.

## Do Not Trigger
QA gate not approved or shows an unresolved Critical; no deploy target.

## Inputs
Approved `QA-report.md`; the reviewed branch; deploy config/env; `evaluation-plan.md` (for live eval metrics).

## Procedure
1. `finishing-a-development-branch` cleans up the worktree and presents **merge / PR / keep** options. Read the changed-file list (`git diff main..HEAD --stat`) before any push/PR.
2. Deploy: pre-deployment verification, env/build/config validation, migration + secret/env checks, release notes, execution, smoke testing, post-deployment validation, health checks, rollback readiness.
3. **Evidence-first** (never assume success from exit 0): open the deployed app, validate major flows, confirm critical APIs/health endpoints, verify observability + production config.
4. **Production Monitoring:** stand up (or confirm) telemetry, health checks, error/latency/quality dashboards, alerting — including live eval metrics where applicable ("how would we know at 3 AM if it broke?"). Record release provenance (version/commit/build/config/model where relevant). Confirm deploy scope + downstream consumers before shipping anything externally visible.
5. Write **`lesson-learnt.md`** (Situation → Decision → Outcome → Lesson → Future Rule), ending with **## Reusable Rules for Future Projects** and **## Candidate Global CLAUDE.md Improvements** (record suggestion + evidence + project-specific-vs-generalizable + recommendation; **do not auto-edit the global CLAUDE.md**).

## Delegation Policy
**Optional.** A `production-verifier` subagent can run post-deploy flow/health checks and return a concise pass/fail; release execution + provenance stay in the main context (blast radius).

## Outputs
Released/merged branch; live monitoring; `lesson-learnt.md`; recorded provenance.

## Exit Criteria
Deployed app verified live against real flows/APIs/health; monitoring + alerting up; provenance recorded; rollback ready.

## Handoff
Rewrite `HANDOFF.md` → Stage 12 (ongoing production loop); recommend `/clear`.
