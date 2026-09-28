# Web & UI Delivery Contract

Referenced from the global `CLAUDE.md`; loaded as a companion by `build-workflow.md` Stages 4/8/9/11 for user-facing UI and public web work. This file is the **cross-cutting delivery contract** — *applicability → contract → verification → evidence*. It is **not** a design-theory encyclopedia: cognitive/behavioral/emotional theory, WCAG/typography/color/motion theory, and the full anti-AI-slop catalog stay in `t-design` and its `references/`. OG *design methodology* lives in the companion `~/.claude/workflow/og-image-guidelines.md` (loaded only when a public OG image is being designed).

---

## Applicability

| Contract | Applies when | Otherwise |
|----------|-------------|-----------|
| **1. Responsive** | any user-facing UI | N/A for API / CLI / library / script |
| **2. Screen States** | data-backed or mutating UI | N/A for a purely static informational page |
| **3. HTML Mockup** | Stage 4 user-facing UI work | N/A for non-UI builds |
| **4. Social Preview / OG** | a publicly reachable web page | N/A for a private/internal-only app |

Examples: API/CLI/library → all UI contracts **N/A**. Private internal app → Social Preview may be **N/A**. Static informational page → Screen States may be **N/A**. Mark the row **N/A** with the one-line reason; don't silently drop it.

## Evidence Rule

**CODE PRESENCE IS NOT PROOF.** A CSS breakpoint ≠ responsive PASS · an error component ≠ error-state PASS · OG metadata in source ≠ social-preview PASS · an HTML prototype existing ≠ design approval.

An applicable requirement is **PASS** only when backed by **observable evidence** (exercised on the running app / inspected production HTML / fetched asset). Use **PASS · FAIL · BLOCKED · N/A** consistently. **BLOCKED** = verification is genuinely impossible (no production URL, no browser, inspector outage, auth wall, network/env limit); record the exact blocker + checks already done + the remaining action. **Never invent PASS.** Route evidence into the existing `test-cases.md` → `QA-report.md`; do **not** create a `web-deliverables-report.md`.

---

## 1. Responsive Contract

**Design-time (Stage 4)** — decide, where relevant, the: mobile nav model · desktop nav model · tablet behavior · content prioritization · table/wide-content strategy · action placement · modal/dialog behavior · overflow · touch behavior · responsive typography · fixed/sticky behavior. Do not accept "desktop → stack everything vertically → responsive complete." Always answer: **"What is the mobile task model?"**

**Verification** — exercise at **~375px**, **~768px**, and **desktop**; confirm: no unintended horizontal page scroll · nav usable · primary actions reachable · readable without pinch-zoom · touch targets usable · content not clipped · dialogs/modals usable · wide-content behavior intentional · desktop not regressed.

## 2. Screen-State Contract

**Core states (every applicable view):** Loading · Empty · Error · Populated/Success. **Conditional (add only when the real system can enter them):** Processing · Partial · Offline · Permission-denied · Stale · Success-confirmation. Do not manufacture states the system cannot reach.

Each applicable state makes clear: **what is happening · what the user sees · what they can do next · whether work/data was preserved · how recovery works.** Every error answers **WHAT HAPPENED? · WHAT CAN I DO NEXT? · DID I LOSE ANYTHING?** and shows a real retry/recovery control, never a vanishing message. **Verification:** exercise each applicable state on the running app (zero rows, mid-load, forced failure, populated) — green tests prove the code runs, seeing the states proves it's right.

## 3. Stage 4 HTML Mockup Contract

For user-facing UI work, **`Design.md` alone is NOT sufficient for Stage 4 approval.** Before Stage 4 completes, build a lightweight HTML/CSS prototype the user can visually inspect. It is **DESIGN EVIDENCE, not production implementation** — validate hierarchy, layout, typography, spacing, density, navigation, component composition, major interactions, responsive behavior, and important states.

- **Fidelity:** prefer product-specific copy, representative data + realistic text lengths, the proposed palette/typography/spacing, the intended design-system direction, representative imagery, and **desktop + mobile** layouts. Do **not** build a real backend, auth, DB, production APIs, or unnecessary framework abstractions — prefer simple **HTML + CSS + minimal JS**.
- **Location:** `.design/exploration/` (or the repo's existing prototype location), marked **DESIGN PROTOTYPE — NOT PRODUCTION**. A multi-option gallery may precede the approved `final/index.html`, which is **kept** as Stage 8 input (gallery workflow: `t-design/references/mockup-exploration.md`). Never silently mix prototype code into production code.
- **Scope (don't prototype every screen):** prioritize (1) entry/home, (2) primary task flow, (3) key result/output, (4) an important empty/error state, (5) mobile representation. Add more only to settle a real design decision.
- **Interactivity:** add lightweight nav/tabs/dialogs/dropdowns/progressive-disclosure/form-progression/selection/loading→result/hover-focus only when it improves validation. Do not recreate production business logic.
- **Anti-slop + wireframe integrity:** before presenting, run the **`t-design` anti-AI-slop review gate** (`skills/t-design/references/anti-ai-slop.md §8`) — this file owns *when the gate runs*, not the catalog. Minimum: no generic SaaS-template structure, no unjustified card-everything, no fake metrics, no generic AI marketing copy, no gratuitous gradient/glass/glow, no badge/icon saturation, no dashboard-by-default, no fake AI processing, and **hierarchy holds without decoration** (if color/gradients/shadows/icons/motion vanished, would hierarchy + task flow still work? If no, revise the structure).
- **Approval gate:** render → inspect desktop → ~768px where materially relevant → ~375px → verify important states/interactions → show the user → summarize key design decisions → **STOP** and ask: *"Do you approve this UI/UX direction, or would you like changes?"* Do **not** proceed to Stage 5 without explicit approval.
- **Revision loop:** feedback → update `Design.md` → update mockup → re-render → re-verify responsive → show again → request approval; repeat until approved. The approved mockup and `Design.md` **must not diverge**.

## 4. Social Preview / OG Contract

Treat Open Graph as a **first-class design deliverable** for publicly reachable pages. Lifecycle: **PAGE PURPOSE → OG RESEARCH → OG DIRECTION → OG MOCKUP → USER APPROVAL → IMPLEMENTATION → DEPLOYMENT VERIFICATION.**

- **Design methodology → companion.** Research sources/hierarchy, archetypes, the 2-second + thumbnail + safe-composition tests, product visual-DNA, deterministic text rendering, the "not a mini-webpage" rule, and the **OG anti-slop gate** live in `~/.claude/workflow/og-image-guidelines.md`. Load it during Stage 4 when a public web surface applies. Core principle: **an OG image is not a webpage shrunk to 1200×630 — it is the clearest, most recognizable, product-specific expression of the page that still reads as a small social preview.**
- **Stage 4 approval:** present `Design.md` **+ HTML UI mockup + OG image mockup**; explain the chosen archetype, core message, reference insights, and relation to the product's visual system; ask for explicit OG approval; revise on rejection (never ship a known-rejected direction).
- **Required metadata (Stage 7, applicable public pages):** `og:type`, `og:site_name`, `og:title`, `og:description`, `og:url`, `og:image` (+ `og:image:width` / `:height` / `:alt`); `twitter:card=summary_large_image` with `twitter:title` / `:description` / `:image`; plus a real `<title>` and `<meta name="description">`.
- **Asset:** landscape ~**1200×630** (≈1.91:1) unless a target platform requires otherwise; crisp/optimized, **preferably <500 KB, generally <~1 MB** (don't sacrifice obvious quality for a byte count). **Render critical text deterministically** (HTML/canvas/Figma/code) — never trust a diffusion model for logo/wordmark/headline/data/labels.
- **Absolute URLs:** production `og:url` and `og:image` must be **absolute HTTPS** on the production domain — root-relative paths fail social crawlers.
- **Crawler-visible metadata:** the tags must exist in **crawler-visible static or server-rendered HTML** (SSR/SSG/prerender/edge). A simple SPA shell may use static document metadata; route-specific previews need a crawler-visible strategy. Do not rely on client-side JS mutation after load. A strong global fallback beats broken dynamic metadata.
- **Verification (Stage 11):** crawler-visible metadata present · absolute URLs · `og:image` HTTP 200 · dimensions correct · title/description values correct · actual unfurl via **LinkedIn Post Inspector** + an independent OG inspector (opengraph.xyz). If an external inspector is unavailable, verify everything else and mark **external preview = BLOCKED** (not PASS). Scrapers cache: re-scrape after changes (append `?v=N` for WhatsApp); never let the OG image 404 during a deploy.

  | Check | Evidence | Result |
  |---|---|---|
  | og:title / og:description | production HTML | PASS/FAIL/BLOCKED |
  | og:image present + absolute | production HTML | PASS/FAIL/BLOCKED |
  | og:image reachable | HTTP 200 | PASS/FAIL/BLOCKED |
  | ~1200×630 asset | asset inspection | PASS/FAIL/BLOCKED |
  | live unfurl | Post Inspector / opengraph.xyz | PASS/FAIL/BLOCKED |
  | thumbnail legibility | Stage 4 review | PASS/FAIL |

---

## 5. Workflow Ownership

**Stage 4** responsive strategy · state design · HTML mockup · OG research + mockup · user approval → **Stage 5** applicable UI requirements represented in tickets → **Stage 6** verification cases planned → **Stage 7** production implementation (metadata, image asset, routing) → **Stage 8** implementation fidelity vs `Design.md` **+ approved mockups** → **Stage 9** executable UI / state / responsive verification → **Stage 11** production metadata + unfurl verification. (Full lifecycle: `build-workflow.md` — not duplicated here.)

**QA integration:** record evidence in the repo's existing `test-cases.md` → `QA-report.md` using its actual ID convention — e.g. `TC-UI-RESPONSIVE`, `TC-UI-MOBILE-NAV`, `TC-UI-EMPTY`, `TC-UI-ERROR`, `TC-WEB-OG-METADATA`, `TC-WEB-OG-ASSET`, `TC-WEB-OG-UNFURL`.

**Not in scope of this file** (conditional capabilities, add only if a project needs them): SEO strategy, sitemap, robots.txt, analytics, cookies, structured data, PWA manifest/installability, offline/service-worker, security headers. Accessibility *methodology* stays in `t-design`; this file states only concise, verifiable delivery requirements.
