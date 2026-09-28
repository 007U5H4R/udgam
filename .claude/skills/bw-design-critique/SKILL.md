---
name: bw-design-critique
description: Build-workflow Stage 8 (UI work only) — Design Critique. Use to critique the running frontend against Design.md via the impeccable skill, recording DES- findings and fixing/parking them until clean. Skip for non-UI builds. Invoked by workflow/build-workflow.md.
---

# Stage 8 · Design Critique (conditional — UI work only)

**Model/effort:** Sonnet 5 (`claude-sonnet-5`), High. **Underlying skill:** `impeccable`.
**Companion checklist (reference):** `~/.claude/web-deliverables.md` (mobile, OG, four screen states as done-gates).
Global rules: `~/.claude/CLAUDE.md`. Orchestrator (finding IDs, QA-report carry-forward): `~/.claude/workflow/build-workflow.md`.

## Trigger
Stage 8, UI work with a running implementation to interact with. Runs before Code/Security review so any code changes it triggers are themselves reviewed.

## Do Not Trigger
Non-UI builds (APIs, CLIs, libraries, scripts) — skip to Stage 9. No running UI to exercise.

## Inputs
The running app; `Design.md`; the Stage-4 **user-approved HTML mockup** (+ OG mockup for public web); `web-deliverables.md`.

## Procedure
1. Run `impeccable` against the **actual running implementation** (open and interact — don't only read source): IA, navigation, user flows, visual hierarchy, layout/spacing/typography, fidelity to `Design.md` **and the approved mockups**, responsive behavior, accessibility, content/copy, the four screen states, feedback, discoverability, cognitive load, edge-case UX. Flag any material divergence of the implementation from the approved mockup. **If `Design.md` §15 chooses a non-native scroll model**, independently critique scroll/motion fidelity against its Scroll Strategy and the mockup on desktop and phone, and flag scroll-jacking, hidden horizontal scroll, scroll traps, or decorative scroll-linked motion (`~/.claude/skills/t-design/references/motion-scroll.md`). **If `Design.md` §26 (Spatial 3D) exists**, also critique per `spatial-3d.md` §13 (framing, interaction clarity, product relevance, mobile adaptation, fallback quality, fidelity to the approved 3D prototype). **If `Design.md` §27 (Product Experience) exists**, critique **across seams**, not screen by screen: website → auth → onboarding → app → billing, returning-user routing, activation clarity, empty states, terminology, visual continuity, mobile (`product-journey.md §11`).
2. Record each meaningful finding as **`DES-###`**: screen/component, related M-/ticket/task, finding, category, severity, recommendation, resolution, verification status. Do not log personal aesthetic preference unless it materially harms usability/accessibility/consistency/intent/design-system.
3. Triage and rectify each finding (or park with an explicit written reason); re-run until clean.

## Delegation Policy
**Preferred.** A `design-reviewer` subagent can drive the running app and return `DES-` findings as a concise report, keeping large vision-token reasoning out of the orchestrator; fixes land via the execution loop.

## Outputs
`DES-###` findings → fixes (carried into `QA-report.md`).

## Exit Criteria
Re-run is clean: every `DES-` finding resolved or parked with reason; `web-deliverables.md` done-gates verified on the real thing.

## Handoff
Rewrite `HANDOFF.md` → Stage 9; recommend `/clear`.
