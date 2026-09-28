# Design.md Template — `t-design`

Loaded at the spec-writing step. `Design.md` is the **single canonical spec**. Precedence on conflict: **approved `Design.md` > approved `.design/exploration/final/` prototype > `analytics/product-analytics-contract.md` > derived tool artifacts (e.g. Mixpanel files) > any other summary.** Never create a competing spec (no `web-experience-spec.md`). Produce every section that applies; for a section the product doesn't warrant, write one line saying why it's N/A.

Any `/design` canvas or gallery option is exploratory only.

````markdown
# Design Specification (`Design.md`)

## 1. Design Intent
- Design Direction (what it should feel like: e.g. evidence-first, restrained, editorial)
- Anti-Direction (what it must avoid: e.g. generic AI SaaS, purple gradients, glass cards, arbitrary KPI cards)
- Core aesthetic + any generative assets specified (Higgsfield) and why
## 2. User Context — mental-model analysis (goal, knowledge, vocabulary, conventions, uncertainty, fear, success signal, recovery)
## 3. Core User Journeys
## 4. Emotional Journey — intended vs risk emotion per step; the engineered peak + end
## 5. Information Architecture
## 6. Screen / Flow Architecture
## 7. Attention Architecture — one focal point per screen; scan order
## 8. Cognitive Load Analysis — intrinsic vs extraneous removed vs deferred
## 9. Behavioral & Psychological Design Rationale — each principle used + why + ethical-gate pass
## 10. Production Pattern Research — Mobbin clusters, references, anti-patterns
## 11. Anti-References — 2–3 concrete "must not be like" + why
## 12. Design System — discovery result (extend vs create); OKLCH color scale, typography, spacing/radius
## 13. Component Architecture — USER NEED → INFO MODEL → INTERACTION → COMPONENT
## 14. Interaction Design — Fitts/Gestalt/Hick/Jakob/Tesler applied
## 15. Motion Design — physics (spring/ease/damping); each animation's communicative purpose; reduced-motion; **Scroll Strategy** (primary scroll model + why; one line if native — full subsection template in motion-scroll.md §9 when the model is non-trivial)
## 16. Responsive Behavior — mobile task model, tablet, desktop (see web-deliverables.md)
## 17. Accessibility — WCAG 2.2 (contrast, keyboard, targets, semantics, motion, text, forms)
## 18. State Design — loading / empty / error / working for every data-backed view (four states)
## 19. Trust & Transparency — provenance, reversibility, honest limits; AI epistemic UX where relevant
## 20. Error & Recovery Strategy — blame the system, name the fix, preserve work
## 21. Interaction Cost Analysis — step count for the dominant task; where cost was cut
## 22. UX Risks & Assumptions
## 23. Validation Plan — how the design will be validated (points to eval-framework.md)
## 24. Design QA Checklist — Nielsen lens + the Anti-AI-Slop Review Gate + web-deliverables design gates
## 25. Web Experience — ONLY for Web / Both surfaces (see web-experience.md)
```yaml
web_experience:
  audience:            # awareness levels, sophistication, trust, device, entry source
  user_need:           # "I need… so that…"
  business_goal:
  conversion:          # primary / secondary / exploratory
  narrative:           # opening → first_evidence → main_explanation → proof → objection_handling → conversion_point
  visual_direction:    # name + hypothesis
  anti_direction:
  layout:              # max/reading width, columns per size, rhythm, density, alignment, full-bleed policy
  typography:          # pointer → §12 if already there
  color:               # pointer → §12
  surfaces:            # which treatment is allowed WHERE
  hero:                # approach + the 4 answers (what / who / why / what can I do)
  navigation:          # positioning, sticky, scrolled state, menu model, primary action, mobile pattern
  imagery:
  iconography:
  desktop:
  mobile:              # its own task model — nav, hero, layout, CTA, media, sticky elements
  scroll:              # pointer → §15 (desktop / trackpad / phone_touch / reduced_motion)
  motion:              # pointer → §15 (intensity + primary moments)
  accessibility:       # pointer → §17
  performance_constraints:   # heavy-feature lines (web-conversion.md §8)
  seo_intent:          # page purpose, title intent, heading hierarchy, internal-link intent
  og_direction:        # pointer → og-image-guidelines.md mockup
  analytics_intent:    # decisions that need measurement (tooling is Stage 6)
  assumptions:         # every ASSUMPTION still open
```
Fields already owned by §12/§15/§16/§17/§19 hold a one-line pointer — never a second copy.

## 26. Spatial 3D — ONLY when real-time 3D is approved (see spatial-3d.md; omit entirely if N/A)
```yaml
spatial_3d:
  required: true
  purpose:                 # e.g. product_visualization
  use_case:                # viewer | configurator | exploded_view | spatial_hero | scroll_narrative | diagram | data | simulation | environment | xr
  why_3d:                  # the specific thing 2D can't communicate
  critical_to_experience:  # true | false — if false, the page works fully without it
  interaction:             # per modality: desktop / trackpad / mobile / keyboard (+ gesture ownership)
  camera:                  # static | orbit | constrained orbit | path | scroll-controlled | viewpoints
  scroll_relationship:     # none, or scroll → what changes → why
  mobile:                  # native+touch | simplified 3D | static/video fallback
  reduced_motion:
  loading:                 # poster, real progress only
  fallback:                # what shows if 3D is unavailable or fails
  accessibility:           # equivalent content + semantic controls
  performance:             # quality tiers, heavy-feature line (web-conversion.md §8)
  implementation_candidate:   # e.g. three.js — finalized in Stage 6
```

## 27. Product Experience — ONLY for Product Journey surfaces (see product-journey.md)
```yaml
product_experience:
  promise:            # product_promise YAML (user, problem, outcome, mechanism, proof, primary CTA)
  job_to_be_done:
  activation:         # hypothesis, value_moment, event, qualifying_properties, window, target_ttv (refines Discovery-PRD success criteria)
  entry:              # model (signup-first | try-before-signup | invite | SSO), intent_preservation, auth edge-case recovery
  onboarding:         # model, required_inputs (each with "what changes"), deferred_inputs, recovery
  first_run:          # next_best_action, empty_state (activation surface), sample data?
  core_product:       # object model, primary workflow, app_shell
  lifecycle:          # new / activated / power / returning / trial / paid / dormant + CTA routing
  monetization:       # model, paywall trigger, post-checkout return path, downgrade/cancel/payment-failure
  continuity:         # terminology map, visual intensity by surface, experience_continuity
  seam_audit:         # result per seam + integrity gates (product-journey.md §11)
  measurement:        # pointer → analytics/product-analytics-contract.md (primary funnel, activation validation, retention definition)
```
````

## Design Freeze (write at the top of Design.md once the user approves)

```markdown
> **DESIGN FROZEN — <date>, approved by user.** Frozen: information architecture · hero · visual direction · CTA hierarchy · motion concept · scroll concept · approved mockup `.design/exploration/final/` (+ if §27 exists: marketing promise · CTA destinations · intent preservation · onboarding model · activation path · app-entry behaviour · terminology · lifecycle routing · monetization return path) (+ if §26 exists: camera concept · product composition · 3D interaction model · scroll relationship · 3D fallback · 3D mobile strategy).
> Implementation may adjust technical details, pixel-level issues, browser constraints, and accessibility fixes. Changing any frozen item goes back to design review (build-workflow scope-change rule); delegated design skills never override it.
```

## Decisions

Record load-bearing design decisions in `decisions.md` as `D#` blocks (existing format: Context / Decision / Rejected). Add optional **Evidence.** and **Consequence.** lines when the decision rests on research or constrains later stages. Decisions made through `grill-me-design` may add **State.** (provisional/validated, under heading status `proposed`), **Impact.**, **Tradeoff.**, **Phone.**, **Reduced motion.**, **Validation.**, **Reopen if.**, **Design debt.**, **Experiment.**; the heading status stays one of `proposed | accepted | rejected | superseded`. Don't log cosmetic tweaks.
