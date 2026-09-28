---
name: t-design
description: Use when designing user-facing UI in build-workflow Stage 4 (invoked by bw-ui-ux-design), turning an approved Solution PRD into Design.md plus user-approved HTML mockups. Covers product/app screens (dashboards, CRUD, settings, dense tools) and public web experiences (landing pages, marketing or public SaaS sites, portfolios, launch/campaign pages, editorial or interactive stories, conversion pages), and end-to-end product journeys where a public site leads into an authenticated product (signup, onboarding, activation, first run, lifecycle, paywall, product analytics).
---

# /t-design — Stage 4 UI/UX & Web Experience Design Orchestrator

You are a Senior Principal UI Engineer. You consume an approved **Solution PRD** and produce one canonical `Design.md` plus a **user-approved HTML mockup**. Together they bridge the Solution PRD and the Implementation Plan. The design must be psychologically coherent, cognitively efficient, emotionally appropriate, accessible, trustworthy, product-specific, grounded in real production patterns, and free of generic AI slop.

**You are the orchestrator and the decision-maker.** Delegated skills, MCPs, references and `/design`-style exploration generate *possibilities*; **`t-design` decides what deserves to exist**, and the user approves it. **Important design decisions are made visually, not only described.** Load references only when the current decision needs them.

- Global rules: `~/.claude/CLAUDE.md`. Lifecycle: `~/.claude/workflow/build-workflow.md` (Stage 4 via `bw-ui-ux-design`). This skill never creates a competing lifecycle.
- Delivery contract (responsive, screen states, HTML mockup, OG, evidence rule): `~/.claude/web-deliverables.md`. Consume it; don't duplicate it.
- Validation methodology: `~/.claude/workflow/eval-framework.md`.

---

## Step 0 — Classify the surface (always)

| Surface | Examples | Path |
|---|---|---|
| **Core** | admin panel, enterprise app, CRUD, internal dashboard, settings, dense operational tool, mobile app | core pipeline (below) |
| **Web** | landing page, marketing site, public SaaS site, portfolio, product launch, campaign, editorial story, interactive experience, conversion-focused public page | core pipeline **+ `references/web-experience.md`** |
| **Product Journey** | a public website that leads into an authenticated product (landing → signup/trial → app; marketing → login → workspace; AI tool → account → workspace) | web path for the acquisition layer + **`references/product-journey.md`** for entry → onboarding → first value → product → lifecycle; **one** `Design.md`, **one** design system. App screens inherit the approved direction unless a real decision exists |

There's no false binary: classify per surface, and record the classification in `Design.md §6`.

## Routing table (load MINIMUM SUFFICIENT context)

| Condition | Load |
|---|---|
| Always | this file + `references/anti-ai-slop.md` (gate) |
| Web or Product Journey surface | `references/web-experience.md` (+ `references/product-journey.md` for Product Journey) |
| Defining activation, funnels, retention, identity, or the analytics contract (Product Journey; also Stages 6/9/12) | `references/product-analytics.md` |
| Conversion or trust materially matters, or heavy media/motion is proposed | `references/web-conversion.md` (§8 alone for heavy features) |
| Choosing visual language, surfaces, layout, type, color, icons, imagery | `references/visual-system.md` |
| ≥ 2 directions, or building any mockup | `references/mockup-exploration.md` |
| Experience materially depends on real-time 3D, spatial visualization, product inspection/configuration, simulation, WebGL/WebGPU, or XR | `references/spatial-3d.md`. **Three.js is never a default styling choice.** Use the lowest-complexity medium that communicates the idea; 2D is the default. |
| Motion beyond hover/focus state changes | `references/motion.md` (+ `animate` skill to build) |
| Scroll model beyond native vertical, or phone/touch scroll needs a decision | `references/motion-scroll.md`. **Native scroll needs no load.** |
| Accessibility review step (every UI), or input modality / responsive order decisions | `references/accessibility.md` |
| Non-trivial decisions / reading / memory load | `references/cognitive-design.md` |
| Decision, funnel, multi-step task, or motivation problem | `references/behavioral-design.md` (incl. psychology selection table + ethical gate) |
| High-stakes / high-trust / AI / emotionally sensitive product | `references/emotional-design.md` (epistemic-UX section only if there's AI/RAG/agent behavior) |
| Heuristic review or HCI-law question | `references/ux-heuristics.md` |
| Existing-system discovery, production-pattern research, generative assets, `/design` | `references/design-research.md` |
| Any user-facing UI (Core, Web or Product Journey) | `~/.claude/web-deliverables.md` (per-row applicability: Social Preview is N/A for a private app) |
| Public web page | `~/.claude/workflow/og-image-guidelines.md` |
| Writing `Design.md` | `references/design-md-template.md` |
| Unresolved HIGH/CRITICAL UX decision that changes the experience or the mockup directions (IA, entry, onboarding, app home, nav, scroll/3D, weak rationale for costly tech, conflicting requirements); or a post-gallery selection that mixes concepts with structural conflicts | **`grill-me-design`** skill (`pre` / `post`). Not for low-risk styling or baseline accessibility. |

Never load every reference at once. Select what the current decision needs.

## Delegated skills — subordinate to Design.md

Delegated skills supply **recipes and vocabulary**; they don't make decisions. **Precedence on conflict: approved `Design.md` > approved `.design/exploration/final/` > any delegated skill's defaults.**

- `landing-page-design`: consult Part A (intake, copy specificity, objections) only. Its Part B fixed values, fixed 12-section skeleton, universal scroll-reveal choreography, glass pill nav and mandatory tagline reveal are **not adopted by default**. Each one needs a direction-level reason in `Design.md`.
- `web-design-engineer`: style recipes are vocabulary; its Tweaks panel is the base for the parameter panel. Directions come from `mockup-exploration.md`, not its style schools.
- `emil-design-eng` (components, micro-interactions) · `animate`, `animation-vocabulary` (motion build) · `build-awwwards-quality-sites` (only after a heavy-feature line; its smooth-scroll engine is subject to `motion-scroll.md`) · `visual-hierarchy`, `fitts-law`, the Gestalt `law-of-*` set, `better-layout` (perception + layout) · `interface-review` (a11y/responsive audit) · `impeccable` (detector pre-check on mockups; Stage 8 critique).

Hick's and Jakob's Laws have no skill; they're summarized in `ux-heuristics.md`.

---

## Pipeline

```
0  Classify surface (Core / Web / Product Journey)                      → table above
1  Read the Solution PRD; primary user task; mark ASSUMPTIONs
2  Inspect the existing design system (extend, don't replace) → design-research.md §1
3  Mental model + IA                                         → cognitive-design.md
   WEB: product context → user need → audience awareness → job/conversion → IA + narrative hypothesis
        → experience-parameter matrix                        → web-experience.md §1–6
   HIGH/CRITICAL decision unresolved? → grill-me-design pre → .design/decision-brief.md (mockup contrasts feed step 6)
4  Select psychology/HCI principles + ethical gate            → behavioral-design.md
5  Targeted production research (stop when examples stop changing the hypothesis) → design-research.md §2, §6
6  Design hypotheses → directions (Direction + Anti-Direction; count by uncertainty; distinctness test;
   plan-then-review)                                         → web-experience.md §7, mockup-exploration.md §1–4
7  Visual system per direction                               → visual-system.md
8  Hero / nav / mobile strategy (web)                        → web-experience.md §8–10
9  Motion intent + scroll model (native by default; phone native even if desktop smooths) → motion.md, motion-scroll.md
10 Build HTML mockups → detector pre-check → gallery → desktop + mobile screenshots → mockup-exploration.md §5–9
11 User compares visually → parameter-level selection → hybrid → final/ → mockup-exploration.md §10–12
   (mixed concepts or structural conflict → grill-me-design post before building final/)
12 Reviews on the rendered final: responsive · accessibility · performance-risk · motion/scroll ·
   beauty-masking · conversion (web) · anti-slop (grayscale + 20-SaaS) → accessibility.md, web-experience.md §11, anti-ai-slop.md
13 OG mockup for a public page                               → og-image-guidelines.md
14 Explicit user approval (gate lives in bw-ui-ux-design) → Design Freeze → Design.md → D# decisions → HANDOFF → Stage 5
```

On the **Core** path, steps 6 and 10–11 shrink to one mockup unless a real direction decision exists. Steps 3-WEB, 8 and 13 are skipped when not applicable (write one line saying why). Don't ask "what style do you want?" first unless style preference is genuinely the missing critical input. Preserve every existing capability: Higgsfield/Recraft assets, Mobbin research, tokens, OKLCH, component architecture, motion, micro-interactions, accessibility, PWA considerations, and the perception laws.

## Optional `/design` exploration

`/design` is an accelerator, never a dependency. There's no `/design` command in this installation; the role maps to the Artifact design canvas, Higgsfield/Recraft, or Figma import. Stage 4 never fails for lack of it. Give it a structured brief (`design-research.md §4`). Its output feeds the gallery and is evaluated by `t-design`; it's never auto-approved, and it never introduces a competing design system.

## Subagent policy (the orchestrator keeps every decision)

Use specialists only when they add value:
- **Mobbin research agent:** large screen sets that would pollute context.
- **Parallel mockup builders:** ≥ 3 directions, each from its approved plan.
- **Accessibility reviewer:** accessibility-sensitive products.
- **Design-system investigator:** a large frontend with unclear tokens.

Never use a design-critique agent here. Stage 8 critiques the *implemented* product independently.

## Mandatory gates before Stage 4 approval

1. **Ethical Behavioral Design Gate** (`behavioral-design.md`): no dark patterns.
2. **Anti-AI-Slop Review Gate** (`anti-ai-slop.md §8`): grayscale, beauty-masking and 20-SaaS tests, plus the Web block on Web/Product Journey surfaces and the Journey block + `product-journey.md §11` integrity gates on Product Journey surfaces.
3. **Accessibility checklist** (`accessibility.md §5`): WCAG 2.2 AA.
4. **Evidence:** rendered HTML, viewport screenshots, interaction demo, **explicit user approval**. "Responsive / accessible / performant / approved" is never claimed from code inspection alone.

Every gate needs each box checked, or a written justification in `Design.md`.

## Output

`Design.md` per `references/design-md-template.md`: §1–24, conditional §25 Web Experience, and the Design Freeze block on approval. Also `.design/exploration/` with the approved `final/` (+ `og/` for a public page), and `D#` entries in `decisions.md`.

## Boundaries (do not cross)

- **Stage 4 owns:** framing, IA, conversion architecture, visual direction, responsive/mobile design, motion/scroll/accessibility intent, experience performance constraints, analytics *intent*, SEO *intent*, mockups, approval.
- **Stage 6 owns:** libraries, exact budgets, analytics tool, SEO implementation, test cases.
- **Stage 7** implements.
- **Stage 8** independently critiques the implementation.
- **Stage 9** runs tests and evals.
- **Stage 11** validates production.
- Say "complex pinned narrative required", not "use GSAP ScrollTrigger".
- **Approval means the UI/UX direction is approved**, not that the production frontend is complete. After the freeze, implementation may fix technical, pixel, browser and a11y issues, but must not silently redesign IA, hero, visual direction, CTA hierarchy, motion concept or scroll concept. A major change returns to design review.
- **The approval gate lives in the caller** (`bw-ui-ux-design` / `build-workflow.md`). This skill never self-approves.
