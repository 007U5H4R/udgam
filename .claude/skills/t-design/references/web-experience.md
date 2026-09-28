# Web Experience Workflow — `t-design`

Loaded when the surface classifier says **Web** or **Both**: landing pages, marketing/product sites, public SaaS sites, portfolios, launches, campaigns, editorial stories, interactive experiences, conversion pages. This is the web path *inside* Stage 4. It does not replace the Stage 4 pipeline, the gates, or `Design.md`.

**Order of thinking:** strategy → scope → structure → skeleton → surface. Needs come before visuals, IA before decoration, content before components, and hypotheses before style variants.

## Contents
1. Product context · 2. User need · 3. Audience awareness · 4. Job + conversion · 5. IA + narrative hypothesis · 6. Experience-parameter matrix · 7. Design hypotheses · 8. Hero · 9. Navigation · 10. Mobile · 11. Reviews before approval · 12. Freeze + handoff

---

## 1. Product context

```yaml
product: {name, category, description, maturity, target_users, primary_use_case, user_problem,
          business_goal, primary_conversion, secondary_conversion, brand_personality,
          trust_sensitivity, consequence_of_error}
```
Conversion examples: signup · start trial · purchase · request demo · join waitlist · contact · install · download · explore work · read case study. **Don't shape the page until you know what success means.**

## 2. User need, not just personas

```yaml
user: {who, trigger, goal, desired_outcome, current_alternative, pain_points, constraints, anxieties, evidence_needed}
```
Write needs as **"I need … so that …"**. Keep **USER NEED** separate from **SOLUTION IDEA**. Mark anything not in the PRD or research as `ASSUMPTION` (audience, conversion, brand, content). Assumptions are never promoted to facts.

## 3. Audience awareness (decides sequencing)

```yaml
audience: {primary_persona, sophistication, technical_level, problem_awareness, solution_awareness,
           product_awareness, trust_level, device_context, likely_entry_source}
```
- **Low awareness:** explain the problem and context before going deep on the product.
- **High awareness:** show the product, proof and differentiation quickly.
- **High trust sensitivity:** put evidence before depth.

**Buyer ≠ user?** (e.g. a partner buys, an associate uses) Name both, say which one each section addresses, and put the buyer's proof and objection handling where the buyer will actually look. Don't blur them into one persona.

Match message to entry source (ad / search / social / email / referral). There is no single landing-page formula.

## 4. Job + conversion model

- **Primary job:** what the visitor is trying to accomplish.
- **Business job:** the outcome the organisation needs.
- **Conversions:** one dominant primary, one lower-commitment secondary, and an exploratory path for visitors who aren't ready.

CTA prominence follows commitment level. Never have five competing CTA hierarchies. Details: `web-conversion.md`.

## 5. Information architecture + narrative hypothesis (before any styling)

Section roles to draw from: orientation · value proposition · problem framing · proof · product demonstration · mechanism · capabilities · differentiation · use cases · objections · trust · pricing · FAQ · conversion.

**Derive the sequence** from awareness, conversion, evidence needs, trust sensitivity, and complexity. Do **not** default to *hero → 3 cards → testimonials → pricing → FAQ*. Each direction states the argument the page makes:

```yaml
narrative: {opening, first_evidence, main_explanation, proof, objection_handling, conversion_point}
```
The layout follows the argument. SEO intent is set here too (page purpose, title intent, one H1, meaningful heading hierarchy, internal-link intent); canonical/robots/sitemap/structured data belong to Stage 6/7.

## 6. Experience-parameter matrix

Mark each row **REQUIRED / CONDITIONAL / N/A** with a one-line reason. Deep analysis goes only to REQUIRED rows; N/A rows get no more thought.

| Parameter | Load when REQUIRED |
|---|---|
| visual language · surfaces · layout · typography · color · imagery · iconography | `visual-system.md` |
| hero · navigation · mobile | §8–10 here |
| conversion · trust · social proof · forms · error recovery · content · analytics | `web-conversion.md` |
| motion · microinteractions · advanced pointer effects | `motion.md` |
| scroll model beyond native | `motion-scroll.md` |
| heavy media (video / WebGL / 3D / image sequences) | `web-conversion.md §8` |
| social preview (public page) | `~/.claude/workflow/og-image-guidelines.md` |
| accessibility (always) | `accessibility.md` |

## 7. Design hypotheses (not style variants)

Directions are **competing hypotheses about what the visitor needs**. The visual language then follows from the hypothesis. Example set (choose what the product warrants; never use it as a fixed menu):

- **Product-first.** The audience already understands the category, so showing capability immediately maximises clarity.
- **Evidence-first.** Trust is the barrier, so proof comes before depth.
- **Education-first.** The market is unfamiliar, so problem framing and the concept come first.
- **Narrative.** The value is hard to show statically, so progressive storytelling explains the mechanism.

Count, naming, distinctness test, plan-then-review, mockups, and hybridization: `mockup-exploration.md`. Every direction defines a **Design Direction** (what it should feel like) and an **Anti-Direction** (what it must avoid, e.g. generic AI SaaS, default purple gradient, glowing cards, giant empty hero, excess glass, generic dashboard screenshot, meaningless animation).

Don't open with *"what style do you want?"* unless style preference is genuinely the missing critical input. Order: understand the product → audience → inspect the existing brand/system (`design-research.md §1`) → targeted research (`design-research.md §2, §6`) → hypotheses → visualise.

## 8. Hero strategy

The hero must answer, at a glance: **WHAT IS THIS? · WHO IS IT FOR? · WHY DOES IT MATTER? · WHAT CAN I DO?** Open with the most characteristic thing in the product's world, not a generic headline + subheadline + 2 buttons + floating dashboard screenshot.

Approaches (pick from the hypothesis): typography-led · product UI · live/interactive demo · editorial image · illustration · photography · video · data visualisation · narrative · conversation · before/after · proof-first · 3D (only after the `spatial-3d.md` necessity gate, with a heavy-feature line). For product-led sites, **show real product value**. Abstract "AI" imagery is never a substitute when the product itself is the strongest proof.

## 9. Navigation strategy

```yaml
navigation: {positioning, sticky, scrolled_state, menu_model, primary_action, active_state, mobile_pattern}
```
Patterns: static · sticky · floating · minimal · sidebar · overlay · mega menu · transparent→solid. Choose from the IA (a 5-section page doesn't need a mega menu). Sticky UI must not hide focused controls (`accessibility.md`, WCAG 2.4.11).

**Mobile navigation is designed separately, not a shrunken desktop nav.** Verify thumb reach, menu clarity, focus handling (move focus in, trap while open, return on close), scroll locking, close behaviour (button + Esc + backdrop), nested items, and primary-CTA availability.

## 10. Mobile is not a small desktop

A direction is **incomplete** until this exists:

```yaml
mobile: {navigation, hero, layout, card_behavior, scrolling, interaction, animation, typography, CTA, media, sticky_elements}
scroll: {desktop, trackpad, phone_touch, reduced_motion}   # phone_touch defaults to native even if desktop smooths
```
Answer "what is the mobile task model?" Density and hero height are redesigned for the phone, not scaled down. Pointer-only interactions are removed or given equivalents. Sticky elements must not eat the viewport. Browser chrome (dynamic toolbars, `dvh`/`svh`) and safe areas are handled.

## 11. Reviews before approval (run on the rendered mockups)

Run alongside the anti-slop gate (grayscale + 20-SaaS) and `accessibility.md`:

- **Beauty-masking review** (aesthetic-usability effect: polish hides problems). Look at the grayscale/structure state, ignoring attractiveness. Can users tell what the page is for? Is the next action obvious? Is information findable? Are there dead ends? Are controls understandable? Are states and errors recoverable?
- **Conversion review.** Is the primary conversion obvious? Is the value proposition specific? Is evidence next to the claim it supports? Are objections answered at the right point? Are CTA labels concrete? Is the commitment proportional to the visitor's confidence at that point?
- **Mobile review.** Is it genuinely redesigned? Is hero density right? Are sticky elements too big? Are touch targets usable? Is a carousel actually needed? Is horizontal scroll discoverable? Are pointer-only effects removed? Does text reflow? Is mobile media performant? Does browser chrome break the layout?
- **Performance-risk review.** Every heavy feature has its line (`web-conversion.md §8`).
- **Motion/scroll review.** Every motion has a purpose (`motion.md`); the scroll model is justified (`motion-scroll.md` when non-native).

## 12. Freeze + handoff

Get explicit approval of the **final HTML mockup** (+ OG mockup for a public page) and `Design.md`. Accept clear phrases ("Approved", "Go ahead", "Proceed", "Build this", "Use this"). **Ask if ambiguous.** Approval means *the UI/UX direction is approved*, not that production frontend is done.

Then write the **Design Freeze** block and §25 (`design-md-template.md`), record `D#` decisions, keep `.design/exploration/final/`, and hand off per `bw-ui-ux-design`.

## Output hooks

Feeds `Design.md` §1, §2, §3, §5, §6, §7, §16, §22, §25 and the Design Freeze block. Cross-refs: [[mockup-exploration]], [[web-conversion]], [[visual-system]], [[motion]], [[accessibility]], [[motion-scroll]], [[anti-ai-slop]].
