# Conversion, Trust, Content & Experience Constraints — `t-design`

Loaded when conversion or trust materially matters, or when heavy media or motion is proposed (§8 only). Reached from `web-experience.md §6`. This file decides *intent*; Stage 6 chooses tools and budgets. Every persuasive choice still passes the **Ethical Behavioral Design Gate** (`behavioral-design.md`).

## Contents
1. Conversion architecture · 2. Trust design · 3. Social-proof quality · 4. Content-first design · 5. Forms · 6. Error recovery · 7. Analytics intent · 8. Experience performance constraints

---

## 1. Conversion architecture

```yaml
conversion: {primary, secondary, exploratory}
```
- One dominant primary CTA. The secondary is a lower-commitment alternative (e.g. demo vs. trial, sample vs. signup). The exploratory path serves visitors not ready to commit (methodology, case study, docs).
- **Prominence follows commitment:** don't give every CTA equal weight, and don't place competing CTAs in the first viewport.
- **CTA labels name the actual action and result** ("Check a brief", "Start 14-day trial"), not "Get started" or "Learn more" by default.
- Ask for commitment in proportion to the visitor's confidence at that point on the page.

## 2. Trust design

Evaluate only what's relevant: security · privacy · pricing transparency · refund/cancellation policy · data handling · company identity · support · evidence/provenance · compliance · testimonials · case studies · awards · ratings. Put trust material **next to the objection it answers** (data handling beside the upload, refund policy beside the price), not in a footer ghetto.

**Never invent proof:** no fabricated customers, testimonials, revenue, usage metrics, certifications, awards, or security claims. Missing proof is marked `ASSUMPTION — needs real source` in the mockup, never filled with plausible fakes.

## 3. Social-proof quality

For each piece, ask: is it **real**? **Relevant** to this audience? **Specific** (named outcome, named context)? Does it **reduce an actual objection**? Drop anything that fails. A logo wall or "trust bar" with no relevance to the visitor is decoration.

## 4. Content-first design

- **No lorem ipsum.** Use real product language, real feature names, domain terminology, and realistic copy lengths (including the long ones).
- Put important words first, keep UI copy short and direct, one idea per sentence where possible, meaningful headings (a skimmer reading only the headings gets the argument), and action-oriented labels.
- Value propositions are **OBJECT + ACTION + RESULT**, not technology ("Powered by AI" is not a value proposition).
- If the UI needs long instructions to explain itself, reconsider the interaction instead of writing more copy.
- Progressive disclosure: show the most important information and actions first. Keep to **≤ 2 disclosure levels**, never hide frequently needed actions, and make the progression obvious. Use the least disruptive mechanism that fits: disclosure/accordion → tabs → drawer → modal → secondary page → interactive demo.

## 5. Forms (conversion-sensitive)

Minimise fields (every field needs a reason). Use visible labels (placeholders aren't labels), appropriate `type`/`inputmode`/`autocomplete` so autofill works, and show requirements before submission. Validate at a sensible moment (on blur or submit, not per keystroke). Put errors next to the field, in words. **Preserve entered data on every recoverable error.** Make it fully keyboard-operable. Any drag interaction (e.g. drag-drop upload) also offers a plain button (WCAG 2.5.7).

## 6. Error recovery

Every error answers **WHAT HAPPENED? · WHAT CAN I DO? · WAS MY WORK PRESERVED?** with a real recovery control. Don't show a generic "Something went wrong" when a more useful explanation is safely available. The state contract itself lives in `web-deliverables.md §2`.

## 7. Analytics intent (design defines *what to learn*, not the tool)

List the **decisions that need measurement**, then only the events that inform them. Typical events: primary CTA · secondary CTA · demo start · signup start/complete · pricing viewed · FAQ item opened · case study opened · a meaningful product interaction. Avoid vanity event overload. **Don't track scroll depth by default** unless it answers a real question. Don't pick PostHog/Mixpanel/Amplitude/GA4/Clarity here unless the project already mandates one; Stage 6 chooses the tool. On Product Journey surfaces, measurement is designed end to end (landing → activation → retention) in `product-analytics.md`.

## 8. Experience performance constraints (performance is UX)

Stage 4 owns *whether* a heavy experience is worth it. Stage 6 owns exact budgets, bundling, loading architecture and image formats (AVIF/WebP/SVG, `srcset`/`sizes`/`<picture>`, lazy/priority loading, intrinsic dimensions). Stages 9/11 verify.

**Guardrails:** current web.dev Core Web Vitals "good" thresholds are **LCP ≤ 2.5 s · INP ≤ 200 ms · CLS ≤ 0.1** at p75, segmented mobile/desktop. These are current defaults, so re-check web.dev before quoting them as targets.

**Stage 4 decides:**
- which element is the likely LCP and its loading priority
- the perceived-performance expectations (what shows instantly vs. streams in)
- that the hero never waits on a heavy script

**Heavy-feature line (required before approving any of these):** WebGL · Three.js/R3F · autoplay video · high-res image sequences · more than one animation library · persistent `backdrop-filter`/blur · smooth-scroll library · complex parallax. For each, write one line:

```
<feature>: value = … · mobile cost = … · fallback = … · lighter alternative considered = … · reduced-motion alternative = …
```
No line means the feature isn't approved. Real-time 3D also needs the `spatial-3d.md` necessity gate and §12 gate. Media (video, 3D, animated screenshots, hero imagery) also states its purpose and a mobile alternative.

## Output hooks

Feeds `Design.md` §3, §19, §20, §22, §25 (`conversion`, `performance_constraints`, `seo_intent`, `analytics_intent`). Cross-refs: [[web-experience]], [[behavioral-design]], [[emotional-design]], [[motion]], [[anti-ai-slop]].
