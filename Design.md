# Design Specification — Udgam (`Design.md`)

**Stage:** 4 · UI/UX Design · **Status:** APPROVED — Final · Opal-inspired, approved by Tushar Pathak 2026-09-29 · **Date:** 2026-09-28
**Inputs:** `Solution-PRD.md` (approved; S10), `Discovery-PRD.md`, `evaluation-plan.md`, `decisions.md`
**Surfaces (§6):** Capture app — Core, mobile PWA · FPO admin — Core, desktop · Buyer dashboard — Core, desktop · Public certificate `/verify/[batchId]` — Web (public, OG applies). Not a Product Journey: there is no marketing site in the MVP.


> **DESIGN FROZEN — 2026-09-29, approved by user.** Frozen: information architecture · hero (plot card on Home; proof card first on the certificate) · visual direction (Opal-inspired glow, §1 and §12 tokens) · CTA hierarchy (one primary pill per screen) · motion concept (one cherry moment; progress by real checks) · scroll concept (native) · brand object (coffee-cherry cluster, `final/cherry.svg` v2) · approved mockup `.design/exploration/final/` (index.html, verify.html, admin.html) + link-preview `og/verify.png`.
> Implementation may adjust technical details, pixel-level issues, browser constraints, and accessibility fixes. Changing any frozen item goes back to design review (build-workflow scope-change rule); delegated design skills never override it.

## 1. Design Intent
- **Direction — "Opal-inspired glow, made Udgam's own."** Owner-selected on 2026-09-28 after rejecting three directions (Estate Record Book, Your Plot Proven, One Thing at a Time), with the Opal iOS app as the explicit reference. Near-black ground with a coffee-leaf green ambient glow; frosted dark cards with hairline borders; large bold near-white type; one gradient-lit word or number per screen; full-width pill buttons with an iridescent green-to-lavender under-glow; a floating glass tab bar; tinted bottom sheets for serious moments. Udgam's brand object is a **glowing cluster of three oval coffee cherries on a short branch with two leaves** (`.design/exploration/final/cherry.svg` v2; v1 was a single round cherry that read as a plum or apple and was replaced at the gate), rim-lit green on Verified and amber on Needs a check.
- **Anti-direction:** a copy of Opal (no gem, logo, names or copy); crypto/Web3 (neon, hexagons, chain icons); generic agritech SaaS (leaf logo, KPI cards); stock farmer photos; gamification; fake processing; grey-on-black low-contrast text.
- **Content unchanged from the exploration:** every screen, check, verdict label, copy rule and state from `plans.md` shared brief and research patterns. Only the visual language changed.
- **Generative assets:** none. The cherry is hand-built SVG gradients, not a generated image.

## 2. User Context — mental-model analysis

**Primary user: the person holding the phone in the plot.** The owner's direction is that the product is "mostly used by farmers". DISC10 keeps the field agent as the login and the farmer as a record; in Kodagu the agent is frequently a farmer or a farmer's family member. The capture app is therefore designed for a farmer's comfort with phones regardless of which of the two is holding it. ASSUMPTION: roles stay as DISC10 unless the owner decides farmers log in themselves (open question at the Stage 4 gate).

| Question | Answer for the capture app |
|---|---|
| Goal | "Get today's picking recorded so it counts and I get paid." |
| Starting knowledge | Knows the plot, the picking, kg on a scale, WhatsApp, PhonePe/GPay, the phone camera. Does not know what a signature, satellite check or ledger is, and should never need to. |
| Vocabulary | tota/estate, plot, picking, cherry, kg, arabica/robusta, FPO, "the office", bill, weighment. Not: submission, verification run, batch, custody, anchor. |
| Conventions | WhatsApp (send + ticks), UPI apps (big amount, clear success screen), camera app (shutter at bottom). |
| Primary uncertainty | "Did it go through? Will they accept it?" |
| Primary fear | Being wrongly accused, losing the record, a payment held up, looking foolish with the phone. |
| Success signal | A clear "Verified" with a plain reason, and the entry visible in their list. |
| Recovery expectation | "If the network fails, keep it and let me try again." |

**Secondary users.** FPO admin (desk, laptop; reviews "Needs a check" items, draws plots, builds batches). Buyer/exporter (compliance manager; wants the certificate and the EUDR map file). Public verifier (importer/auditor/consumer scanning a QR on a phone; skeptical by default).

## 3. Core User Journeys
1. **Record a picking (dominant, daily in season):** open app → plot preselected → take 1–3 photos → enter kg → send → checking (real steps) → verdict → back to list.
2. **Recover from no network:** send fails → "Saved on this phone" → try again later → verdict.
3. **Understand a "Needs a check":** open the entry → plain reason ("The satellite picture for this week was cloudy") → nothing to do; the office will look.
4. **Enrol a phone (once):** enter the 6-character code from the office → phone is ready.
5. **Admin: review queue** → evidence lines → accept/reject with a reason.
6. **Buyer / public: open certificate** from QR → see where the coffee came from → see "Verified in your browser".

## 4. Emotional Journey
| Step | Intended | Risk to prevent | Response |
|---|---|---|---|
| Open app | oriented, capable | "what do I press?" | one dominant action, plot already chosen |
| Photos | competent | unsure it's good enough | framing guide, count "1 of 3", retake always available |
| Weight | precise, in control | typo anxiety | huge numerals, unit always shown, edit before send |
| Checking | informed, patient | suspicion, abandonment | the real check names ticking off; honest duration |
| Verified (peak) | proud, recognised | anticlimax | the one bold moment of the direction + plain reasons + entry now in the list |
| Needs a check | reassured, unblamed | accused, anxious | "nothing is wrong with what you did"-style framing only when true; says who looks next and when |
| Not accepted | clear, fairly treated | shame, anger | names the exact reason, no accusation words, says what to do |
| End | settled | "did it save?" | returns to the list with the new entry on top |

Peak = the verified verdict. End = the list with the new entry visible.

## 5. Information Architecture
- **Capture app (agent):** floating tab bar with three items — **Home** (plot card + record action + last pickings) · **Pickings** (all entries by month, each opening its detail: photos, kg, verdict, reasons) · **Help** (how to take good photos, what the verdicts mean, call the office, language, this phone). The record flow (photos → review → weight → checking → verdict) is a full-screen stack with the tab bar hidden.
- **Admin (desktop):** Review queue (default) · Plots (map + list) · Batches · Devices. Left rail, four items.
- **Buyer (desktop):** Batches (default) → Batch detail → Certificate.
- **Public:** `/verify/[batchId]` single page: summary → origin map → harvest entries → who holds it now → proof panel → downloads.

## 6. Screen / Flow Architecture
Capture screens: Home · Photo (camera + guide) · Weight + review · Checking · Verdict (3 variants) · Couldn't send (saved) · Entry detail · Enrol phone. Admin: Review queue · Review item · Plot editor · Batch builder. Buyer: Batch list · Batch detail. Public: Certificate.

## 7. Attention Architecture (capture)
| Screen | Single focal point | Scan order |
|---|---|---|
| Home | the record action | date/plot → action → recent entries |
| Photo | the viewfinder with guide | count → guide → shutter |
| Weight | the kg number | number → keypad → send |
| Checking | the current step | steps top-to-bottom |
| Verdict | the verdict word + mark | verdict → reasons → done |

## 8. Cognitive Load Analysis
| Screen | Intrinsic | Extraneous removed | Deferred |
|---|---|---|---|
| Home | choose to record | no dashboard, no menus; plot preselected (most recent) | plot switching behind "Change plot" |
| Photo | aim the camera | GPS happens silently; status shown as a plain line | photo tips behind "How to take a good photo" |
| Weight | type a number | numeric keypad only, unit fixed to kg, no decimals beyond .5 | notes field (not in M1) |
| Checking | wait | only real steps shown, no percentages | technical detail |
| Verdict | understand result | reasons in plain words, max 3 visible | full evidence behind "See all checks" |

## 9. Behavioral & Psychological Design Rationale (ethical gate applied)
- **Peak-End:** verified verdict is the peak; the list with the new entry is the end. Passes: truthful, user's own goal.
- **Goal gradient:** step indicator in the record flow shows real position (photo → weight → send). No fake progress.
- **Real process transparency (labor illusion, ethical use):** the checking screen lists the checks actually running (Solution-PRD §6) and ticks them off as they finish. No invented delay.
- **Von Restorff:** one visually dominant action per screen.
- **Recognition over recall:** plot preselected, recent kg shown as a hint, never required.
- **Not used:** streaks, badges, leaderboards, urgency, social proof. Gate: every principle helps the farmer's own goal, is truthful, can be ignored, exploits no fear, and the honest path is the easy path. Pass.

## 10. Production Pattern Research
Mobbin, 20 searches (2026-09-28), summary in `.design/exploration/plans.md` → "Research-driven patterns". Adopted: labelled photo slots with counter; review-after-capture with Use/Take again (native camera, no custom viewfinder, because of F4); big number + custom keypad + value in the button (Cash App, Noom); one verdict template for all three outcomes; "needs review" states who checks and when (DoorDash, Starling); dot timeline + origin table for the certificate (Bolt, Assembly Coffee); drag-point polygon editing for admin (Fi). Visual language: Opal iOS (owner reference; `.design/exploration/ref/`). Gaps: no agriculture apps and no PhonePe/GPay/Meesho screens on Mobbin.

## 11. Anti-References
1. Opal itself, copied literally — the language is borrowed; the object, words and content are Udgam's.
2. Crypto wallet UIs — dark neon, token balances, chain metaphors signal speculation, not provenance.
3. Agritech dashboards with KPI tiles — farmers have one job; a dashboard is noise.

## 12. Design System
Discovery: no existing system (greenfield) → create. Canonical values live in `final/index.html` `:root` and are reproduced here.
| Token | Value | Role |
|---|---|---|
| `--bg` | `#0A0E0C` | ground (green-biased near-black) |
| `--glow` | radial, `rgba(64,150,110,.55)` → transparent, from top | ambient ground glow |
| `--surface` / `--surface-2` | `rgba(255,255,255,.06)` / `.10` + 20 px backdrop blur | frosted cards, rows |
| `--surface-solid` | `#191D1B` | fallback without `backdrop-filter` |
| `--hairline` | `rgba(255,255,255,.12)` | 1 px borders |
| `--ink` / `--ink-2` / `--ink-3` | `#F3F6F4` / 74 % / 58 % (ink-3 only ≥ 15 px) | text |
| `--grad-text` | `#B9F5D2 → #7FE3C1 → #D8F58C` | the one lit word/number per screen |
| `--ok` / `--ok-ink` | `#7FE3A6` / `#9CF0BF` | Verified |
| `--check` / `--check-ink` | `#F2B84B` / `#FFCB6B` | Needs a check |
| `--bad` / `--bad-ink` | `#EF6A5B` / `#FF8C7E` | Not accepted |
| `--cherry` | `#C8322B` | brand object body |
| `--pill-glow` | radial `rgba(127,227,166,.65)` + `rgba(170,150,255,.35)` from below | primary button under-glow (amber variant for sheets) |
| `--focus` | `#D8F58C` | focus ring |
Radii: cards 28 px, rows 22 px, pills 999 px. Print: a light token set (ink `#111`, ok `#14532d`, check `#7a4b00`, bad `#9b2217`), no glow, no glass.
**Type:** Figtree 400–800 (Latin) + Noto Sans Kannada 400/600/700. Body `clamp(17px…18px)`/1.5; small 15 px; h1 `clamp(28px…34px)`/1.15; minimum 13 px anywhere; tabular numerals for kg and dates. **Spacing:** 20 px side padding, 8-pt rhythm.

## 13. Component Architecture (need → info → interaction → component)
- Record a picking → plot + position → one tap → **primary pill** (60 px, glow).
- Am I in the right place? → plot polygon + GPS → glance → **plot card** (SVG from GeoJSON, pulse dot, sentence).
- Which photos? → 3 roles → tap slot → **photo slot tiles** + counter.
- How many kilos? → number + unit + history range → type → **numeric keypad** + lit number.
- What is being checked? → real check list → watch → **check rows** + progress bar (fills by finished checks).
- What happened? → verdict + reasons → read → **verdict screen** (cherry, lit word, evidence card, one pill).
- Nothing lost → saved payload → retry → **tinted bottom sheet**.
- Past entries → list → scan → **frosted rows** with verdict chip (word + mark + colour).
- Admin decision → evidence + score + cap reason → decide with reason → **detail pane** + reason panel; hard-fail = no override.

## 14. Interaction Design
Fitts: primary pill full-width in the thumb zone; tab bar floats above the safe area. Hick: one primary action per screen; photo count choice capped at 3. Jakob: native camera, UPI-style number entry, WhatsApp-style "sent" certainty. Gestalt: frosted containment only where content is one object (plot card, evidence card, rows). Tesler: GPS, signing, EXIF and satellite work are invisible; only their results are shown.

## 15. Motion Design
One primary moment: on Verified the cherry rises 12 px and its rim glow blooms (400 ms, ease-out). Progress bar fills as each real check finishes (no fake pacing). Screen changes: 200 ms fade/slide for continuity. Location dot: slow pulse ring on Home (communicates "live"). `prefers-reduced-motion`: no movement, glows static, checking screen shows a "See result" button. **Scroll strategy:** native scroll everywhere; no smooth-scroll library, no scroll-driven effects.

## 16. Responsive Behavior
Capture app is phone-first: single column, primary action pinned in the thumb zone; on heights < 700 px decorative extras (small cherry, one sentence, photo height) shrink so the action stays visible at 320 × 568 (measured). Tab bar hidden inside the record flow. Tablet/desktop: centred phone column (prototype shows a storyboard). Certificate: single column on phones with proof first (EVAL-087); two-column map + journey from 1000 px. Admin: rail + queue + detail at ≥ 1100 px; list → detail with back button at 768 px; still usable at 375 px. No horizontal scroll at 320/375/768/1440 (measured, 48 app/certificate states + admin states).

## 17. Accessibility (direction-independent commitments)
WCAG 2.2 AA minimum; outdoor use raises body text to ≥ 7:1 where the palette allows. Primary touch targets ≥ 56 px, all ≥ 48 px, spaced. Every icon has a word. Verdict never by colour alone (word + mark shape). Text at 200 % and 320 px reflow. Reduced motion defined per direction. Kannada: line-height ≥ 1.6 for body, no fixed-height text boxes, labels allowed to wrap to two lines. Screen-reader: live region announces each check and the verdict. Camera: a "Choose from gallery" alternative is NOT offered in M1 because gallery photos defeat capture-time signing; the reason is stated in help text.

## 18. State Design
| View | Loading | Empty | Error | Working |
|---|---|---|---|---|
| Home | skeleton of plot line + list (no spinner) | "No pickings recorded yet" + record action | "Couldn't load your entries. Your saved pickings are safe on this phone." + retry | plot + list |
| Photo | "Finding your location…" line (GPS) | n/a | camera permission denied → how to allow, in 2 steps; GPS weak → "Move to open sky" and still allow capture (the verifier scores it) | viewfinder |
| Checking | real steps | n/a | timeout → saved on phone + retry | — |
| Verdict | — | — | provider unavailable → "Needs a check" (never "Not accepted") | 3 variants |
| Couldn't send | — | — | this IS the error: what happened · what next · "Nothing is lost — 3 photos and 42 kg are saved on this phone" | — |
| Admin queue | table skeleton | "Nothing to review" | load error + retry | list |
| Certificate | proof panel shows real steps ("Checking 12 records…") | batch not found → plain message | proof mismatch → names the failing record, no green anywhere | full page |

## 19. Trust & Transparency
- Every verdict shows its reasons in plain words (evidence sentences from the verifier, rewritten for farmers at the copy layer).
- Needs a check / Not accepted always say who looks next and what the farmer can do.
- The certificate never asserts "verified" from the server: the visitor's browser recomputes and the page says so ("Checked on this device just now").
- Honest limits on the certificate: organic status shown as "Certified by <issuer>, certificate on record", never "verified organic" (DISC4). Known limitations (EV6) linked from the proof panel.
- EV16: public page shows pseudonymous producer IDs and plot outlines, no names or phone numbers.

## 20. Error & Recovery Strategy
Blame the system, name the fix, preserve work. Every capture error states: what happened · what to do · "nothing is lost" (true because the signed payload and photos are kept in IndexedDB). Message placed where the eye is (inline, near the action), never a toast that vanishes.

## 21. Interaction Cost Analysis (dominant task)
Open app (1) → Record (1) → shutter ×1–3 (1–3) → confirm photos (1) → type kg (2–3 taps) → Send (1) → Done (1). **8–11 taps, 1 decision (how many photos), 0 text fields.** Cut: plot preselect (−2 taps), no photo-caption field, no confirm dialog on send (reversible: entry can be marked mistaken by the office).

## 22. UX Risks & Assumptions
- ASSUMPTION: Kannada strings in mockups are placeholders pending native-speaker review.
- ASSUMPTION: "Hear this" audio (Direction C) would use device TTS; availability of good Kannada TTS on target phones is unverified.
- **Risk: dark UI in direct sunlight** (owner-selected Opal language). Mitigated by near-white body text measured at 13.9–15.9:1 on frosted cards, all text ≥ 4.5:1, nothing under 13 px; field-test at midday is a validation-plan item. Fallback if it fails: a light "Sunlight" token set, same components.
- Resolved at the gate: the single cherry read as a plum/apple; replaced by a three-cherry cluster (D2).
- Open (not blocking): whether farmers log in themselves. DISC10 stands (field agent logs in, farmer is a record) until the owner decides otherwise (D8).
- Risk: 20 s checking wait feels long — mitigated by real step ticks; measure in S3 timing (EV9).

## 23. Validation Plan
Pointer to `evaluation-plan.md` (design cases EVAL-086 capture, EVAL-087–EVAL-090 certificate) plus: 5-person hallway test with FPO staff or farmers on the final mockup (task: record a picking; success = unaided completion + correct explanation of a "Needs a check"), outdoor readability check at midday, Kannada string review by a native speaker.

## 24. Design QA Checklist
**Nielsen lens:** visibility of status (checking rows, verdict, saved-on-phone) ✓ · match with the real world (farm words, kg, plot) ✓ · user control (Take again, Back, Try later) ✓ · consistency (one verdict template) ✓ · error prevention (range hint, photo check list) ✓ · recognition over recall (plot preselected) ✓ · efficiency (8–11 taps) ✓ · minimalist (one action per screen) ✓ · error recovery (every error: what happened, what next, nothing lost) ✓ · help (Help tab) ✓.
**Anti-AI-Slop Review Gate:** Structure — grayscale test passes (hierarchy is carried by size, weight and position; glow is not load-bearing) ✓. Specificity — 20-SaaS test passes (plot card, cherry, farm vocabulary) ✓. Components — no card-everything (cards only for single objects), badges semantic, icons paired with words ✓. Visual — **gradients, glass and glow: justified by the owner's explicit choice of Opal's language**, each confined to its role (glow: ground, primary pill, cherry; glass: cards, tab bar, sheets; gradient text: one word per screen) ✓; radius intentional (28/22/999) ✓; shadows only on floating bar and sheets ✓. Copy — no AI marketing language, CTAs name the action ✓, no fake metrics ✓. AI — N/A (no AI behaviour); processing states are the real checks ✓. Responsive — mobile task model defined, tablet and desktop defined ✓. Motion — one purposeful moment, reduced motion defined ✓. Scroll — native ✓. Web (certificate) — detector run; findings fixed or justified (§ Evidence) ✓.
**Detector (impeccable) on `final/`:** 36 static findings. Fixed: print colours on the certificate (warnings now ≥ 7.4:1 on paper, buttons hidden in print). Justified: zero-offset glows (Opal language); "cramped padding" on prototype storyboard frames (scaffolding, not product); contrast pairs computed by compositing translucent tints over white (the real page is dark; rendered-pixel contrast measured ≥ 6.2:1). 
**Web-deliverables design gates:** Responsive ✓ (measured) · Screen states ✓ (§18, reachable by hash in the mockups) · OG ✓ (`og/verify.png`, 1200 × 630, 327 KB, brand-symbol archetype, thumbnail test on `og/index.html`) — production metadata/unfurl verification is Stage 11.
**Ethical gate:** pass (§9). **Accessibility checklist:** semantic order ✓, keyboard path ✓, visible focus (`#D8F58C`) ✓, targets ≥ 48 px (primary 60) ✓, reflow 320 ✓, text 200 % — to verify in Stage 8, reduced motion ✓, colour independence ✓, no drag-only actions ✓ (admin polygon drag gets point-add/remove buttons in Stage 7), labelled forms ✓, tab order = visual order ✓.

## 25. Web Experience (public certificate only)
```yaml
web_experience:
  audience: EU importer / auditor / consumer scanning a QR; skeptical; phone first
  user_need: "I need to know where this coffee came from and whether I can trust that, without trusting the seller"
  business_goal: certificates accepted by importers → exporters adopt Udgam
  conversion: primary = confidence (proof verified); secondary = EUDR GeoJSON download
  narrative: proof result → what this batch is → where it was grown (map) → journey → entries → organic status → downloads → honest limits
  visual_direction: pointer → §1
  hero: the proof card (what = Verified on this device; who = batch + origin; why = checked by your browser; do = how it was checked / download)
  navigation: none beyond in-page; states banner is prototype-only
  imagery: plot outlines drawn from GeoJSON; no photos of people
  mobile: proof first above any map (EVAL-087); compact entry list; pills full width
  scroll: native
  motion: none beyond proof progress
  performance_constraints: no heavy media; SVG maps only
  seo_intent: title "Kodagu Arabica, verified at origin — Udgam"; one h1; noindex decision deferred to Stage 6 (public but per-batch)
  og_direction: pointer → .design/exploration/og/ (brand-symbol-first; approved with the UI)
  analytics_intent: count certificate views and proof failures (tool chosen in Stage 6)
  assumptions: organic issuer name; public key URL; Kannada not used on this page
```

## 28. M-002 addendum — agreements, settlement and processing
**Stage 4 re-entry for TKT-23 (TASK-24).** **Status:** accepted as D9 under the owner's blanket waiver (EXE1); owner review is pending at Stage 8. **Mockup:** `.design/exploration/final/contract.html`; the reviewer's "Screens" menu reaches every screen, variant and state by hash. **Inputs:** Solution-PRD F17 and F18, tickets TKT-25 and TKT-26, technical-plan TSK-25.8 and TSK-26.5. The section is numbered §28 because technical-plan TKT-23 names it so; §26 and §27 are not used.

This section only adds to the design. It changes no frozen item above. The tokens, components, motion, IA and copy rules of §1–§25 apply unchanged. The mockup copies the `:root` tokens, base CSS and icons of `final/admin.html` verbatim. The certificate step copies the journey CSS of `final/verify.html` verbatim. The added composition CSS uses only values already present in those two files, with no new colour, radius, type size, shadow, icon or motion (TP17).

### 28.1 Screen inventory
| # | Surface · route | Screen | What the person does | States in the mockup |
|---|---|---|---|---|
| 1 | Buyer · `/buyer/agreements` (+ the detail of the selected agreement) | Agreement list | Sees every agreement with its FPO, crop, agreed kg, amount, deadline and a status chip, then opens one. The detail shows the terms, the latest settlement result and the three conditions, read-only. | data · loading · empty · error · working |
| 2 | Buyer · `/buyer/agreements/new` | New agreement | Fills in the FPO, crop, agreed kg, minimum grade, amount in mock INR and deadline. Creating it records the agreement; funding is the next step. | data · loading · empty · error · working |
| 3 | Buyer · `/buyer/agreements/[id]` while the agreement is *Created* | Fund | Reads what moves where (amount, balance before and after, the three conditions, the refund date) and funds it. Variant: after the deadline with nothing settled, **Take the money back** (refund). | data (fund, refund) · loading · empty (not found) · error · working |
| 4 | Buyer · `/buyer/agreements/[id]` while the agreement is *Funded* and a batch is delivered | Grade a delivered batch | Picks one grade label for the delivered batch (§28.3) and signs it. Grades below the agreed minimum are marked before signing. | data · loading · empty (no batch delivered yet) · error · working |
| 5 | FPO admin · `/admin/agreements` + `/admin/agreements/[id]` | Agreement detail with the settlement panel | Sees the three conditions, each as **value vs threshold** with Met or Not met. Settles when ready. Sees *Payment released* (`--ok`) or *Not released* (`--check`), which names each condition that was not met. | data (ready, released, not released) · loading · empty · error · working |
| 6 | Processor · `/processor` + `/processor/batches/[batchId]` | Record a processing step, then hand on | Picks a process (pulping, drying, hulling parchment, hulling dry cherry), enters input kg and output kg, and signs. Sees *Within range* (`--ok`) or *Flagged* (`--check`) with the evidence sentence, then hands the batch on to a buyer. | data (form, within, flagged, handed on) · loading · empty · error · working |
| 7 | Public · `/verify/[batchId]` | Certificate journey: the processing step | Sees one more item in "How it got here", for example "Hulled · At Processor C-03 · 600.0 kg in, 480.0 kg out (80.0%)". A flagged step shows the Needs-a-check mark, the word *Flagged* and the expected range in `--check`. | data (within, flagged) · loading · empty (no step: journey unchanged) · error (does not match) |

One change outside the new screens: the existing admin **Transfer custody** panel (batch detail) also lists processor organisations as recipients, under their own option group. Its layout is unchanged; only the list content grows.

### 28.2 Processor entry point — recommendation: a new `/processor` surface with a `processor` role
- **Recommended.** Add a `processor` role and a `(processor)` route group at `/processor`, guarded by `requireSession('processor')` in the layout, in every Server Action and in every route handler (technical-plan §10). TSK-26.3 extends the `user.role` CHECK. The guard-coverage test (`tests/guard-coverage.test.ts`) adds `processor` to its route-group pattern.
- **Why.**
  - *Least privilege on a security-sensitive build.* A processor needs one task: record a step for a batch it holds, then hand it on. An admin role brings the review queue, overrides, plot editing, phones and custody transfer. A scoped admin view would need an org-type check added to every existing admin guard and query. One missed check would show FPO data to a processor: farmer pseudonyms, plots and evidence.
  - *The guard model stays one role per route group*, as M-001 built it (EXE5, TC-018). A new role is one CHECK value, one layout and one seed account.
  - *The frozen admin IA stays intact.* A scoped admin view would have to hide rail items, which changes the frozen four-item rail. `/processor` uses the same rail component with one item.
  - *Data rules already use the org.* The "only the current holder may record a step" trigger (TSK-26.3) works on the processor org whatever the role is called.
- **Shell.** The admin rail component with one item (**Batches**) and the signed-in person at the foot. On phones there is no floating tab bar, because there is only one destination. The layout is list → detail, as for admin.
- **Rejected.** A scoped admin view: the admin guards would need an org-type filter, the leak risk is above, and the frozen rail would change. A processor screen inside the buyer surface: a buyer and a processor are different organisations with different duties, and a buyer must not be able to record processing.

### 28.3 Grade scale
The buyer picks a **label**. The app stores and signs the **number**. The contract keeps the number as a `uint8` and compares it as `grade ≥ minGrade`.

| Label | Grade (0–100) |
|---|---|
| Excellent | 90 |
| Very good | 80 |
| Good | 70 |
| Fair | 60 |
| Low | 40 |

- The buyer chooses the agreement's minimum grade from the same five labels, so the minimum and the grade always compare cleanly.
- Grades always display as *label · number*, for example "Very good · 80", and in terms as "Good · 70 of 100".
- The server refuses any value that is not one of the five numbers, and anything above 100. A `uint8` would allow 255.
- The numbers leave room for a finer scale later (for example a cupping score) without migrating the contract.
- **Rejected:**
  - free numeric entry, which grades the same coffee inconsistently and gives false precision;
  - the SCA cupping score, which needs roasted samples at delivery;
  - letter grades, which are easily confused with Indian coffee grade names such as "Plantation A" that describe bean size, not quality.

### 28.4 IA additions
- **Buyer.**
  - The buyer surface gains the existing rail component with two items: **Batches** (the default, unchanged) and **Agreements**.
  - Agreements → agreement detail. The detail carries fund, grade, refund and the read-only settlement result, depending on the agreement's status.
  - New agreement is reached from the Agreements list.
  - On phones the rail is the floating glass tab bar with two items.
  - The M-001 paths Batches → Batch detail → Certificate are unchanged.
- **FPO admin.**
  - No new rail item: the four-item rail is frozen.
  - Agreements live under **Batches**: rail current = Batches.
  - `/admin/agreements` is linked from the Batches list header ("Agreements with buyers").
  - A batch delivered under an agreement links to its agreement from the batch detail.
  - `/admin/agreements/[id]` holds the settlement panel. TSK-25.8 should add `/admin/agreements/page.tsx` beside the planned `[id]` page; it is within TKT-25's owned glob.
- **Processor.** `/processor` (batches the processor org holds) → `/processor/batches/[batchId]` (record a step, then hand on). See §28.2.
- **Certificate.**
  - One journey item is added between *Batched* and *Handed to buyer*.
  - The page gains no new section. It reuses the existing journey component (`.tl` / `.t-dot`), so this is a content change, not a freeze change.
  - The certificate derives the step from the proof feed only (TP16).
  - The public page states no agreement, grade or payment: commercial terms are private. Settlement entries still count among the records the browser checks.

### 28.5 Components used (existing only)
| Need | Component (source) |
|---|---|
| Move between sections | Rail / floating tab bar (`admin.html` `.rail`); the buyer has 2 items, the processor 1 (hidden on phones) |
| Lists of agreements and batches | Frosted list rows `.q-item` with the bubble, ID, kg, date line and a status line with a mark (`admin.html` queue) |
| Status | Verdict chip `.vchip` `ok` / `check`. A neutral chip for *Not funded yet*, *Funded* and *Refunded* uses `--surface-2` and `--ink` with the dashed `mk-na` mark (existing tokens and mark). |
| Agreement terms, delivered batch | Frosted card (`.glass.card`) with definition rows that use the `.chk` row rhythm (hairline, 12 px padding, 152 px label column at ≥ 720 px container width) |
| Settlement conditions; mass balance | Check rows `.chk` + `.c-stat` + `.c-name` (+ `<code>` key) + `.c-ev` evidence (`admin.html` "All 12 checks"): *Met* = `mk-ok` / `--ok-ink`; *Not met* and *Flagged* = `mk-check` / `--check-ink`, with the row tinted as `.chk.check` |
| Fund, grade, refund, hand on | Decide panel `.decide` with `.dec-note` (seal icon) and one primary pill (`admin.html` reason panel) |
| Released / not released / handed on | Outcome card `.outcome` with a chip. Released uses the `.decide` green wash, not released the `.state-card.err` amber wash (both existing values). |
| Form fields | The `.decide textarea` recipe (16 px radius, 1.5 px border, dark fill, 17 px) applied to `input` and `select`. Option rows use the `.menu-list` row recipe (52 px, 18 px radius, selected = the `aria-current` style) around a native radio. |
| Empty, error, loading | `.state-card` (+ cherry), `.state-card.err` + amber "Try again" pill, `.sk` skeletons, `.load-note` (`admin.html`) |
| Certificate step | Journey `.journey` / `.tl` / `.t-dot` / `.t-step` / `.t-when` / `.t-where` and `.unconfirmed` (`verify.html`, verbatim). A flagged dot uses `--check-tint` / `--check` with `mk-check` inside and the `.st-ic` glow value. |

### 28.6 States
Every data view implements all five states. *Working* here means an action in progress. In §18, "Working" names the populated view, which this table calls *Data*. All states are reachable in dev with `?state=` (technical-plan §11).

| View | Loading | Empty | Error | Working (action running) | Data |
|---|---|---|---|---|---|
| Buyer agreement list | "Loading your agreements…" + row skeletons | "No agreements yet." + what an agreement is + **New agreement** | "Couldn't load your agreements. Nothing was changed." + Try again | detail shows "Hosahalli FPO is settling this agreement…" | rows with status chips; detail = terms + latest result + conditions |
| New agreement | form skeleton | "No FPO to agree with yet." + what to do | inline: "Couldn't create the agreement. Nothing was saved. What you typed is still here." + Try again | fields disabled; pill "Creating the agreement…" | the form |
| Fund (and refund) | detail skeleton | "There's no agreement AG-0009 for your account." (also for other organisations' IDs: a 404, not a 403) | inline: "Couldn't fund the agreement. The ledger didn't answer, so nothing moved. Your balance is unchanged." | pill "Moving ₹2,40,000.00 into escrow…" | terms + fund panel (balance before → after, three conditions, refund date); after the deadline, the refund panel |
| Grade a delivered batch | detail skeleton | "No batch delivered yet. When Hosahalli FPO delivers a batch under this agreement, you grade it here." | inline: "Couldn't save the grade. Nothing was signed. Your choice is still selected." | options disabled; pill "Signing the grade…" | delivered batch card + five options + below-minimum note |
| Admin agreement + settlement | list + detail skeletons | "No agreements yet. An agreement appears here when a buyer sets one up with your FPO." | "Couldn't load the agreements. Nothing was changed." + Try again | "Settling: sending the three conditions to the ledger…"; pill disabled "Settling…" | ready (conditions + **Settle**) · released · not released |
| Processor batches + step | list + detail skeletons | "No batches with you right now. A batch appears here when an FPO hands it to you." | "Couldn't load your batches. Nothing was changed." + Try again | fields disabled; pill "Recording the step…" | form · within range · flagged · handed on |
| Certificate journey | proof "Checking 7 of 16 records…" + journey skeleton | batch with no processing step: the M-001 journey, unchanged | does not match: the existing mismatch treatment (no green, dot icons hidden, `.unconfirmed` note) | — (no actions on the public page) | the step within range, or flagged |

### 28.7 Copy
- **Plain words.** Agreement, fund, escrow, delivered, grade, released, not released, take the money back, hand on, flagged. Avoid: oracle, attestation, bitmask, uint8, settlement transaction, mass-balance violation.
- **Never accusation words.** Not fraud, fake, suspicious, cheat, tampered, violation, breach, penalty, failed, rejected or defaulted, for a condition, a step or a party. A condition is *Met* or *Not met*. A processing step is *Within range* or *Flagged*: "Nothing is refused. The step is recorded, and the flag shows on the batch's certificate."
- **Settlement released** (`--ok`): "Payment released · ₹1,50,000.00 (mock INR) · Paid from escrow to Hosahalli FPO on 30 Sep 2026, 4:12 pm. All three conditions were met." It also shows the ledger line (chain, block, tx).
- **Settlement not released** (`--check`): it always names each condition that was not met, with value and threshold. Example: "2 conditions are not met: delivered quantity (598.5 kg of 600.0 kg) and Verified pickings (13 of 14)." It also says where the money is and what can still happen: "The ₹1,50,000.00 (mock INR) stays in escrow. A later delivery under this agreement can still settle it until 31 Dec 2026."
- **Condition rows (value vs threshold).**
  - "**598.5 kg** delivered · at least 600.0 kg agreed (1.5 kg short)"
  - "Graded **Very good · 80** · minimum Good · 70"
  - "**13 of 14** pickings Verified · all must be Verified. One picking (Farm F-0231, 24 Sep) still Needs a check."

  The wording follows TSK-25.6 `reasons` (`Delivered 598.5 kg of 600.0 kg agreed`).
- **Trust statement** (always under the conditions): "Delivered kg and “every picking Verified” are stated by the Udgam server, the only account allowed to settle. The grade is signed by the server on behalf of the buyer's account. The contract does the arithmetic." This is TKT-25's honest-trust wording; signatures follow TP15 ("signed by the server on behalf of your account").
- **Mass balance.** The evidence follows TSK-26.2: "Output 420.0 kg is 70.0% of input 600.0 kg (expected 75–85% for hulling parchment)." When output exceeds input, the sentence says "a gain in weight" (EVAL-102). Pulping and drying show "placeholder range, to be confirmed" until the owner confirms the bands (TSK-26.1).
- **Money.** Indian digit grouping with paise ("₹1,50,000.00"). Every amount carries "mock INR" and, where space allows, "not real money".
- **Statuses.** Buyer: *Not funded yet* · *Funded · waiting for delivery* · *Needs your grade* · *Not released yet* · *Payment released* · *Deadline passed · you can take it back* · *Refunded*. Admin: *Ready to settle* · *Not released* · *Payment released* · *Buyer hasn't funded it yet*. Processor: *Ready for a processing step* · *Within range* · *Flagged* · *Handed on to Buyer B-07*.

### 28.8 Responsive and accessibility (measured on the mockup)
- **Responsive.** Same breakpoints as admin (§16): rail + list + detail at ≥ 1100 px, list → detail with **Back** below that, and a floating tab bar below 700 px (none for the processor).
- **Measured.** 167 renders of `contract.html` in Playwright Chromium (reduced motion) were checked:
  - 41 at 1440 px and 63 each at 768 and 375 px;
  - every screen, variant and state;
  - at the two narrow widths, also the list view behind each full-screen detail.

  None has horizontal scroll (`scrollWidth ≤ clientWidth`). `@axe-core/playwright` reports 0 violations of any impact. Screenshots and per-render results are in the session scratchpad (`qa/TKT-23/`).
- **Implementation notes kept from the mockup.**
  - When the detail is the whole screen (< 1100 px), the list's h1 is hidden. The detail repeats it as a visually hidden h1 so that every view has one h1 and the heading order holds.
  - The detail column scrolls on its own at ≥ 1100 px and is focusable (`tabindex="0"`) so that keyboard users can scroll it.
  - Grade and process choices are native radios inside 52 px rows. Fields are 56 px. Pills are ≥ 56 px.
  - Every status pairs a word with a mark shape; colour is never the only signal.
  - Loading shows skeletons, with a `.load-note` line naming what is loading, as in `admin.html`. A spinner is never the whole loading state. An action in progress shows its own words on the disabled pill.

### 28.9 Open items for the owner (not blocking TKT-25/26)
1. Pulping and drying bands are placeholders (TSK-26.1). The UI says so until they are confirmed.
2. The processor's input kg is what the processor weighs. It is not compared with the batch's recorded cherry kg, because the product stage differs (cherry vs parchment). Only output against input is checked.
3. The public certificate shows no agreement or payment (§28.4). A visible "Paid under agreement" step would be a later design change.
4. An agreement can receive more than one delivered batch. The settle action names the batch, and with several candidates the admin picks one from a select in the settlement panel (not mocked: one batch in the demo data).
