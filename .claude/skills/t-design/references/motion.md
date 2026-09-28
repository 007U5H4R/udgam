# Motion System Reference — `t-design`

Loaded when the design has motion beyond simple hover/focus state changes. This file owns motion **intent**. Scroll models live only in `motion-scroll.md`. Implementation (curves, springs, code) belongs to the `animate` / `emil-design-eng` skills and Stage 6/7. **Motion must communicate. If it serves none of the purposes below, remove it.**

## Contents
1. Purpose test · 2. Motion language · 3. Intensity + primary moments · 4. Timing heuristics · 5. Technology ladder · 6. View Transitions · 7. Microinteraction states · 8. Advanced pointer effects · 9. Reduced motion · 10. Animation performance

---

## 1. Purpose test

Every animation serves at least one of: **feedback · continuity · hierarchy · orientation · state · product demonstration · storytelling · brand expression · restrained delight.** Name the purpose in `Design.md §15`. "It looks premium" isn't a purpose. A product demonstration shows input → action → product response → value, not animated screenshots.

## 2. Motion language (one coherent system)

Define only the categories the product uses: **enter · exit · move · transform · reveal · emphasis · feedback · loading · success · error.** Each one gets a shared easing family and duration band, so motion feels like one product and not a collection of effects.

## 3. Intensity + primary moments

```yaml
motion:
  intensity: none | low | medium | high
  primary_moments: [the 1–3 places motion carries meaning]
  secondary: [section continuity, product demo]
  micro: [feedback states]
  intentionally_static: [reading, forms, dense product work]
  reduced_motion: what replaces each moment
```
**Don't spread animation evenly across the page.** One orchestrated moment beats dozens of generic fade-ups. Staggered scroll reveals on every section are an anti-slop finding.

## 4. Timing heuristics (ranges, not laws)

| Kind | Typical |
|---|---|
| Micro feedback (press, toggle) | ~100–180 ms |
| UI transition (menu, tab, dialog) | ~180–300 ms |
| Component entrance | ~300–500 ms |
| Narrative movement | ~400–1200 ms |

Adapt to interaction, distance travelled, device, and the design system. Exits are usually faster than entrances. Feedback must never wait on an animation. Loading motion is truthful: staged real status for long waits, never fake progress or artificial delay to make a product feel sophisticated.

## 5. Technology ladder (choose after the behaviour is defined; lightest that works)

1. Simple state change → **CSS transitions**
2. Visibility trigger → **CSS + IntersectionObserver**
3. State-driven React motion / layout animation → **Motion**
4. Native scroll-linked effect → **CSS scroll-driven animations**. **Not Baseline**, so enhancement only, with a static fallback.
5. Complex orchestration / timelines / pinned sequences → **GSAP** (ScrollTrigger when scroll-bound; see `motion-scroll.md`)
6. Smooth synchronized scene → **Lenis + the chosen engine**. Only per `motion-scroll.md`, never by default.
7. 3D → real-time 3D only after the `spatial-3d.md` necessity gate passes, plus a heavy-feature line (`web-conversion.md §8`). Three.js vs R3F is decided in Stage 6.

Don't install a heavy library for one fade. More than one animation library needs a heavy-feature line. Stage 4 names the *capability* ("complex pinned narrative required"); Stage 6 picks the library.

## 6. View Transitions

For state and page transitions that benefit from spatial continuity, consider the native View Transition API before any framework-level solution. **Same-document** is Baseline (newly available). **Cross-document** is not Baseline, so enhancement only, and navigation must work identically without it.

## 7. Microinteraction states (define for components that exist)

- **Buttons:** default · hover · focus-visible · pressed · loading · disabled · success
- **Form fields:** empty · focused · filled · autofill · error · success · disabled · loading
- **Navigation:** default · hover · focus-visible · active/current · scrolled · menu open · menu closed

Hover is never the only way to reveal information. Don't add decorative states with no purpose.

## 8. Advanced pointer effects (optional, never stacked)

These are all optional: magnetic controls · custom cursor · pointer spotlight · card tilt · hover preview · text reveal · masks · drag · comparison slider · interactive diagram · animated gradient · cursor-follow layers.

**Rule:** any interaction that depends on hover, cursor, pointer tracking, tilt or magnetism must either have a complete touch and keyboard equivalent, or be non-essential decoration that is disabled for `(hover: none)`, `(pointer: coarse)` and reduced motion. Gate by capability (`@media (hover: hover) and (pointer: fine)`), never by width. Don't stack novelty effects to simulate sophistication; a custom cursor needs a product reason.

## 9. Reduced motion

`prefers-reduced-motion: reduce` is a first-class mode, not an off switch. Remove or replace movement (fade or instant state change instead of travel/parallax/zoom), keep essential feedback, and never hide content behind an animation that no longer runs. House policy: this applies to **all** interaction-triggered motion (WCAG 2.3.3 is AAA; we adopt it as a default).

## 10. Animation performance

Prefer compositor-friendly properties (`transform`, `opacity`) for movement, and avoid animating layout-driving properties (`width`, `top`, `height`, `margin`) at scale. This isn't a blanket "only transform/opacity" rule: filters, clip-path and colour can be right when measured. Animations must not cause layout shift (CLS) or delay input response (INP). Check on a mid-range phone, not only a desktop. Stages 9/11 measure.

## Output hooks

Feeds `Design.md` §14, §15 (Motion Design), §25 `motion`. Cross-refs: [[motion-scroll]], [[web-conversion]], [[accessibility]], [[anti-ai-slop]].
