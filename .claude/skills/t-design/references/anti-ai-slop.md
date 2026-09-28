# Anti-AI-Slop Reference — `t-design`

The generic-pattern rejection system. Loaded on **every** design pass (this is a gate, not an optional lens). Principle: **do not ban these absolutely — require justification.** A pattern is allowed only when **product context, brand, or interaction purpose** earns it. The core rule: *use design to decide what deserves to exist, not to make the product merely look "designed."*

---

## 1. The slop catalog (each requires a justification to appear)

Unearned patterns to detect and challenge:

- generic purple/blue or blue-purple **AI gradients**; **mesh gradients**
- **neon / glowing** AI aesthetic; glowing CTAs; glowing borders
- excessive **glassmorphism** / glass cards
- floating **blobs / orbs**; floating 3D orb; AI-brain imagery; spinning logo / rotating cube / random particles / decorative globe (full 3D rejection list: `spatial-3d.md §3`)
- excessive **shadows**; large-radius-**everything**
- **card-everything** layouts; three-feature-card templates
- **dashboard-by-default**; meaningless KPI cards; **fake metrics**
- excessive **badges / pills**; unnecessary **icon** usage; sparkles everywhere
- oversized empty **hero** areas; **excessive whitespace** as a substitute for content
- generic **AI illustrations**; generic "AI-powered" labels
- **component-library-first** layouts (assembled from what exists, not what's needed)
- **decorative motion** (parallax + hover-scale + scroll-reveal + glow stacked with no purpose)
- **desktop-only** thinking; **happy-path-only** UX
- **fake loading / "AI thinking"** states; poor AI provenance
- generic SaaS **microcopy**; an interface identity that could belong to **any** product

**Web-experience additions** (landing / marketing / portfolio surfaces):
- generic **centered hero + blob**; hero = headline + subhead + 2 buttons + floating dashboard screenshot
- **three identical feature cards**; repeated icon-card sections; **decorative bento** (a grid of peers that aren't peers)
- **giant radius everywhere**; one soft shadow on everything; arbitrary **glow**; excessive **pills**
- **ALL-CAPS eyebrow** on every section; `A · B · C` meta strings; generic **monospace metadata** labels; meaningless trailing **arrows** (→)
- **fake testimonials / logos / metrics / awards**; logo walls with no relevance to the visitor
- "AI-powered" / "Supercharge" copy; **interchangeable SaaS identity**
- **random scroll reveals** on every section; **custom cursor** with no product reason; stacked **novelty effects**
- template palettes by reflex: default purple→blue gradient; near-black + one acid accent; cream + terracotta; all fine when the brand earns them, never as a default

For any that appear, `Design.md` must carry a one-line justification tied to context/brand/purpose. No justification → remove.

## 2. The Grayscale / Wireframe Test (run before any visual approval)

Mentally strip: gradients, color, shadows, glass, illustrations, decorative icons, motion. Ask whether the interface still clearly communicates:

**task · hierarchy · navigation · grouping · action · status · feedback · completion · recovery**

If **NO** → the structure is broken; rework the structure *before* styling. Styling must not be load-bearing for comprehension.

## 2b. The Beauty-Masking Test (aesthetic-usability effect)

Polish makes people forgive usability problems, so attractive mockups hide them. Review each mockup **once while deliberately ignoring how it looks** (use the grayscale state). Can users tell what the page is for? Is the next action obvious? Is information findable? Are there dead ends? Are important controls understandable? Are states and errors recoverable? Any "no" is a structural fix, not a styling one.

## 3. The 20-SaaS-Product Test

Ask: *"If I swapped the logo and product name, could this exact UI belong to 20 unrelated SaaS products?"*

If **YES** → rework: information architecture · content · task model · visual language · interaction patterns · density · terminology. The interface should be recognizably *this* product for *this* user's *this* task.

## 4. Structural rejections (with the correct alternative)

- **Reject card-everything.** A card must represent meaningful containment — answer *"why is this a contained object?"* Prefer, when apt: typography, spacing, dividers, lists, tables, grouped sections, inline hierarchy.
- **Reject component-library-first.** Correct order: **USER NEED → INFORMATION MODEL → INTERACTION → COMPONENT.** Never design by assembling Card/Badge/Tabs/Accordion/Dialog/Tooltip because they exist.
- **Reject dashboard-by-default.** First ask *"what is the user's dominant job?"* If it's one action, design a **task-first home**. Use a dashboard only when monitoring/comparison is genuinely the product's job.
- **Reject generic visual defaults.** Purple gradient, neon cyan, glowing CTA, glass cards, dark-navy "AI theme," large rounded cards, floating orbs, sparkles — allowed *only* when product/brand/interaction justifies.

## 5. Content & data honesty

- **Reject fake metrics.** Any displayed metric needs: definition · source · calculation · user relevance · actionable interpretation. If a number ("Efficiency +27%") has no data behind it, remove it.
- **Reject generic AI copy.** Ban by default: "Unlock the power of AI," "Supercharge your workflow," "Revolutionize your productivity," "Intelligent insights," "Seamless AI experience," "Next-generation platform." Prefer **OBJECT + ACTION + RESULT** — e.g. *"Upload two contracts and compare changes in obligations, dates, and clauses."*
- **Reject icon & badge saturation.** Icons must improve recognition; badges must carry real metadata/state. Don't decorate every nav item/CTA/heading/metric. Don't stamp `[AI] [NEW] [FAST] [SECURE] [SMART]` everywhere.
- **Reject decorative motion.** Every animation must communicate one of: state · continuity · hierarchy · spatial relationship · orientation · feedback · completion. Otherwise remove it. Define reduced-motion behavior.

## 6. Product-specific visual logic (derive, don't trend-follow)

Before styling, derive the visual system from: **domain · user role · task frequency · information density · risk · trust needs · brand · consequence of error · emotional tone.** *Then* decide typography, palette, spacing, radius, elevation, icon style, density, motion, imagery. Never decide these from trends. (See [[design-research]] §1 design-system discovery.)

## 7. AI epistemic honesty (AI/RAG/agent products)

- Design source citations, provenance, evidence, uncertainty, conflicting/missing evidence, system/tool status, human confirmation, fallback/error handling. Never present AI output as unquestionable truth. (Full detail in [[emotional-design]] §4.)
- **Real process transparency:** show `Retrieving → Reading → Comparing → Generating` **only when those stages actually happen.** Never fabricate "AI thinking" or invented delay.

## 8. Anti-AI-Slop Review Gate (part of Stage 4 approval — every box or a justification)

```
## Structure
[ ] UX works without decorative styling (grayscale test passes)
[ ] primary goal is obvious   [ ] hierarchy is clear   [ ] task model is coherent

## Product Specificity
[ ] not interchangeable with unrelated SaaS (20-SaaS test passes)
[ ] terminology is product-specific
[ ] visual direction reflects domain/user/task   [ ] anti-direction is explicit

## Components
[ ] no card-everything   [ ] components have interaction reasons
[ ] badges are semantic   [ ] icons improve comprehension

## Visual
[ ] gradients justified   [ ] glass justified   [ ] radius intentional
[ ] shadows communicate depth   [ ] typography reflects identity   [ ] color has semantic logic

## Copy
[ ] no generic AI marketing language   [ ] CTA text describes the actual action
[ ] metrics are real   [ ] labels correspond to real domain objects

## AI
[ ] processing states truthful   [ ] sources/provenance shown where needed
[ ] uncertainty communicated   [ ] consequential actions confirmed

## Responsive
[ ] mobile has its own task model   [ ] tablet defined   [ ] desktop defined

## Motion
[ ] every major animation has communicative purpose   [ ] reduced-motion defined

## Scroll (native scroll is the default — see motion-scroll.md)
[ ] native scroll was considered first   [ ] scroll model has a product reason
[ ] smooth scroll not used solely for "premium feel"   [ ] no scroll reveal on every section
[ ] no gratuitous parallax   [ ] no hidden horizontal scroll   [ ] no scroll-jacking
[ ] no excessive snap behavior   [ ] no multiple competing scroll systems
[ ] no giant pinned storytelling section without rationale
[ ] no scroll-dependent animation that hides content
[ ] mobile touch remains predictable   [ ] reduced motion supported   [ ] keyboard navigation works
[ ] nested scroll behavior intentional   [ ] performance cost justified

## Web experience (Web / Both surfaces only)
[ ] beauty-masking test passes   [ ] hero answers what / who / why / what-can-I-do at a glance
[ ] section order derived from audience awareness, not the default template
[ ] one dominant primary CTA; CTA labels name the action   [ ] every proof item is real + relevant
[ ] no web-experience catalog item without a justification (§1)
[ ] detector pre-check run on the mockups, findings fixed or justified (mockup-exploration.md §8)
[ ] every heavy feature has its line (web-conversion.md §8)   [ ] non-Baseline features have fallbacks

## Product journey (Product Journey surfaces only)
[ ] first-run is task-first, not "Welcome back + KPI cards + recent activity"   [ ] no default 9-step tooltip tour
[ ] every onboarding question changes something (no interrogation)   [ ] empty states offer a real next action
[ ] CTA intent survives auth and paywall   [ ] no generic sidebar+topbar+bell+search shell without a job for each part
[ ] `product-journey.md §11` integrity gates pass

## Spatial 3D (only when Design.md §26 exists)
[ ] `spatial-3d.md §12` 3D gate passes (purpose, 2D considered, not a rejected use, mobile, reduced motion, fallback, semantic content, gesture ownership, cost justified)

## /design (if used)
[ ] treated as exploration, not authority   [ ] selected direction passed t-design criteria
[ ] no conflicting design system introduced
```

Any unchecked box needs a written justification in `Design.md` or the design does not pass Stage 4.

## Output hooks

Gates `Design.md` **§1 Design Direction & Anti-Direction**, **§24 Design QA Checklist** (this gate is appended), and challenges every other section. Cross-refs: [[design-research]], [[emotional-design]], [[behavioral-design]], [[cognitive-design]], [[motion-scroll]], [[motion]], [[web-experience]], [[mockup-exploration]].
