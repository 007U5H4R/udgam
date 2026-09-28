# Design Research & Exploration Reference — `t-design`

Loaded when the design needs **production-pattern evidence, generative assets, visual exploration, or existing-system discovery**. Covers Mobbin, Higgsfield, the optional `/design` exploration protocol, design-system discovery, anti-references, and inspiration sources.

---

## 1. Design-system discovery FIRST (before generating any new visual language)

Never invent a design system on top of an existing one. Before exploration, inspect for and extend what exists:

- existing **tokens** (CSS variables, `theme.*`), **Tailwind config**, typography/spacing/radius scales
- existing **components**, icon set, elevation/shadow language
- **theme files**, existing screenshots / live UI
- brand rules, logo, voice

**If a coherent system exists → extend it.** Only create new language where none exists or the brief explicitly calls for a redesign. Record what was found + the extend-vs-create decision in `Design.md §12 Design System`. Do not let any tool introduce a competing system.

## 2. Mobbin — production pattern research (evidence, not inspiration-scrolling)

Use `mcp__mobbin__search_flows`, `mcp__mobbin__search_screens`, `mcp__mobbin__search_sections` to ground patterns in shipped products.

- Query by **app category + the specific flow** you're designing (onboarding, empty state, checkout, settings, search, permissions…).
- Extract: **pattern clusters** (how real products solve this), **relevant reference screens**, **design implications**, and **anti-patterns** (what to avoid).
- For large screen sets, dispatch the **Mobbin research subagent** (see `SKILL.md` subagent policy) so screenshots don't pollute primary context; it returns clusters + implications + anti-patterns, not raw dumps.

Record findings in `Design.md §10 Production Pattern Research` — cite the actual patterns, not "best practices" in the abstract.

## 3. Higgsfield MCP — generative media assets (only when the product needs them)

Use for hero imagery, brand motion concepts, 3D mockups, background/texture, video placeholders — **when the product's visual language genuinely calls for generated media** (not by default; see [[anti-ai-slop]] on generic AI imagery).

- Concrete tools: `mcp__claude_ai_Higgsfield__generate_image` / `generate_video` / `generate_3d` (+ `_batch` variants with `jobs_wait`).
- Drive with a **specific brief** (subject, style, palette, mood tied to the product), never "make it premium."
- Skip entirely for utility/dense/enterprise products where generated imagery would be noise.

Record in `Design.md §1 Design Intent` / §12 which assets are specified and why.

## 4. Optional `/design` visual-exploration protocol

`/design` is an **optional accelerator, never a dependency** (see `SKILL.md` §Optional visual exploration). In THIS installation there is **no `/design` slash command**; the exploration role maps to available capabilities: the native **Artifact "design" canvas** (`intent: design`), **Higgsfield/Recraft** image gen, or **Figma import**. If none is available or the environment can't run it, **fall back to the native `t-design` workflow — Stage 4 never fails for lack of `/design`.**

When exploration IS used, pass a **structured brief** (never "make it beautiful"):

```
Product:            what is being built
User:               who uses it
Primary task:       what they must accomplish
Domain:             legal / finance / health / productivity / …
Information density: low / medium / high
Trust sensitivity:  low / medium / high
Emotional target:   what it should feel like
Existing system:    tokens / components / brand rules (from §1 discovery)
Constraints:        accessibility, responsive, enterprise, PWA, …
Anti-direction:     what it must NOT look like (from Design.md Anti-Direction)
Behavioral principles: only those selected as relevant
Required states:    loading / empty / error / working
Deliverable:        what visual exploration is expected (2–3 distinct directions)
```

**Ask for meaningfully distinct directions: competing hypotheses, not the same layout with different gradients.** Direction count, strategy-based naming, the distinctness test, the plan-then-review step, the HTML gallery and hybridization live in `mockup-exploration.md`. `/design` output feeds that gallery; it never replaces it.

### `/design` output is NOT auto-approved
Every exploration output is evaluated **by `t-design`** against the criteria table, then a direction is selected/adapted:

| Criterion | A | B | C |
|---|---|---|---|
| User-goal fit | | | |
| Product specificity | | | |
| Cognitive load | | | |
| Information hierarchy | | | |
| Trust | | | |
| Accessibility | | | |
| Responsive viability | | | |
| Design-system fit | | | |
| Anti-slop risk | | | |

**`/design` generates possibilities; `t-design` makes the decision.** Do not choose on aesthetics alone. Record the chosen direction + why in `Design.md §1` and `decisions.md`. The canvas is exploratory; **`Design.md` remains canonical.**

### Command-collision safety
If more than one `/design`-like capability is registered, do **not** silently invoke an ambiguous one — determine the intended capability, prefer the exact underlying skill/tool, and document what was used.

## 5. Anti-reference thinking (record in `Design.md §11`)

Define what the interface must **not** be, as concretely as what it should be:

- Name 2–3 **anti-references** — specific product styles/patterns this must avoid and why (e.g. "not a generic AI-SaaS purple-gradient dashboard," "not a dense enterprise grid the user must be trained on").
- Pair with the **Design Direction / Anti-Direction** block in `Design.md §1`.
- This feeds the anti-slop gate ([[anti-ai-slop]]).

## 6. Source hierarchy (calibration, never copying)

| Tier | Sources | Use for | Not for |
|---|---|---|---|
| 1 Standards | W3C/WAI (WCAG 2.2), MDN, web.dev (CWV, Baseline), Apple HIG, Material, GOV.UK Design System, official Lenis/Motion/GSAP docs | accessibility, platform capability, performance, input, scroll/motion tech | aesthetics |
| 2 UX research | Nielsen Norman Group, Baymard, HCI studies | IA, disclosure, cognitive load, scanning, forms, trust, conversion friction | visual style |
| 3 Books | Norman, Krug, Garrett, Cooper, Tidwell, Weinschenk, Wroblewski, Walter, Marcotte, Wathan/Schoger | principles (never rigid laws) | quoting as rules |
| 4 Production | **Mobbin** (§2), Landing.Gallery, SiteInspire, category-leading real sites, selective Awwwards/Godly | pattern discovery, composition, category conventions, responsive treatment | copying a design |
| 5 Exploratory | Dribbble, concept portfolios | art direction, unconventional composition, motion ideas | usability evidence |
| 6 Agent skills | delegated skills (`web-design-engineer`, `landing-page-design`, `build-awwwards-quality-sites`, `emil-design-eng`) | recipes + vocabulary (subordinate to Design.md, see SKILL.md precedence rule) | decisions |

**The existing project design system is the strongest reference; extend it.**

**Research stop rule:** stop browsing when more examples stop changing the design hypothesis. **Research summary:** record only *pattern · rationale · relevance · risk* per finding (in `Design.md §10`), never a dump of references.


## Output hooks

Feeds `Design.md` **§1 Design Intent** (incl. Design Direction/Anti-Direction), **§10 Production Pattern Research**, **§11 Anti-References**, **§12 Design System**. Cross-refs: [[anti-ai-slop]], [[cognitive-design]].
