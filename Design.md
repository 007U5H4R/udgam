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
