# Visual System Reference — `t-design`

Loaded when deciding visual language, surfaces, layout, typography, color, iconography, or imagery, on the Core or Web path. **Vocabulary, not presets.** Every choice is derived from **PRODUCT + AUDIENCE + DOMAIN + BRAND + EMOTIONAL TARGET + CONTENT**, never from what's fashionable. Extend an existing system first (`design-research.md §1`). Record decisions in `Design.md §12` (and §25 on the web path).

## Contents
1. Visual-language vocabulary · 2. Surface strategy · 3. Layout system · 4. Grid, container-first, fluid scale · 5. Typography · 6. Color · 7. Iconography · 8. Imagery · 9. Platform-support rule

---

## 1. Visual-language vocabulary (terms to describe a direction, not to pick from a menu)

minimal · editorial · Swiss/international · brutalist · neo-brutalist · luxury · technical · developer-focused · organic · retro · Y2K · spatial · typographic · photographic · illustrative · product-first · data-first · experimental · glass · subtle glass · skeuomorphic · neumorphic · clay-like · bento.

A direction may combine terms ("editorial + technical"), but each term must trace back to one of the six inputs above. Bento, glass, neumorphism and 3D are allowed only when content or interaction earns them (`anti-ai-slop.md`). **Structure encodes information:** numbered markers only for real sequences, a grid only when items are genuinely peers, cards only for real containment.

## 2. Surface strategy (say WHERE each treatment is allowed)

Treatments: flat · bordered · elevated · glass · frosted · inset · outlined · textured · paper · metallic · gradient · grain/noise · glow · 3D.

Write it as an allow-list per role, e.g.:
```
Glass      → navigation bar only
Cards      → flat solid, hairline border
CTA        → high-contrast solid, no glow
Elevation  → overlays (menus, dialogs) only
```
One effect applied everywhere is a smell. Shadows communicate depth, never decoration.

## 3. Layout system

```yaml
layout: {max_width, reading_width, desktop_columns, tablet_columns, mobile_columns,
         section_rhythm, density, alignment, full_bleed_policy}
```
Systems: centered · asymmetric · split · modular · editorial · full-bleed · bento · magazine · timeline · spatial. Choose based on content shape and behaviour. Reading width is about 60–75ch for body text.

## 4. Grid, container-first, fluid scale

- **Tools:** CSS Grid (page structure), Flexbox (1-D runs), subgrid (aligning nested content), `minmax()`, `clamp()`, `min()`, `max()`, intrinsic sizing (`auto-fit`/`auto-fill`).
- **Container-first:** a reusable component adapts to **its own available space** with container queries, not the viewport. Keep viewport media queries for page-level layout.
- **Fluid, bounded scale:** type, spacing, section rhythm and containers scale with `clamp(min, preferred, max)` instead of dozens of breakpoint jumps. Always bound it, because unbounded `vw` breaks zoom and text scaling (WCAG 1.4.4). Test with 200% text.
- Prefer **content-driven breakpoints** (where the layout actually breaks) over device-named ones. Avoid breakpoint explosion.
- Design the **mobile layout deliberately** (`web-experience.md §10`), not as "stack everything".

## 5. Typography

```yaml
typography: {display, body, mono, scale, weights, heading_line_height, body_line_height, measure, tracking, wrap_strategy}
```
- Hierarchy comes from **size + weight + spacing + contrast + grouping**, not size alone.
- Usually 1–2 families (+ mono only when data or code genuinely needs it). Minimise typeface proliferation, and let type carry personality.
- A **deliberate scale** (ratio or hand-tuned steps) as tokens. Tighter line-height for display (~1.05–1.2), looser for body (~1.45–1.65).
- **Wrap strategy:** `text-wrap: balance` for headings (Baseline); `text-wrap: pretty` for body only as enhancement (not Baseline).
- **Responsive checks:** mobile readability, 200% zoom, the longest real heading, larger accessibility text, localisation expansion (~30–40%), multi-line CTAs, and no critical truncation. Text scaling must not break hierarchy or interaction.

## 6. Color

```yaml
color: {background, foreground, muted, brand, accent, success, warning, error, surface_levels}
```
- Mode: light · dark · auto · hybrid · monochrome · neutral + accent · duotone · restrained gradient. Pick one that fits the domain and trust level.
- Define in **OKLCH** for perceptually even scales. Tokens are semantic (`--color-danger`), not raw (`--red-500`).
- **Color has semantic logic.** Every hue has a job, and accent use is rationed.
- **Never rely on color alone.** State and meaning are also carried by text, icon, shape, position, pattern or label.
- Contrast: text ≥ 4.5:1 (≥ 3:1 large), UI/non-text ≥ 3:1 (`accessibility.md`).

## 7. Iconography

Define family · stroke/fill · weight · size scale · corner character · optical alignment · motion policy. Use **one family**. Icons exist to improve recognition, so don't put one on every label, nav item or heading. Icon-only buttons need an accessible name.

## 8. Imagery

Decide the role of each medium in play: photography · illustration · product screenshots · composed UI fragments · diagrams · SVG · video · animated screenshots · 3D · WebGL · generative visuals. Keep **one coherent visual language** and don't mix unrelated styles. For product-led sites, **real product evidence beats abstract imagery**. Generated media (Higgsfield/Recraft) follows `design-research.md §3`, and critical text is never generated. Heavy media needs a heavy-feature line (`web-conversion.md §8`).

## 9. Platform-support rule

Features that aren't **Baseline** (per web.dev Baseline / web-features) are **progressive enhancement only**: wrap them in `@supports` and give them a fallback that keeps all content and primary actions. As of 2026-09, container queries, `@media (hover)/(pointer)`, same-document View Transitions and `text-wrap: balance` are Baseline. **CSS scroll-driven animations, cross-document View Transitions, `text-wrap: pretty` and `calc-size()`/`interpolate-size` are not** (no Firefox). Re-check support before relying on one.

## Output hooks

Feeds `Design.md` §1, §12, §13, §16, §25 (`visual_direction`, `layout`, `typography`, `color`, `surfaces`, `imagery`, `iconography`). Cross-refs: [[anti-ai-slop]], [[design-research]], [[mockup-exploration]], [[accessibility]], [[web-experience]].
