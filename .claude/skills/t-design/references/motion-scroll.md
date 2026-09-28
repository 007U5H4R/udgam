# Scroll Strategy Reference — `t-design`

Scrolling is interaction design, not an implementation afterthought. Every user-facing interface gets a **scroll model**; this file is loaded when that model is anything beyond native vertical scroll (smooth, scrollytelling, horizontal, snap, nested, infinite / load-more, virtualized, significant scroll-linked motion) or when phone/touch scrolling needs a decision. Lenis is **one optional technology** inside this system — never the starting point.

Decide in this order — **never pick the library first:**

```
USER TASK → CONTENT MODEL → DEVICE / INPUT MODE → SCROLL MODEL → MOTION NEED → TECHNOLOGY
```

**Principles:** native first · mobile touch is not desktop mouse · trackpad is not a mouse wheel · reduced motion is a first-class mode · scroll serves the task · never hijack user input · choose the scroll model before the library · Lenis is optional · motion must communicate something · **if removing the scroll effect doesn't hurt the experience, you don't need it.**

---

## 1. Default rule

**Native browser scrolling is the default.** Ask: *does native scroll satisfy the user's task?*
- **YES** → native scroll. Record "Primary scroll model: Native" in Design.md §15 and stop.
- **NO** → name the exact scroll problem → choose the **smallest** strategy that solves it (§2) → then technology (§8).

Never default to smooth scroll, Lenis, parallax, snap, horizontal scroll, infinite scroll, or scroll-triggered animation because they look polished.

## 2. Scroll models (classify into one or more)

| Model | Use for | Rules |
|---|---|---|
| **A. Native vertical** | normal sites, dashboards, forms, admin, productivity, enterprise, docs, long-form reading, transactional flows | Browser-native. The default. |
| **B. Native + anchor** | docs, long landing pages, TOC, FAQ, single-page product pages | Native anchors, `scrollIntoView`, CSS `scroll-behavior`, `scroll-margin-top`/`scroll-padding-top` for sticky headers. **Lenis is not required for anchors.** |
| **C. Smooth / interpolated** | portfolios, immersive brand, editorial storytelling, launches, scroll-linked animation, WebGL, cinematic narratives | Only when smoother input materially improves the experience. Tool: Lenis (§7). **Not for application UI.** |
| **D. Scroll-driven animation** | diagram reveals, product walkthroughs, data viz, sticky storytelling, WebGL | Scroll position = animation progress. Lightest tool that works (§8); no heavy stack for simple reveal-on-enter. |
| **E. Scrollytelling** | editorial, data journalism, product stories, case studies, explainers | `scroll → narrative state → visual state → next state`. Scroll becomes information architecture — each step must stand alone as readable content. |
| **F. Parallax** | hero storytelling, visual narratives, immersive product sites | Only when depth/spatial relationship supports meaning. No excessive background movement, continuous floating, motion competing with reading, or motion that causes discomfort. |
| **G. Horizontal** | timelines, galleries, showcases, comparison strips, spatial narratives | Only for inherently sequential/spatial content — never vertical content made horizontal for novelty. Always a clear touch model + visible affordance (§4.3). |
| **H. Snap** | stories, full-screen chapters, galleries, onboarding | Discrete panels only. **No scroll traps:** user can reverse, exit, use keyboard/touch, and knows where they are. |
| **I. Nested** | modal, drawer, chat, code editor, table, side panel, data grid | Explicitly name the **scroll owner**. Avoid unless the IA requires it. |
| **J. Infinite** | feeds, discovery, social streams, browsing | Never automatic. If users need position memory, footer access, pagination, reproducible results, deep links, or predictable navigation → prefer pagination or load-more. |
| **K. Load more** | discovery with explicit control | Often better than infinite: keeps orientation, footer access, intentional pacing. |
| **L. Virtualized** | large tables, logs, grids, thousands of rows, long feeds | A **rendering/performance strategy, not a visual effect.** Preserve find-in-page expectations, row a11y (`aria-rowcount`/`aria-rowindex`), and scroll restoration. |
| **M. Sticky / pinned** | comparison controls, section headings, scrollytelling visual, filters, contextual nav | Keep information visible while related content changes. Never pin large sections that eat the viewport — stricter on phones (§4.5). |

**Starting-point table:**

| Need | Preferred starting strategy |
|---|---|
| Normal app/page | Native vertical |
| Jump between sections | Anchors / native |
| Long docs | Native + sticky TOC |
| Feed / discovery | Load more (infinite only with justification) |
| Huge data list | Virtualized |
| Gallery / timeline | Horizontal / snap |
| Narrative | Scrollytelling |
| Simple scroll animation | Native CSS / Intersection Observer |
| Complex synchronized animation | GSAP ScrollTrigger |
| Smooth immersive motion | Consider Lenis |
| WebGL scroll scene | Lenis may be appropriate (only per `spatial-3d.md §9`; Three.js does not imply Lenis) |

## 3. Device + input strategy (define all that apply)

Never define scrolling only for desktop mouse users. Cover: **mouse wheel · trackpad · touch · keyboard · assistive tech · reduced motion.**

- **Mouse / wheel.** Predictable response. If smoothed: no exaggerated delay, no noticeable input lag, predictable acceleration, anchors + keyboard preserved. *Smooth should feel controlled, not sluggish.*
- **Trackpad.** Already high-resolution and inertial — don't over-smooth it. Verify: small gestures stay precise · inertia doesn't feel delayed · quick reversals respond immediately · pinch/gestures undisturbed · horizontal gestures don't accidentally move the page (or trigger browser back).
- **Keyboard.** Page Up/Down · arrows · Space / Shift+Space · Home/End · Tab/Shift+Tab · focus moves the viewport to the focused element. Smooth-scroll systems must not interfere.
- **Assistive tech.** Semantic document order = reading order; scroll effects never reorder or hide content from the accessibility tree.

## 4. Phone / touch (first-class, not an afterthought)

**Prefer native touch scrolling on phones.** Mobile browsers already provide momentum, inertia, touch response, overscroll, and browser-chrome integration — don't force desktop-style smoothing onto them.

**4.1 Define explicitly for phone UI:**
- **Primary direction** — usually vertical; no horizontal page scroll unless content genuinely requires it.
- **Thumb ergonomics** — primary controls usable while scrolling.
- **Sticky UI** — sparing; never consumes excessive viewport height.
- **Browser chrome** — dynamic toolbars change viewport height; use `svh`/`dvh`/`lvh` deliberately, never assume `100vh` is stable.
- **Safe areas** — `env(safe-area-inset-*)` where relevant (notches, home indicator).
- **Long content** — avoid long pinned sections that make progress feel slow.
- **Overlay scroll owner** — modals/drawers have one obvious scroll owner; use `overscroll-behavior: contain` to stop scroll chaining where appropriate.
- **Overscroll / pull-to-refresh** — don't block expected native behavior without a functional reason.
- **Orientation** — check portrait and landscape where supported.
- **On-screen keyboard** — opening it must not break layout or cover focused inputs/actions.

**4.2 Carousels.** Not a default — ask *would a vertical list be easier?* Use only when items are comparable, sequence matters, horizontal browsing is natural, and saving vertical space is valuable. Never hide critical content behind repeated swiping.

**4.3 Horizontal scroll on phones.** Users must see that more exists: partially visible next item · directional affordance · pagination dots where apt · visible overflow. **No hidden horizontal scroll areas.**

**4.4 Nested scroll on phones.** Minimize nested regions · make ownership obvious · avoid full-height containers inside full-page scroll · test modals/drawers/chat on real devices · never trap touch gestures.

**4.5 Sticky / pinned on phones** (stricter than desktop). Enough content stays visible · keyboard doesn't cover controls · browser chrome causes no layout jumps · sticky elements don't overlap content · bottom actions stay reachable.

**4.6 Performance on phones.** Low main-thread work · stable frame rate · no layout thrashing · transform/opacity-only animation · minimal blur/filter · few simultaneous animations · efficient images/video · conservative WebGL. Never trade responsiveness for decorative motion.

## 5. Reduced motion (an alternate interaction mode, not a theme)

Honor `prefers-reduced-motion: reduce`: disable smooth-scroll interpolation · disable non-essential parallax · disable decorative scroll-linked animation · shorten/neutralize transitions · programmatic scrolling immediate or near-immediate · all content and functionality preserved. **Meaning never depends on motion.** No opt-out without a compelling reason recorded in `decisions.md`.

## 6. Accessibility + the scroll-jacking rule

Preserve: semantic document order · focus behavior + visibility · skip links · anchor navigation · screen-reader reading order · predictable navigation · browser find · deep links · back/forward position restoration.

**Scroll-jacking is rejected.** The user, not the site, controls scrolling. Reject: forced section transitions · delayed input · animations the user can't stop · unexpected direction changes · hard locks · unexpected horizontal transitions · snap that prevents natural movement. *User intent stays primary.*

## 7. Lenis (only when model C, or D/E needs a unified smooth scroll source)

**Decision gate — answer all in Design.md; weak answers → no Lenis:**
1. Why is native scrolling insufficient?
2. What experience improves with Lenis?
3. Which devices should use it?
4. Should touch remain native?
5. What happens for reduced-motion users?
6. Which scroll-linked systems depend on it?
7. What happens if Lenis fails or is disabled? (The page must still work with native scroll.)
8. Is the added complexity justified?
9. Would removing it harm the intended experience? If **no** → native scroll.

**Device policy (default):** desktop mouse/trackpad → Lenis may smooth (wheel smoothing, keep it light for trackpads) · phone/touch → **native** (`syncTouch` stays off) · reduced motion → **no smoothing**. Enable touch sync only when scroll-linked animation or a WebGL scene needs a unified scroll state **and** it has been tested extensively on real touch devices — never for consistency with desktop.

**Research** when Lenis is considered: `https://lenis.dev/templates` · `https://lenis.dev/showcase` · `https://github.com/darkroomengineering/lenis`. Study real scroll patterns, touch behavior, a11y + reduced-motion notes, anchor config, nested scroll, snap, GSAP integration, performance. **Extract interaction principles; never copy visual styles.**

**Integration facts (verify against the installed version):**
- Reduced motion: current Lenis honors `prefers-reduced-motion` by default and exposes `lenis.prefersReducedMotion`.
- Anchors: `anchors` option (accepts scroll options such as offset for sticky headers) — never assume anchors work unconfigured.
- Nested regions: `data-lenis-prevent` (`-wheel` / `-touch` / `-vertical` / `-horizontal`), the `prevent` option, or `allowNestedScroll`. Doesn't work inside iframes.
- GSAP: one canonical scroll source and one loop — `lenis.on('scroll', ScrollTrigger.update)` + `gsap.ticker.add(t => lenis.raf(t * 1000))` + `gsap.ticker.lagSmoothing(0)`, with `autoRaf` off.
- Snap: CSS `scroll-snap` isn't supported alongside Lenis — use `lenis/snap` if snapping is genuinely needed, and verify keyboard + touch.
- Safari caps at 60fps (30fps in low-power mode).

## 8. Technology selection (after the model is chosen)

| Interaction | Lightest suitable technology |
|---|---|
| Reveal on view | Intersection Observer / CSS |
| Anchor movement | Browser-native anchors |
| Smooth anchor jump | CSS `scroll-behavior: smooth` (auto under reduced motion) |
| Scroll-linked CSS animation | Native CSS scroll-driven animations (`animation-timeline: scroll()` / `view()`) where browser support fits; progressive enhancement with a static fallback |
| Complex timeline / pinning | GSAP ScrollTrigger |
| Smooth synchronized experience | Lenis + one animation system |
| Huge list / grid | Virtualization library |

Avoid: multiple competing RAF loops · duplicated scroll listeners · heavy DOM work per scroll frame · excessive layout reads · blur/filter tied to scroll · unnecessary WebGL work · more than one scroll-interpolation system. **Don't reach for Lenis for problems that don't require it.**

## 9. Design.md §15 — Scroll Strategy subsection (for applicable projects)

```markdown
### Scroll Strategy
#### Primary scroll model — Native / anchor / smooth / scrollytelling / horizontal / snap / nested / infinite / load-more / virtualized / hybrid
#### Why — how this model supports the user's task (and why native alone doesn't, if not native)
#### Desktop — mouse · trackpad · anchors · sticky content · nested regions
#### Mobile / Phone — touch model (native vs synchronized) · sticky · nested scroll · horizontal gestures · viewport/browser chrome · safe areas · keyboard
#### Keyboard — expected behavior
#### Reduced Motion — fallback behavior
#### Scroll-Linked Motion — what responds to scroll, and what it communicates
#### Technology — Native / CSS / Lenis / GSAP / other, and why the lighter option wasn't enough
#### Performance — known constraints
#### Anti-Direction — scroll behaviors that must NOT be added
```

For a plain native-scroll product, one line is enough: *"Primary scroll model: Native vertical — <reason>."*

## 10. HTML mockup + device review (Stage 4)

Any non-trivial scroll model — smooth scroll · horizontal · sticky sections · snap · scrollytelling · nested · significant scroll-linked animation — must be **demonstrated in the Stage 4 HTML mockup**. Never approve these from prose. The mockup is a prototype: load any library (e.g. Lenis) via CDN in the isolated mockup only; don't install into the app during Stage 4.

Review the mockup at:
- **Desktop** — mouse/wheel; trackpad where available.
- **Tablet** — touch.
- **Phone** — ~375px, touch, sticky UI, browser-height behavior, horizontal gestures.
- **Reduced motion** — smoothing disabled, decorative motion reduced.

Not approved until the core scroll behavior works across every applicable mode.

## 11. Mobile-first failure checks (before approval)

```
[ ] no accidental horizontal page scroll
[ ] page can always continue vertically
[ ] touch gestures are predictable
[ ] nested regions do not trap the user
[ ] sticky elements do not consume excessive viewport
[ ] carousels show clear affordance
[ ] horizontal scroll is never hidden without cues
[ ] browser chrome does not obscure critical controls
[ ] long pinned scenes are avoided
[ ] keyboard opening does not break layout
[ ] reduced motion preserves functionality
```

## 12. Stage boundaries

| Stage | Responsibility |
|---|---|
| 4 | Decide the scroll strategy · define desktop / phone / reduced-motion behavior · prototype non-trivial scrolling in the mockup |
| 6 | Plan implementation technology per §8 (scroll source, loop, sync, nested/anchor config) |
| 7 | Implement the approved strategy — nothing more |
| 8 | Independently critique motion/scroll fidelity against Design.md §15 |
| 9 | Test mouse · trackpad where practical · touch · keyboard · reduced motion · anchors · nested scroll · mobile · performance |

Technology selection never precedes the interaction decision.

## Output hooks

Feeds Design.md **§15 Motion Design** (Scroll Strategy subsection), **§16 Responsive**, **§17 Accessibility**, and the **Scroll** block of the Anti-AI-Slop Review Gate ([[anti-ai-slop]] §8). Implementation craft lives in `build-awwwards-quality-sites` / `animate` — this file decides *whether* and *which model*; they handle *how*.
