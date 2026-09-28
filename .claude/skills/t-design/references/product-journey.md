# Product Journey Reference — `t-design`

Loaded when the surface classifier says **Product Journey**: a public website leads into an authenticated product (SaaS, AI tools, PLG, developer tools, marketplaces, collaboration, consumer apps, freemium, trial or invite-led). The acquisition layer still uses `web-experience.md`; this file designs **the path from first promise to first meaningful value and beyond** as one journey, not isolated screens.

**Stage 4 is not complete when the landing page looks good. It is complete when the path from PROMISE → ENTRY → FIRST VALUE → PRODUCT has been visually designed, audited as one journey, and explicitly approved.**

Model: DISCOVERY → VALUE PERCEPTION → INTENT → ENTRY → IDENTITY → SETUP → FIRST MEANINGFUL ACTION → VALUE REALIZATION → ACTIVATION → REPEAT USAGE → ADOPTION → MONETIZATION → RETENTION → EXPANSION / REACTIVATION. **Signup is not success. Onboarding completion is not success. Value realized is the first success.**

## Contents
1. Promise + job · 2. Activation model · 3. Activation spine + time-to-value · 4. Entry + auth · 5. Visual intensity + continuity · 6. Onboarding · 7. First run, empty states, home by lifecycle · 8. App shell, object model, terminology · 9. Lifecycle states + returning routing · 10. Monetization · 11. Seam audit + integrity gates · 12. Edge-case journeys · 13. Journey mockups + approval · 14. Freeze + stage pointers

---

## 1. Promise + job (before any onboarding design)

```yaml
product_promise: {user, problem, promised_outcome, mechanism, proof_required, primary_CTA}
user_goal:       {trigger, job, desired_outcome, current_alternative, anxieties, constraints, evidence_needed}
```
Derive both from `Discovery-PRD.md` / `Solution-PRD.md`. Don't invent them. **Promise integrity:** MARKETING PROMISE = ONBOARDING TARGET = ACTIVATION VALUE = CORE PRODUCT JOB. If any of these differ materially, raise a *Product Experience Integrity issue* before designing further.

## 2. Activation model

Keep these distinct:

| Term | Meaning |
|---|---|
| Signup | identity/account event |
| Aha moment | the user recognises the value |
| Value realization | the user receives a meaningful outcome |
| **Activation event** | **measurable** behaviour indicating first meaningful value |
| Adoption | repeated or expanded use |
| Retention | continued meaningful return |

**Define activation before onboarding.** Answer: what value is promised? Which action makes it true for the first time? What event measures it? Which prerequisites are truly necessary, and what can wait until after value? What should activation predict later?

```yaml
activation:        # a HYPOTHESIS for greenfield products; validated post-launch (product-analytics.md)
  value_moment:
  event_candidate:
  qualifying_properties:
  activation_window:       # e.g. first_session, 7 days
  target_time_to_value:
  prerequisites:
  optional_setup:          # deferred until after value
  downstream_validation:   # repeat core action, Wk-4 retention, paid conversion, team adoption
```
**Source of truth:** activation and any North Star candidate *refine* the success criteria in `Discovery-PRD.md` and the metrics in `evaluation-plan.md`. They never compete with them. The product team proposes what value is; analytics tests whether it predicts retention. Both are required.

**Multi-level (complex/B2B):** value perception → value realization → workflow activation → team activation → adoption. Don't force one event to represent every level. Distinguish **user** activation from **account/workspace** activation where teams exist.

## 3. Activation spine + time-to-value

`LANDING PROMISE → CTA → SIGNUP → MINIMUM SETUP → CORE ACTION → MEANINGFUL OUTPUT → VALUE REALIZATION → ACTIVATION EVENT`

For each pre-activation step ask: **does this move the user closer to first value?** If not: remove it, postpone it, infer it, prefill it, make it optional, or collect it after activation.

```yaml
time_to_value: {target, starts_at, ends_at, blockers}
```
Optimise **time and effort to value**, not screen count. A longer flow is justified when the configuration genuinely increases success.

## 4. Entry + auth

**Intent preservation:** a CTA's intent survives authentication. "Analyze a contract" → auth → *the contract-analysis flow*, never a generic dashboard. Carry the intent (and any data the user already provided) through signup, verification, OAuth round-trips and invite acceptance.

Flow: `CTA → SIGNUP/LOGIN → VERIFICATION (only if needed now) → ACCOUNT/WORKSPACE CONTEXT → RESUME INTENDED TASK`. Decide:
- Can OAuth cut friction?
- Is a password needed?
- Must verification happen now, or can it happen after value?
- Is SSO required?
- Does the invite flow differ from self-signup?

**Try-before-signup:** `LANDING → TRY CORE PRODUCT → PARTIAL VALUE → SIGN UP TO SAVE/CONTINUE`. Use it only when anonymous use is technically safe, value doesn't need persistent state, auth is a major barrier, and abuse/cost/privacy risks are manageable. Never use it as a universal default.

**Auth edge cases:** each needs defined recovery.
- existing email, wrong password, forgot password
- expired magic link, pending verification, OAuth cancelled
- identity conflict (same email via Google and password), SSO required
- expired invite, already a member, deleted account, session expired (re-login returns to the same place)

## 5. Visual intensity + continuity

**Visual expressiveness follows user intent:**

| Surface | Mode |
|---|---|
| Marketing | expressive, persuasive |
| Signup | focused, trustworthy |
| Onboarding | guided, clear |
| Core product | utility-first, efficient |
| Dense workflows | low decoration, high density |

It stays **one system**, not identical layouts:

```yaml
experience_continuity: {brand, typography, colors, radius, surfaces, iconography, tone, terminology, motion, trust_language, CTA_language}
```
Auth must feel like the same product, not a vendor widget.

## 6. Onboarding

**Choose the model deliberately. Never default to a multi-step wizard.** Options: zero · inline · setup wizard · checklist · template-first · sample-data-first · guided setup · concierge · persona-branch · progressive · AI-assisted setup. **The principle is the minimum onboarding required to reach first value.**

**Question test:** for every question, ask *"what changes because we know this?"* Personalization must change content, defaults, templates, workflow, recommendations, permissions or configuration. If nothing changes, don't ask yet; otherwise it's interrogation, not personalization.

**Progressive setup** (complex products): first session gets the minimum; integrations after first value; team setup later; advanced settings later still. Nothing non-essential blocks first value.

**Recovery:** preserve progress if the user leaves. Support resume, editing previous answers, skipping where safe, and a deliberate restart. Never auto-restart.

**Tours:** prefer **DO → LEARN** over TOUR → REMEMBER → DO. No "Tooltip 1/9" by default. Use contextual guidance only where it helps complete real work.

## 7. First run, empty states, home by lifecycle

**The first authenticated screen serves the next best action.** It's not "Welcome back + KPI cards + Recent activity + chart + quick actions". Candidates: create the first object · import · upload · try a sample · connect an integration · launch the first workflow · invite a teammate. Use a dashboard only when monitoring is the primary job (`anti-ai-slop.md §4`).

**Home evolves with lifecycle:**
- **New:** the activation task.
- **Activated:** recent work plus the primary creation action.
- **Power user:** density, filters, shortcuts, bulk actions, collaboration.

Design these separately. A new user has no data or habits and needs orientation. An activated user needs continuation. A power user needs speed.

**Empty states are activation surfaces.** Say what this object is, why it matters, what to do, and what happens next. Offer create · import · try sample · use template · short example. **Sample data** suits setup-heavy products (analytics, BI, dev tools, data-hungry AI). Sample data must be unmistakably distinguishable from real data, and there must be a clear path from sample to real.

## 8. App shell, object model, terminology

Define the **product object model** first (project, document, analysis, workspace, report, interview, dataset, team, template…). Navigation reflects the domain.

```yaml
app_shell: {primary_navigation, secondary_navigation, global_actions, contextual_actions, account_menu, help, notifications, workspace_switcher}
```
Don't reflexively ship sidebar + topbar + search + bell + profile. Each element needs a job.

**Terminology map** across landing · onboarding · product · pricing · billing · help. One object has one name ("Projects" in marketing never becomes "Workspaces" in the app unless they're different things).

## 9. Lifecycle states + returning routing

Reason about each applicable state: anonymous · authenticating · verification pending · invited · new · setup incomplete · activated · returning · free · trial · trial ending · paid · usage limit reached · payment failed · downgraded · cancelled · dormant · reactivated · permission denied · suspended · session expired. **Specify every applicable state; prototype only the ones that settle a decision.** The UI treatment of each still follows `web-deliverables.md §2` (what happened · what can I do · was work preserved).

**Lifecycle-aware CTAs and routing:**

| User state | CTA / destination |
|---|---|
| anonymous | "Get started" |
| logged in | "Open app" |
| partially onboarded | "Continue setup" |
| trial expired | "Choose plan / resume" |
| invited | "Join workspace" |

Deep links and email links land on the object, through login if needed.

## 10. Monetization

```yaml
monetization: {model, trial, free_limits, paywall_trigger, upgrade_trigger, checkout, post_checkout_return, downgrade, cancellation, payment_failure}
```
- **Pricing is part of the product:** marketing pricing = entitlements = usage limits = upgrade prompts = billing settings. Conflicting claims are an integrity failure.
- **Intent-preserving paywall:** attempted action → explain the required plan → upgrade → **return to the attempted action and continue**. Never a generic pricing page followed by the dashboard.
- **Limit states:** design *approaching the limit* (an honest usage counter, e.g. "2 of 3 used", plus a heads-up before the last unit) and *at the limit*. Whether the cap is **soft** (warn, allow a grace unit) or **hard** (block) is a product decision recorded in `Design.md` §27. Existing work stays accessible either way.
- **Honesty:** downgrade, cancellation and payment failure are designed as clearly as upgrade, and pass the ethical gate (`behavioral-design.md`). No roach motels, no confirm-shaming.

## 11. Seam audit + integrity gates (run on the rendered journey before approval)

**Seams:**
- marketing → signup → onboarding → product
- product → paywall → checkout → product
- logout → marketing
- invite → product
- email/deep link → product
- session expired → login → product

For each seam ask: was context preserved? Was state preserved? Was terminology kept? Was the destination expected? Did the visual language stay coherent? Was unnecessary work introduced?

**Integrity gates** (each passes or has a written justification in `Design.md`):
- **Promise:** onboarding leads to the promised value.
- **Intent:** CTA intent survives auth and paywall.
- **Terminology:** objects are named consistently.
- **Visual:** the journey feels like one product.
- **Behavioral:** patterns are predictable.
- **Activation:** onboarding drives first value.
- **Monetization:** pricing promises match entitlements.
- **Lifecycle:** new/returning/trial/paid/recovery states fit together.
- **Analytics:** the primary funnel and activation are actually measurable (`product-analytics.md`).

## 12. Edge-case journeys (reason about all; mock up only the decisive ones)

- **Abandonment:** signup abandoned · onboarding abandoned or skipped · returning the next day · unverified user returns · dormant return.
- **Entry:** invite entry · deep-link entry · a logged-in visitor clicks "Get started" · mobile-first entry.
- **Data and failure:** no data · partial data · import failure · AI generation failure.
- **Billing:** free limit reached · trial expiry · payment failure · downgrade · cancellation.
- **Access:** workspace change · permission failure.
- **Conditions:** slow network · reduced motion.

## 13. Journey mockups + approval

Every direction prototypes a **representative journey**, not just a landing page: landing · CTA/entry · signup/login · onboarding/setup · core action · activation success · product home · returning user (+ mobile). Skip screens the product model doesn't need. Gallery structure, journey parameter panel and whole-journey hybridization are in `mockup-exploration.md §5, §7, §11`. Direction hypotheses are strategies, not defaults, for example:
- **Product-first / low friction:** product evidence → minimal auth → no onboarding question → template or direct core action → task-first home.
- **Guided / personalized:** use-case story → role + goal → personalized workspace.
- **Try-before-account:** interactive product → partial value → sign up to save → resume work.

**Approval question:** *"Do you approve this complete product-entry and activation journey?"* Don't ask "do you approve the landing page?"

## 14. Freeze + stage pointers

**Freeze** (added to Design Freeze): marketing promise · CTA destinations · intent preservation · onboarding model · activation path · app-entry behaviour · terminology · lifecycle routing · monetization return path. A major change needed during implementation goes back to Stage 4.

**Measurement** (analytics contract, funnels, retention, identity, Mixpanel): `product-analytics.md`. **Stage 8** critiques the implementation *across seams* (website → auth → onboarding → app → billing, returning routing, empty states, terminology, continuity, mobile), not screen by screen. **Stage 12** runs the post-launch loop in `product-analytics.md §9`.

## Output hooks

Feeds `Design.md` **§27 Product Experience**, §3, §5, §6, §13, §18, §19, §20, §22 and the Design Freeze block. Cross-refs: [[web-experience]], [[product-analytics]], [[mockup-exploration]], [[behavioral-design]], [[cognitive-design]], [[emotional-design]], [[accessibility]], [[anti-ai-slop]].
