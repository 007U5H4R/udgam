# Mockup Exploration & Design Gallery — `t-design`

Loaded when generating **≥ 2 directions** or building **any** Stage 4 HTML mockup, on either the Core or the Web path. Rule: **important design decisions are made visually, not only described.** Mockups are decision tools. They are disposable except for the approved `final/`, and they are never production code. `web-deliverables.md §3` owns *that* a mockup must exist and its evidence rule. This file owns *how* the exploration runs.

## Contents
1. How many directions · 2. Naming · 3. Distinctness test · 4. Plan-then-review · 5. Gallery structure · 6. Mockup content · 7. Parameter panel · 8. Detector pre-check · 9. Viewport validation · 10. Comparison · 11. Parameter-level selection + hybridization · 12. Rounds

---

## 1. How many directions (adaptive)

- **Low uncertainty** (existing system, clear category): **2**
- **Medium:** **3**
- **High** (new brand, creative brief, unfamiliar market): **4**
- **5** only when it's clearly worth it. Quality beats count.

On the **Core** path, a single mockup is still the default. Explore only when a real direction decision exists.

## 2. Naming

A name says **strategy + feeling + distinguishing mechanism**: "Evidence-Led Precision", "Product-in-Action", "Guided Narrative", "Editorial Authority". Empty labels ("Modern", "Premium", "Clean", "Cool", "Safe / Bold / Experimental") are never used unless they genuinely describe the hypothesis.

## 3. Distinctness test

Two directions are **not** distinct if they differ only in colour, font, or border radius. Each pair must differ materially on **≥ 3** of: narrative · hero · IA/section order · density · composition · product evidence · motion · scroll model · imagery · interaction · conversion emphasis. If a pair fails, merge it or replace it.

## 4. Plan-then-review (before writing HTML)

For each direction, write a short plan:
- hypothesis
- narrative YAML
- 4–6 named colour tokens with roles
- typefaces with roles
- ASCII wireframe for desktop + mobile
- hero / nav / scroll / motion intensity
- anti-direction

Then **review the plan against the brief**. If any part reads like the generic default, revise it, and say what changed and why. Spend boldness in one place per direction. Only then build.

## 5. Gallery structure

```
.design/exploration/          ← repo root (or the repo's existing prototype convention, if one exists)
├── index.html                Design Gallery
├── option-a/index.html
├── option-b/index.html
├── option-c/index.html       (as many as §1 decided)
├── og/index.html             public pages only: OG mockup at 1200×630 + thumbnail-scale preview
└── final/index.html          hybrid/refined direction → the approved visual truth, KEPT for Stage 8
```
- **Gallery `index.html` content:** per option, show the name, hypothesis (one sentence), one-line rationale, desktop + mobile snapshot (screenshots saved in `.design/exploration/shots/`), and an "open" link. Compare options side by side.
- **Banner:** every page shows a visible **DESIGN PROTOTYPE — NOT PRODUCTION** banner.
- **Build:** plain HTML + CSS + minimal JS (CDN fonts are fine). No backend, auth, DB, CMS, framework scaffolding, or production component abstraction.
- **Parallel builds:** with ≥ 3 options, subagents *may* build options in parallel from the approved plans (§4). Each gets its plan and the brief, never the whole conversation. The orchestrator keeps every decision.

A **3D direction** (`spatial-3d.md`) competes as a hypothesis against 2D directions and is never assumed to win. Its mockup is a lightweight prototype (simplified geometry, a placeholder model, video or a pre-rendered sequence), never production 3D.

**Product Journey surfaces:** each option is a **journey folder**, not a single page: `option-a/{landing,signup,onboarding,activation,product,returning}.html` (+ mobile). Build only the screens that settle a decision (`product-journey.md §13`). The gallery shows each option as a **filmstrip** of its journey, and the final is `final/` with the same screens linked in order, so the reviewer can click through the whole path.

## 6. Mockup content

Use real product copy and terminology, realistic text lengths (including the longest heading and a multi-line CTA), representative data, and imagery placeholders that match the imagery strategy. Avoid grey wireframes unless requested. **No invented customers, testimonials, metrics, certifications or awards.** Gaps are shown inline as `ASSUMPTION: …`.

## 7. Parameter panel (removable)

Each option has a small collapsible panel, **hidden by default** and never shipped, that shows the direction's dial settings so options can be compared and mixed:

```yaml
visual_direction: Evidence-Led Precision
narrative: Evidence-first
hero: Annotated product artifact
navigation: Sticky minimal
layout: Asymmetric editorial
desktop_scroll: Native
mobile_scroll: Native
motion: Low (1 primary moment)
surface: Flat + hairline border
typography: Serif display + grotesk body + mono for data
conversion: Sample-first
```
On Product Journey surfaces, add the journey dials:
```yaml
journey_strategy: {acquisition, signup: {timing, method}, onboarding: {model, questions}, activation: {event, target_ttv},
                   app_home: {new_user, returning_user}, monetization: {model}, visual_expression: {marketing, onboarding, product}}
```
Based on web-design-engineer's Tweaks-panel pattern, but it *displays* the parameters. Add live toggles only when a toggle settles a real decision.

## 8. Detector pre-check (mechanical anti-slop)

Before showing the user, run impeccable's deterministic design detector once over the mockups: `npx impeccable detect .design/exploration`. That's a manual scan; per-edit hooks are optional via `/impeccable hooks on` (see the `impeccable` skill's `reference/hooks.md`). **Fix each finding, or justify it in one line.** The detector is evidence, not authority, and it doesn't replace the anti-slop gate (grayscale + 20-SaaS), which still runs. If the detector can't run, say so and continue with the manual gate.

## 9. Viewport validation (evidence = rendered screenshots, never code inspection)

- **Every option:** desktop 1440 · mobile 375 · the key interaction · content overflow (longest strings, zoom 200%).
- **Final:** also ~768 where it differs materially, reduced motion, and the relevant input modality (keyboard pass; touch for touch-critical UI).
- **Adaptive width set:** 320 / 375 / 430 / 768 / 1024 / 1440 / 1920. Test a width only when it adds evidence, plus **intermediate widths where the layout actually changes or breaks**, not only named breakpoints.

## 10. Comparison (after the user has seen the previews)

Never ask the user to choose from text alone. Show the gallery first, then a compact trade-off table. There's no single numeric score.

| Criterion | A | B | C |
|---|---|---|---|
| User-goal fit · narrative clarity · product specificity · conversion clarity · trust | | | |
| Mobile viability · accessibility risk · performance risk · implementation complexity · anti-slop risk | | | |

Give a recommendation with **WHAT · WHY · ALTERNATIVE · TRADE-OFF**. "Because it looks modern" is never a reason.

## 11. Parameter-level selection + hybridization

The user may choose per parameter ("A typography, B hero, C scroll, A nav"). Record a hybrid map, check it for incoherence (e.g. an editorial serif system with a neon hero), raise any conflicts, then build `final/`. When the selection mixes concepts with a **structural** conflict (entry flow, app home, nav model, density vs brand continuity), run `grill-me-design post` first:

```yaml
final: {foundation: A, hero: B, typography: A, navigation: A, card_language: B, motion: C, scrolling: C, mobile: A}
```
On Product Journey surfaces, hybridize per journey stage too (e.g. landing A · signup A · onboarding B · activation C · app shell B · empty state C · mobile A), then re-run the seam audit on `final/`, because mixed stages create new seams.

## 12. Rounds

**R1** broad hypotheses → **R2** selected/hybrid direction → **R3** focused refinement → **approval**. Iterate surgically: a small tweak edits `final/`, it never regenerates the gallery. Stop exploring when new options stop changing the decision.

## Output hooks

Feeds `Design.md` §1 (chosen direction + hypothesis), §11, §25, and `decisions.md` `D#` (chosen vs. rejected directions). Cross-refs: [[web-experience]], [[visual-system]], [[anti-ai-slop]], [[design-research]], [[accessibility]].
