# OG Image Design Guidelines — Companion to `web-deliverables.md`

Loaded **only** when designing a social-preview (Open Graph) image for a publicly reachable web page (Stage 4, public web surface). The *delivery contract* — trigger, required metadata, absolute URLs, crawler-visibility, verification, evidence — lives in `~/.claude/web-deliverables.md §4`. This file is the OG **design methodology**. It does not restate the anti-AI-slop catalog; for the general theory see `skills/t-design/references/anti-ai-slop.md`.

**Core principle:** an OG image is **not** a webpage squeezed into 1200×630. It is a **purpose-built social card communicating ONE primary idea rapidly** — the clearest, most recognizable, product-specific expression of the page that still works as a small social preview.

---

## 1. Research sources & hierarchy

Use these when internet access is available; **do not copy any reference directly** — research informs judgment, it does not replace design reasoning.

| Source | URL | Use for |
|--------|-----|---------|
| **Landing.Gallery** | `https://www.landing.gallery/og-image-examples` | what strong **real websites** are shipping (production validation) |
| **OGImage.gallery** | `https://www.ogimage.gallery/` | recurring **OG composition patterns** across categories |
| **Dribbble** | `https://dribbble.com/tags/og-image` | **exploration only** — composition/typography/illustration/art-direction ideas |

**Hierarchy:** Landing.Gallery + OGImage.gallery = production reference → Dribbble = broader visual exploration (**not** production validation) → then **`t-design` synthesizes a product-specific solution.**

## 2. Research procedure (guidance, not a quota)

1. **Identify the page/product type** — SaaS · AI app · developer tool · finance · enterprise · ecommerce · portfolio · editorial/article · education · consumer app.
2. **Browse relevant examples** — roughly **5–8 strong production** examples, plus **3–5 exploratory** when extra ideation helps. Stop when enough evidence exists.
3. **Classify** useful references into archetypes (below) and capture each:

| Reference | Archetype | What Works | Why | Product Relevance | What Not to Copy |
|---|---|---|---|---|---|

4. **Synthesize:** `OBSERVED PATTERN → WHY IT WORKS → PRODUCT FIT → ADOPT / ADAPT / REJECT`. Never "Stripe does this, therefore we should."

## 3. Visual archetypes (choose intentionally)

- **Product-first** — apps/SaaS/tools: one strong interface/product fragment + short title. Avoid an entire unreadable dashboard screenshot.
- **Typography-first** — editorial/launches/bold statements: excellent typography + minimal supporting visual.
- **Brand-symbol-first** — established/distinctive brands: recognizable product/brand object + minimal text.
- **Editorial/image-first** — creative/portfolio/content: photography or illustration as focal point.
- **Data/technical** — developer/technical/infrastructure: a purposeful diagram/interface/data motif; don't overload with tiny detail.

When direction isn't obvious, produce **2–3 meaningfully different concepts** (e.g. A typography-led, B product-interface-led, C branded-object-led) — **not** the same composition in three gradients. Evaluate:

| Criterion | A | B | C |
|---|---|---|---|
| 2-second comprehension | | | |
| Product specificity | | | |
| Brand fit | | | |
| Thumbnail readability | | | |
| Focal clarity | | | |
| Safe composition | | | |
| Website visual-DNA match | | | |
| Anti-slop risk | | | |

## 4. Composition principles

- **One focal point.** Ask "What should the eye notice first?" then make everything subordinate. Avoid logo + headline + paragraph + CTA + cards + dashboard + badges all competing.
- **Structure:** `BRAND/SOURCE → ONE CLEAR MESSAGE → PRODUCT-SPECIFIC VISUAL → MINIMAL SUPPORTING INFO`.
- **Text hierarchy:** ≤ ~3 meaningful levels — (1) brand/source, (2) primary headline, (3) optional small descriptor. No paragraphs, long feature lists, tiny UI labels, badge stacks, or CTA-button replicas; the post/page context supplies the rest.
- **Headline quality:** short · concrete · product/page-specific · readable when scaled down. Avoid "Unlock the power of AI," "Supercharge your workflow," "AI-powered productivity," "Next-generation intelligence."
- **Product-specific visual DNA:** derive palette/typography/imagery/product-objects/tone/density from the actual website — preserve the same visual DNA without duplicating the page layout. Derive from domain · user · page purpose · brand · personality · trust level · density · existing design system. Do **not** default to purple gradients, futuristic AI imagery, glowing orbs, glass panels, a generic dashboard screenshot, or random abstract 3D.
- **Safe composition:** design for unpredictable preview cropping/scaling — generous horizontal + vertical insets, critical brand/headline/focal element concentrated in the **central** portion. Edge-to-edge critical text is not safe.
- **Product screenshots** can work when the interface itself communicates the product — but crop to the meaningful portion, enlarge important UI, remove irrelevant chrome, stay truthful, and stay comprehensible at thumbnail size. Never paste the whole desktop at tiny scale.
- **Avoid mini-webpage syndrome:** reject compositions that resemble homepage-hero + feature-cards + CTA buttons + tiny dashboard shrunk into the card. Remove UI elements that only make sense as controls.

## 5. Deterministic text rendering

Do **not** rely on diffusion/image-generation for critical text. Image generation may produce illustration, scenery, texture, background motif, or conceptual imagery. Render **deterministically** (HTML/canvas/Figma/code): logo · wordmark · headline · product name · numeric data · UI labels · legal/critical copy. Typography must stay crisp.

## 6. Approval tests (run before presenting)

- **2-second comprehension test** — at feed/thumbnail scale, does it answer *What is this? · Who/what is it from? · Why might I care?* within ~2 seconds? If the viewer must read a paragraph or decode a miniature UI, simplify.
- **Thumbnail test** — inspect at much smaller size: headline still readable · brand recognizable · focal point obvious · imagery understandable · composition doesn't collapse · text isn't noise. A card that works only at 1200px width is not finished.

## 7. OG anti-slop gate (before Stage 4 OG approval)

```
[ ] Not merely a screenshot of the homepage
[ ] Not a webpage compressed into an image
[ ] Not generic purple-gradient SaaS art
[ ] No floating AI orb without product-specific justification
[ ] No tiny unreadable UI
[ ] No fake metrics
[ ] No fake product interface
[ ] No excessive badges
[ ] No generic "AI-powered" headline
[ ] No decorative 3-card layout
[ ] No five competing focal points
[ ] Brand/product recognizable at thumbnail size
[ ] Message understandable quickly
[ ] Visual language belongs to THIS product
[ ] Composition strong without trendy decoration
```

Any unchecked box needs a written justification in `Design.md` or the OG direction does not pass Stage 4.

## 8. Dynamic / route-specific OG (larger products only)

Consider page-specific cards when valuable — homepage → product/brand OG · feature → feature-specific · article → title/topic · case study → customer/result · docs → product/documentation. Don't require route-specific OG the architecture doesn't justify; a strong global fallback beats broken dynamic metadata. Dynamic templates (brand + page title + category + product motif) must be **systematic, not generic**: maintain brand consistency + thumbnail readability, prevent text overflow, handle long titles, render deterministically, and keep a fallback asset.

---

**Design-time vs deployment-time (see `web-deliverables.md §4/§5`):** Stage 4 defines title intent · meta-description intent · OG visual direction · headline · composition · asset mockup. Stage 7 creates the final asset + all metadata. Stage 11 verifies production metadata, absolute URLs, asset accessibility, crawler-visible HTML, and the actual unfurl.
