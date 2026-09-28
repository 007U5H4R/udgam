# Accessibility & Input Reference — `t-design`

Loaded at the accessibility review step of **every** UI design, and whenever input modality or responsive order is being decided. **Default target: WCAG 2.2 AA** unless a contract says otherwise. Accessibility is designed in Stage 4, not patched after coding. Deep audit tool: the `interface-review` skill. Verification contract: `web-deliverables.md`. Record in `Design.md §17`.

## Contents
1. Design-time checks · 2. WCAG 2.2 criteria that shape layouts · 3. Input modalities · 4. Responsive accessibility · 5. Review checklist

---

## 1. Design-time checks

- **Semantics:** landmarks, one H1, logical heading order, real lists/tables/buttons/links. ARIA only where native semantics can't do the job.
- **Keyboard:** everything operable, logical tab order, no traps, and skip link on long pages.
- **Focus:** a clearly visible `:focus-visible` style that holds on every surface colour.
- **Contrast:** text ≥ 4.5:1 (≥ 3:1 large); UI components and meaningful graphics ≥ 3:1.
- **Color independence:** never color alone (`visual-system.md §6`).
- **Text:** resizes to 200% without loss. Plan the **alt-text strategy** per image role (informative / functional / decorative `alt=""`).
- **Forms:** visible labels, instructions before input, errors tied to fields in text (`web-conversion.md §5`).
- **Media:** captions/transcripts for video with speech; no autoplay audio; controls to pause anything moving > 5 s.
- **Reduced motion:** `motion.md §9`.

## 2. WCAG 2.2 criteria that shape layouts (AA unless noted)

| SC | Requirement | Design consequence |
|---|---|---|
| **1.4.10 Reflow** | No 2-D scrolling at 320 CSS px wide (vertical content) | Design and test the 320 px layout, including tables and code blocks |
| **1.4.4 Resize Text** | 200% text without loss | Bounded fluid type only; nothing clipped at 200% |
| **2.4.11 Focus Not Obscured (Min)** | The focused element is not *entirely* hidden by author content (2.4.12 AAA: no part hidden) | Sticky headers, bottom bars, cookie panels and chat widgets must not cover focus: `scroll-padding-top`/`-bottom`, and dismissible banners. Validate in the mockup. |
| **2.5.7 Dragging Movements** | Every drag action has a single-pointer alternative | Drag-drop upload gets a button; sliders get tap/step controls; reorder gets move buttons |
| **2.5.8 Target Size (Min)** | Targets ≥ 24×24 CSS px, or spaced so 24 px circles don't overlap (exceptions: equivalent control, inline text, UA default, essential) | 24 px is the **compliance floor**. Aim for ~44×44 px for primary touch targets; don't confuse the minimum with ergonomic sizing |
| **2.3.3 Animation from Interactions** (AAA) | Interaction-triggered motion can be disabled | Adopted as house policy via `prefers-reduced-motion` |

## 3. Input modalities (design each; never infer from screen width)

**Mouse ≠ trackpad ≠ touch ≠ keyboard ≠ screen reader ≠ reduced motion.**
- Use **capability** queries: `@media (hover: hover)`, `(pointer: fine | coarse)`, `(any-pointer: coarse)`. A large touchscreen laptop and a small window with a mouse both exist.
- **Hover** can't be the only path to information or actions (touch has no hover).
- **Trackpad** produces inertial, high-frequency scroll; scroll effects must not fight it (`motion-scroll.md`).
- **Touch:** generous targets, thumb reach for primary actions, no hover-dependent menus, and gestures always have a visible control alternative.
- **Screen reader:** meaningful reading order, named controls, live regions for async status (loading → result).

## 4. Responsive accessibility

- **Source order = visual order.** Don't use CSS `order`, grid placement or `flex-direction: row-reverse` in ways that make tab or reading order disagree with what's seen. Check tab order **at each responsive state**.
- Mobile menus: focus moves into the menu, is contained while open, and returns to the toggle on close. Esc closes it.
- Sticky elements that grow on mobile (bottom CTA bars) are rechecked against 2.4.11.
- Zoom at 200–400% behaves like a narrow viewport, so the mobile layout must work on desktop zoom too.

## 5. Review checklist (before approval; on the rendered mockup)

```
[ ] semantic order + heading hierarchy     [ ] keyboard path through primary task
[ ] visible focus on every surface         [ ] focus not obscured by sticky UI (2.4.11)
[ ] targets ≥ 24px, primary touch ~44px    [ ] reflow at 320px, text at 200%
[ ] reduced-motion behaviour defined       [ ] color independence
[ ] drag alternatives (2.5.7)              [ ] form labels + error recovery
[ ] media alternatives                     [ ] tab order matches visual order at each breakpoint
```
Any unchecked box needs a written justification in `Design.md §17`, or Stage 4 doesn't pass.

## Output hooks

Feeds `Design.md` §14, §16, §17, §24 and §25 `accessibility`. Cross-refs: [[ux-heuristics]], [[visual-system]], [[motion]], [[motion-scroll]], [[web-conversion]].
