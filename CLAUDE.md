# Udgam — project instructions

Udgam is an MVP for verifiable agricultural provenance (EUDR coffee traceability, Kodagu/Chikkamagaluru). The defensible core is the trust-at-the-edge verification layer; the ledger is plumbing. **Build tier: Full** (UI, public surface, security-sensitive) — all 12 stages apply.

## Start here, every session
1. Read `HANDOFF.md` — it says which stage is next and which files to read.
2. Then read `Discovery-PRD.md`, `Solution-PRD.md`, `decisions.md` as HANDOFF directs.
3. Follow the build workflow: `.claude/workflow/build-workflow.md`, invoking the `bw-*` stage skill it names.

## Path mapping (vendored snapshot)
The workflow files and stage skills were written for the owner's Mac and cite home-directory paths. In this repo, read them here instead:

| Cited path | Read this |
|---|---|
| `~/.claude/CLAUDE.md` | `.claude/workflow/global-CLAUDE.md` |
| `~/.claude/workflow/build-workflow.md` | `.claude/workflow/build-workflow.md` |
| `~/.claude/workflow/eval-framework.md` | `.claude/workflow/eval-framework.md` |
| `~/.claude/workflow/og-image-guidelines.md` | `.claude/workflow/og-image-guidelines.md` |
| `~/.claude/web-deliverables.md` | `.claude/workflow/web-deliverables.md` |
| `~/.claude/skills/<name>/…` | `.claude/skills/<name>/…` |

This is a **snapshot** taken 2026-09-28. The authoritative source is the owner's dotfiles repo (`claude/` folder). Do not edit the vendored copies here to change process; if the process needs to change, say so and the owner updates dotfiles, then re-snapshots.

## Rules that hold in every session
- **Human gate after every stage.** Stop at each stage's end, present the output and file paths, and wait for the owner's explicit approval before starting the next stage. Name the next stage's model and effort at that checkpoint.
- **No build without an approved `Solution-PRD.md`.** Stage 2 is approved only when its §13 sign-off is ticked.
- **Preserve IDs.** Never renumber `DISC#`, `S#`, `EV#`, `D#`, `TP#`, `EXE#`, `M-`, `TC-`, `EVAL-`, `DES-`, `CR-`, `QA-`, `SEC-` IDs. `decisions.md` is append-only.
- **Rewrite `HANDOFF.md`** at the end of every stage (one file, never one per stage).
- **Secrets never enter the repo.** Ledger key, provider API keys, auth secret come from env or `.secrets/` (gitignored).
- **Commits:** one logical change per commit, imperative subject. In a cloud session, commit and push the stage's artifacts after the owner approves the stage, so the work survives the session.

## What a cloud session cannot do (hand these back to the local machine)
- **Campfire Board PWA** (local-only dashboard). Stage 6 onboarding and every Campfire sync must run locally. In the cloud, write the Markdown artifacts and list in `HANDOFF.md` exactly what must be synced to Campfire.
- **Obsidian vault and auto-memory persistence.** Record progress in `HANDOFF.md`; the owner's local session mirrors it to the vault.
- **Local-only MCP servers** may be missing. If a stage skill needs one that is unavailable, say which, and continue with everything else.
- Machine rules in `global-CLAUDE.md` about `/Volumes/E Drive` apply to the owner's Mac, not to the cloud sandbox.

## Stage 7 execution in the cloud (from technical-plan.md §21.2)
- **Branch:** work on `build/stage7` (from `main`); never push to `main`.
- **Per task:** one fresh implementer subagent per task in technical-plan.md §22, using TDD, then a spec-compliance review and a code-quality review by fresh reviewers. Allow at most 2 fix rounds, then write a `BLOCKED` row in the ledger. Make one commit per task with the subject `<imperative summary> (TASK-n)`, using the native Campfire ID.
- **Parallelism:** at most 3 implementers at once, each in its own worktree, with the disjoint file ownership in technical-plan.md §3.3 and §20.
- **Gates:** after each §20 phase, run `pnpm typecheck && pnpm lint && pnpm test`, `pnpm eval` (from P3 on) and `pnpm test:e2e` (for UI phases). An independent QA subagent re-checks the phase's acceptance criteria and TC/EVAL cases. Update `docs/exec/ledger.md`, push, and post a gate report. **At the M-001 gate (after TKT-21 = TASK-22), stop and wait for the owner's approval** before M-002 or M-003.
- **Never:**
  - print or echo environment variables or secrets;
  - edit `backlog/` (Campfire is local-only, TP22);
  - change a Design Freeze item;
  - weaken a threshold, weight, expected verdict or case class, or move `cfg-1` after baseline-v1 (EV13, CF-13);
  - delete, hide or hand-edit an eval case or a results file.
- **Decisions:** append decisions made during execution to `decisions.md` as `EXE1…`. Record scope changes in the ledger with the reason, and wait for the owner.
