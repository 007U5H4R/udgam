---
name: bw-ui-ux-design
description: Build-workflow Stage 4 (UI work only) — UI/UX Design. Use for user-facing UI to turn the approved Solution-PRD.md into a Design.md spec via the t-design pipeline (cognitive/behavioral/emotional psychology, HCI/usability heuristics, production-pattern research, anti-AI-slop gates, visual/design-system spec, accessibility, responsive behavior, design validation; optional /design visual exploration), honoring the mandatory web-deliverables gates. Skip for non-UI builds. Invoked by workflow/build-workflow.md.
---

# Stage 4 · UI/UX Design (conditional — UI work only)

**Model/effort:** Sonnet 5 (`claude-sonnet-5`), Medium. **Underlying skill:** `t-design`.
**Companion checklist (load when applicable, do not copy here):** `~/.claude/web-deliverables.md` — mandatory mobile-responsiveness, link-preview/OG, and four-screen-states gates.
Global rules: `~/.claude/CLAUDE.md`. Orchestrator: `~/.claude/workflow/build-workflow.md`.

## Trigger
Stage 4 for **user-facing UI work** (websites, apps, dashboards, components) with an approved `Solution-PRD.md`.

## Do Not Trigger
Non-UI builds (APIs, CLIs, libraries, scripts) — skip straight to Stage 5. No approved `Solution-PRD.md`.

## Inputs
`Solution-PRD.md` (approved); `web-deliverables.md` (loaded for the design gates + HTML-mockup / OG contracts); for a public web page, its companion `~/.claude/workflow/og-image-guidelines.md` (OG design methodology).

## Procedure
1. Run `t-design` on the Solution-PRD (it routes unresolved HIGH/CRITICAL UX decisions, and structurally conflicting mockup selections, through `grill-me-design`). It loads only what the product warrants (progressive disclosure): design-system discovery → mental-model/cognitive-load/attention analysis → Mobbin production-pattern research + optional Higgsfield generative assets + optional `/design` visual exploration → design-system/motion/perception-law skills → the behavioral/emotional/HCI references → the **ethical behavioral-design gate** and the **anti-AI-slop gate** (grayscale + 20-SaaS tests).
2. Produce the canonical **`Design.md`** (t-design's 24-section structure): design direction + anti-direction, user/mental-model context, emotional journey, IA + attention + cognitive-load analysis, behavioral rationale, production-pattern research, anti-references, OKLCH design system, component/interaction/motion specs, responsive behavior, WCAG 2.2 accessibility, four screen states, trust/AI-epistemic UX, error strategy, interaction-cost analysis, validation plan, and the Design QA checklist.
3. Treat the `web-deliverables.md` **design gates** as stated requirements: mobile nav/breakpoint behavior, OG image + tags, and the four screen states (loading/empty/error/working) are decided now, not after.
4. Build lightweight, **non-production** HTML/CSS mockups in `.design/exploration/` (`web-deliverables.md §3`). For Web/Both surfaces, or whenever a real direction decision exists, build 2–4 hypothesis-driven directions in a gallery and let the user compare and mix them into `final/` (`t-design/references/mockup-exploration.md`). Cover the priority screens (entry/home, primary task flow, key result, an important empty/error state, mobile) — `Design.md` alone is **not** sufficient for Stage 4 approval. Run the anti-AI-slop + wireframe-integrity check, render at desktop / ~768px / ~375px, show the user, and get **explicit approval** (revise-and-re-show until approved; mockup and `Design.md` must not diverge).
   **Product Journey surfaces** (public site → authenticated product): the mockups cover the representative journey (landing → entry → onboarding → first value → product → returning), the seam audit and integrity gates in `t-design/references/product-journey.md §11` pass, `analytics/product-analytics-contract.md` exists, and the approval question is *"Do you approve this complete product-entry and activation journey?"*, not just the landing page.
5. For a **publicly reachable page**, also produce an OG image mockup per `web-deliverables.md §4` + `workflow/og-image-guidelines.md` (research → archetype → mockup → 2-second/thumbnail/anti-slop checks) and get explicit OG approval alongside the UI mockup.
6. On approval, write the **Design Freeze** block into `Design.md` (`t-design/references/design-md-template.md`) and append load-bearing design decisions to `decisions.md` as `D1`, `D2`, ….

## Delegation Policy
**Unnecessary.** The design pipeline (including its MCP tools) runs in the main context; splitting it loses cross-decision coherence.

## Outputs
`Design.md`; a user-approved HTML mockup (+ OG image mockup for public web); `decisions.md` (`D#` entries).

## Exit Criteria
`Design.md` is signed off, its tokens/components/motion are concrete (no placeholders), the **HTML mockup is user-approved** (and the OG image mockup for a public page), the **ethical behavioral-design gate** and **anti-AI-slop review gate** pass (every box checked or justified), and the three `web-deliverables.md` design gates are addressed. Do not proceed to Stage 5 without explicit user approval of the mockup(s).

## Handoff
Rewrite `HANDOFF.md` → Stage 5 Problem Breakdown; recommend `/clear`.
