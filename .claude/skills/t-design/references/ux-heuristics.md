# UX Heuristics & HCI Laws Reference — `t-design`

The formal review lens. Nielsen's 10 heuristics + the HCI laws. Laws that have their **own skill** are delegated (referenced, not restated); laws with **no skill** (Hick, Jakob) are summarized here.

---

## Nielsen's 10 Usability Heuristics (use as a review checklist on every design)

1. **Visibility of system status** — always show what's happening (loading, saved, progress).
2. **Match system & real world** — user's language and concepts, not internal jargon.
3. **User control & freedom** — undo/redo, exits, cancel; no traps.
4. **Consistency & standards** — within the product and with platform conventions (Jakob's Law).
5. **Error prevention** — constrain, validate, confirm destructive actions *before* they happen.
6. **Recognition over recall** — show options and context; don't make users remember.
7. **Flexibility & efficiency** — accelerators for experts (shortcuts, bulk), defaults for novices.
8. **Aesthetic & minimalist design** — every element earns its place; no decorative noise.
9. **Help users recognize, diagnose, recover from errors** — plain language, cause, fix.
10. **Help & documentation** — available in context when needed; ideally the UI needs none.

Run these as a lens over each key screen; record violations + resolutions in `Design.md §24 Design QA Checklist`.

## HCI laws — delegated to existing skills (reference, don't restate)

Invoke these skills when their concern is live; summarize their output into `Design.md`, don't copy the skill text:

- **Fitts's Law** → `fitts-law` skill — target size & distance; frequent/important targets bigger & closer, destructive ones separated.
- **Gestalt principles** → `law-of-proximity`, `law-of-similarity`, `law-of-closure`, `law-of-continuity`, `law-of-common-region`, `law-of-figure-ground` — grouping & perceptual structure.
- **Visual hierarchy** → `visual-hierarchy` skill — size/weight/color/spacing/position ordering.
- **Layout math** → `better-layout` skill — grid, padding, wrapping, truncation.

## HCI laws — no skill exists → summarized here

### Hick's Law
Decision time grows with the number and complexity of choices. **Apply:** reduce/curate options, recommend a default, group, or stage decisions; break long forms into steps. Pairs with Choice Overload ([[behavioral-design]]). *Verified: no `hicks-law` skill installed — use this summary.*

### Jakob's Law
Users spend most of their time on *other* products, so they expect yours to work like the ones they know. **Apply:** follow established patterns for common flows (auth, search, cart, settings, nav); innovate only where it creates real value, and never on the plumbing. Deviating from convention costs a learning tax — spend it deliberately. *Verified: no `jakobs-law` skill installed — use this summary.*

### Progressive Disclosure
Show the essential first; reveal complexity on demand. **Apply:** defaults + "advanced" affordance; multi-step over one dense screen; summary → detail. Keep to **≤ 2 disclosure levels** (deeper nesting usually tests poorly) and never hide frequently needed actions.

### Recognition Over Recall
(Also Nielsen #6.) Menus, suggestions, recent items, visible state — reduce memory burden.

### Serial Position Effect
First and last items are best remembered — order nav and lists accordingly. (Also in [[behavioral-design]].)

### Zeigarnik Effect
Visible unfinished tasks pull users back — honest progress, resumable flows. (Also in [[behavioral-design]].)

### Doherty Threshold / Perceived Responsiveness
System response under ~400ms keeps users productive and engaged. **Apply:** optimistic UI, skeletons, instant feedback on tap, perceived-performance techniques; if real work is slow, show truthful progress ([[emotional-design]] §4). Never fake speed with fake completion.

### Tesler's Law (Conservation of Complexity)
Every system has irreducible complexity — the only question is who absorbs it. **Apply:** the product should absorb complexity (smart defaults, inference, automation) rather than pushing it onto the user. Don't "simplify" by dumping decisions on the user.

## Accessibility

WCAG 2.2 AA design checks, input modalities, focus-not-obscured, target size, drag alternatives, reflow and responsive tab order live in `accessibility.md`. Responsive behavior, the four screen states and link preview belong to `web-deliverables.md`.

## Output hooks

Feeds `Design.md` **§24 Design QA Checklist** (Nielsen lens), **§13/§14 Component & Interaction Design** (Fitts/Gestalt/Hick/Jakob/Tesler), **§16 Responsive**, **§17 Accessibility**, **§15 Motion** (Doherty). Cross-refs: [[cognitive-design]], [[behavioral-design]], [[accessibility]].
