# Spatial 3D Reference — `t-design`

Loaded only when a proposed experience **materially depends** on real-time 3D, spatial visualization, product inspection/configuration, simulation, WebGL/WebGPU, or XR. **3D is a medium, not a style. Three.js is a tool, not a design goal.** The default is 2D/native web. Stage 4 decides *whether and why*; Stage 6 decides *how*.

**Decision order:** USER NEED → COMMUNICATION PROBLEM → INTERACTION MODEL → 2D or 3D? → SPATIAL STRATEGY → TECHNOLOGY. **Never** "it looks impressive → add Three.js."

## Contents
1. Necessity gate · 2. Valid use cases · 3. Rejected uses · 4. Interaction + input modalities · 5. Mobile · 6. Accessibility, reduced motion, progressive enhancement · 7. Loading, failure, context loss · 8. Performance as a design constraint · 9. Scroll + 3D · 10. Scope, immersion, text, brand · 11. Stage-6 handoff · 12. 3D gate + approval · 13. Stage 8/9 checks

---

## 1. Necessity gate (run first)

**Does the third spatial dimension communicate something that would be materially worse in 2D?** If not, use the lowest-complexity medium that works, climbing this ladder only as far as needed:

`HTML/CSS → SVG / animated SVG → image / illustration / product screenshots → video / pre-rendered sequence → CSS 3D transforms → Canvas 2D → real-time 3D`

3D must improve at least one of: spatial understanding · product inspection · configuration · physical structure · system architecture · simulation · narrative · data interpretation · education · exploration · brand expression that is *specific to this product*. If the main value is novelty, "premium feel", wow factor, trend, or decorative depth → **reject**.

| Need | Start with |
|---|---|
| Standard UI | HTML/CSS |
| Diagram | SVG |
| Product shot | image / UI composition |
| Simple animated object | CSS / SVG |
| Predefined cinematic motion | video |
| Interactive physical object · configuration · real-time spatial scene | real-time 3D |
| Immersive XR | 3D + WebXR |
| Decorative depth only | a simpler medium |

**Why 3D** needs a specific answer ("users must inspect port placement from several angles"; "scroll-controlled assembly shows how the hinge works"). "Modern / immersive / premium" is not an answer.

## 2. Valid use cases (classify the experience)

- **Product viewer:** rotate, zoom and inspect physical shape and detail.
- **Configurator:** colour, material, component or variant choices shown on the object.
- **Exploded view:** internal components, layers, assembly, hardware.
- **Spatial hero:** one strong object or environment that *is* the product or brand. Never a generic floating object.
- **Scroll-driven narrative:** scroll drives camera, assembly or state to explain a mechanism.
- **3D diagram:** relationships that are genuinely spatial.
- **3D data viz:** only when the third axis improves interpretation.
- **Simulation:** physics, process or behaviour that informs.
- **Virtual environment:** showroom, gallery, exhibition. Always provide non-spatial navigation too.
- **XR / AR / VR:** only when immersive interaction is part of the product. Always provide a non-XR experience.

## 3. Rejected uses (unless explicitly justified in Design.md)

Floating gradient orb · rotating cube · random particles · spinning logo · decorative sphere · "AI brain" · abstract blob · meaningless starfield · parallax object unrelated to the product · decorative 3D card stack · arbitrary chrome object · a globe that isn't geographically meaningful.

**Product-specificity test:** "If I replaced the product name, could this 3D scene belong to 20 unrelated startups?" If yes, reject or rework.

**Metaphor truthfulness test:** when the 3D object is a *metaphor* (e.g. a physical server rack standing in for virtualized cloud spend), ask whether it represents how the product actually works. If the metaphor misleads, or the real problem is categorical or data-shaped rather than spatial, treat the scene as decorative: default to 2D and let a 2D direction compete in the gallery before any 3D is approved.

## 4. Interaction model + input modalities

Define only purposeful interactions: rotate · zoom · pan · orbit · drag · select · inspect · configure · explode · isolate · animate · scrub · move through the scene. Camera: static · orbit · constrained orbit · cinematic path · scroll-controlled · user-controlled · sectional viewpoints. Camera motion must communicate relationship, progression, focus or narrative, and must never disorient.

Specify each modality separately (never infer it from screen width; see `accessibility.md §3`):
- **Mouse:** click · drag · wheel · cursor feedback. Hover never carries critical function.
- **Trackpad:** decide who owns a gesture. Manipulating the scene must never hijack page scroll, and accidental zoom or horizontal pan must be prevented (e.g. zoom only with modifier/pinch, or via buttons).
- **Touch:** make it obvious whether the user is moving **the page** or **the object**. Typical: one finger on the model rotates, pinch zooms, vertical swipe outside the model scrolls the page. No conflicts with browser back/forward gestures.
- **Keyboard:** rotate/zoom buttons, previous/next viewpoint, reset view. Essential tasks never require free-form pointer manipulation.
- **Screen reader:** see §6.

**Affordances:** a "Drag to rotate" hint, a rotate icon, cursor change or light onboarding, dismissed once the user has understood. Viewers get rotate, zoom, **reset view** and **predefined viewpoints**. Configurators: **semantic DOM controls own the selected state; the canvas reflects it.**

## 5. Mobile (mandatory; mobile is not desktop with fewer polygons)

Ask: *what is the minimum phone experience that preserves the communication goal?* Choose:
1. **Native page scroll + touch model interaction** (default for product sites)
2. **Simplified 3D:** less geometry, texture, particles and post-processing; lower render resolution
3. **Static / video / sprite / pre-rendered fallback** when the 3D cost isn't justified on a phone

Consider GPU limits, battery, thermal throttling, memory, network, texture size, high-DPI cost and viewport. **Responsive composition:** framing adapts to aspect ratio, container, orientation, content overlap and safe areas. Use separate camera framing per context, not a shrunken desktop view.

## 6. Accessibility, reduced motion, progressive enhancement

**Canvas is not semantic UI.** If 3D carries critical information, provide an equivalent:
- configurator → semantic controls + a text statement of the selected state
- architecture diagram → text or table
- product viewer → product details + image alternatives
- spatial navigation → DOM navigation

Headings, navigation, CTAs, forms, body content and controls stay in the DOM. Never rebuild normal UI in WebGL. Important body copy is never 3D text; 3D text is only for spatial labels, wordmarks or signage.

**Reduced motion** (define explicitly): static camera, no auto-rotation, no parallax or flythrough, minimal transitions, user-controlled state changes, instant or short camera moves. **Keep the scene if static interaction is still useful.** Don't remove it wholesale by reflex.

**Progressive enhancement order:** semantic HTML → core product content → 2D fallback → optional 3D. The message and the primary conversion stay available when WebGL/WebGPU is unavailable, JS fails, the scene is disabled, reduced motion is on, or the device is too weak.

**Audio and permissions:** audio is opt-in, with mute and volume. Request camera, sensor or orientation permissions only when a function requires them.

## 7. Loading, failure, context loss

- **Loading:** a lightweight poster or preview image appears immediately. Show real progress only if it's real, or stage the load. No blank black canvas with a spinner.
- **Failure** (model, texture, context, GPU or init fails): fall back to the poster or images. Product explanation, primary CTA and core content stay reachable.
- **Context loss:** degrade or recover gracefully. The implementation disposes geometry, materials, textures, render targets and the renderer, especially on SPA route changes (Stage 6/7).

## 8. Performance as a design constraint

Before approval: is the GPU/CPU cost worth it? Does it improve comprehension, confidence or conversion? Does it replace several static explanations? Is there a lighter alternative? The heavy-feature line in `web-conversion.md §8` is **required** for any real-time 3D.

Design-level intents (Stage 6 implements them):
- **Quality tiers:** HIGH / MEDIUM / LOW / FALLBACK, adapted by device, viewport, DPR, reduced-data preference or measured performance.
- **Render on demand** when the scene is mostly static; no 60 fps loop when nothing changes.
- **Pixel-ratio cap.** Pause when the scene is off-screen or the document is hidden.
- **Post-processing** (bloom, DoF, outline, SSAO) only with a visual purpose and a justified mobile cost. Never stacked for spectacle.
- **Lighting describes form.** Glass, chrome, iridescence, neon or holographic materials are used only when brand or product earns them.
- **No unnecessarily dense models or oversized textures** without visible user value.
- The 3D must not wreck the page's Core Web Vitals: the hero LCP must not wait on the scene.

## 9. Scroll + 3D

If scroll drives the scene, state **scroll → what changes → why** for each binding (camera · assembly · rotation · material state · visibility · explode). Don't bind scroll to everything.

**Three.js does not imply Lenis.** Native scroll first (`motion-scroll.md`). Lenis (synchronised scroll state) + GSAP/ScrollTrigger (narrative timeline) + Three.js (rendering) is valid only when scroll storytelling is essential and synchronisation is required. **It is never a default "premium stack."**

## 10. Scope, immersion, text, brand

- **Minimum viable 3D:** one strong 3D viewer beats a whole-site 3D world. Valid hybrids: a 2D foundation + a 3D hero, an editorial layout + a 3D viewer, a native page + one scroll-driven 3D explanation.
- **Anti-immersion:** on conversion pages, spatial exploration must not bury the CTA, proof, pricing or clarity.
- **3D hero checks:** headline readable, CTA discoverable, scene doesn't compete with the message, the fallback poster shows immediately, and the mobile hero stays fast.
- **Design-system consistency:** brand colours, material language, lighting tone, shape and motion language. It must not feel like a foreign demo embedded in the page.
- **Licensing:** models, textures, HDRIs, fonts and audio need usage rights. Never lift assets from example sites.
- **Research capture:** `Reference | Pattern | Why it works | Product relevance | Performance risk | What not to copy`. Extract principles, not assets.

## 11. Stage-6 handoff (decide there, not in Stage 4, unless it changes the approved experience)

- **Framework:** Three.js vs React Three Fiber, based on app architecture, state integration, team familiarity, scene complexity and bundle cost. Stage 4 records "3D capability required", not "R3F required".
- **Renderer:** WebGLRenderer vs WebGPURenderer, plus browser-support and feature requirements. Never choose WebGPU because it's newer. (As of three.js r186, `WebGPURenderer` needs `await renderer.init()` and can fall back to a WebGL2 backend; `three` and `three/webgpu` are separate entry points, and custom GLSL doesn't carry over to TSL. Re-verify against current docs.)
- **Shaders:** Stage 4 states visual intent (e.g. "glass refraction", "procedural surface"). Stage 6 picks textures, TSL/NodeMaterial or ShaderMaterial.
- **Assets:** a GLTF/GLB pipeline, with Draco or Meshopt geometry compression and KTX2/Basis textures *where they pay off*. Also consider LOD, mesh simplification, baking, instancing and batching, and keep material and mesh counts under control. Don't prescribe every technique by default.
- **Runtime:** render loop vs on-demand, lazy loading of the scene and loaders, pixel-ratio caps, quality tiers, disposal and context-loss handling, fallback wiring, and a test approach.

## 12. 3D gate + approval (add to the anti-slop gate when §26 exists)

```
[ ] concrete communication/interaction purpose     [ ] simpler 2D alternatives considered
[ ] not a rejected use (§3) / passes product-specificity test
[ ] no 3D solely for premium feel                   [ ] brand/product visual logic in the scene
[ ] mobile strategy defined (§5)                    [ ] reduced-motion strategy defined
[ ] fallback + loading + failure states defined     [ ] critical content remains semantic
[ ] input modalities + gesture ownership defined    [ ] scroll and 3D don't conflict
[ ] heavy-feature line written; performance cost justified
```

**Visual approval.** A 3D concept is approved from a prototype, a rendered preview or a meaningful motion mockup, never from text alone. Stage 4 prototypes are lightweight: simplified geometry, a placeholder model, a video or pre-rendered sequence, or a small Three.js scene. They're never production-grade. In the gallery, a 3D direction **competes as a hypothesis** against 2D directions. Compare on clarity, specificity, interaction value, storytelling, conversion clarity, mobile viability, accessibility, performance, complexity and fallback quality. **Never assume 3D wins.**

Before approval, explain: why 3D, what it communicates, mobile behaviour, reduced-motion behaviour, fallback, expected performance cost and implementation complexity. Approval questions: What does 3D communicate? Why is 2D insufficient? Is interaction necessary? Does it improve understanding, storytelling, conversion or confidence? What are the mobile and reduced-motion strategies? What happens if 3D fails? Is critical information still accessible? Is the cost justified? Does the scene belong to *this* product?

**Freeze** (added to the Design Freeze block): camera concept, product composition, interaction model, scroll relationship, fallback, mobile strategy. A technical issue that forces a meaningful redesign goes back to Stage 4.

## 13. Stage 8/9 checks (when Design.md §26 exists)

- **Stage 8, critique:** spatial hierarchy, camera framing, interaction clarity and affordances, scene/product relevance, motion quality, visual fidelity to the approved prototype, mobile adaptation, fallback quality.
- **Stage 9, verification:**
  - Every input: mouse, trackpad, touch, keyboard.
  - Reduced motion, orientation and loading.
  - Forced failure (block WebGL / break the model URL).
  - The fallback path.
  - Browsers: Chrome, Safari, Firefox, Edge, iOS Safari, Android Chrome. GPU behaviour isn't identical across them.
  - Performance: frame pacing, jank, long tasks, memory, and disposal on route changes. Check that page CWV aren't destroyed and that the rest of the page stays usable.
  - Accessibility equivalence.

## Output hooks

Feeds `Design.md` **§26 Spatial 3D**, §15 (scroll relationship), §17, §25 `performance_constraints`, and the Design Freeze block. Cross-refs: [[motion]], [[motion-scroll]], [[web-conversion]], [[accessibility]], [[anti-ai-slop]], [[mockup-exploration]], [[web-experience]].
