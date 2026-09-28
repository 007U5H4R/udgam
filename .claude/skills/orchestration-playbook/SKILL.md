---
name: orchestration-playbook
description: >
  The full spec for executing an implementation plan with subagents. Load this
  BEFORE running subagent-driven-development or executing any multi-task plan —
  it holds the worktree/branch + ledger setup, the one-implementer-per-task
  dispatch rule, the per-task review and bounded fix loop, explicit per-task
  model assignment, the final whole-branch review, and the human-in-the-loop
  checkpoints. Trigger on: "execute the plan", "run subagent-driven development",
  "orchestrate this build", or when starting the build phase of an approved plan.
---

# Orchestration Playbook — subagent-driven development

Execute an approved task-by-task plan with an explicit **orchestration plan**.

## Setup
- Isolated git worktree/branch — never `main` without consent.
- A progress **ledger** file that survives context resets (records task status,
  decisions, and open threads).

## Per-task loop
- **One fresh implementer subagent per task.** No parallel implementers.
- Pass the brief and receive the report as **files**, never pasted history.
- After each task: run a **task review** (spec compliance + quality).
- Then a bounded **fix loop**, max 5 rounds:
  - Rounds 1–3: resume the implementer.
  - Rounds 4–5: escalate to a more capable model.
  - At the breaker: adjudicate/park, or escalate — don't loop past 5.

## Model assignment (name the model on EVERY dispatch)
- Cheap model — transcription / mechanical tasks.
- Standard model — integration tasks.
- Most-capable model — design-judgment, highest-risk tasks, and the final review.

## Close-out
- Final **whole-branch review** on the most capable model.
- A single fix wave to clear its findings.
- Then run `finishing-a-development-branch`.

## Human-in-the-loop checkpoints (flag, never fake)
- On-device / real-app testing.
- Subjective look-checks.
- Plan conflicts discovered mid-build.
- Load-bearing breakers (the max-5 fix-loop limit being hit).

When design + plan are documented but execution is deferred, also write an
orchestration/execution playbook alongside the plan so build day is turnkey.
