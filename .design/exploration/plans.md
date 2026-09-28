# Stage 4 direction plans — Udgam (DESIGN PROTOTYPE — NOT PRODUCTION)

## Shared brief
- **Product:** Udgam capture app (mobile PWA) + public certificate page. Admin/buyer desktop surfaces follow the chosen direction in `final/`.
- **User:** coffee farmers and FPO field agents in Kodagu. Low-to-moderate phone literacy, outdoors in bright sun, one hand, mid-range Android (360 px wide common), Kannada-ready. Owner direction: "mostly used by farmers — simple but not ordinary, very clean and beautiful."
- **Primary task:** stand in the plot → 1–3 photos → enter kg of cherries → send → understand the verdict.
- **Density:** low (capture), medium (certificate). **Trust sensitivity:** high (money, certification, fraud checks). **Emotional target:** pride and calm assurance — "my farm, recognised", never "you are being policed".
- **Constraints:** light mode for sunlight; body text ≥ 7:1 where possible; primary targets ≥ 56 px, all targets ≥ 48 px; primary actions in thumb zone; icon + word, never icon alone; Kannada strings ~30–40 % longer; works at 320 px; no blockchain vocabulary in farmer UI ("recorded", "sealed", "checked").
- **Anti-direction (all):** crypto/Web3 look (dark mode, neon, hexagons, chain-link icons); generic agritech SaaS (leaf logo + green gradient + KPI cards); stock photos of smiling farmers; gamification/streaks; fake "AI thinking"; cream + terracotta template palette by reflex; card-everything.
- **Screens (each option):** 1 Home · 2 Capture · 3 Weight + review · 4 Checking (real check names only) · 5 Verdict: verified · 6 Verdict: needs a check (cloud over satellite) · 7 Error: couldn't send, saved on phone. Plus `verify.html` public certificate (mobile + desktop).
- **Eval constraints:** EVAL-086 no horizontal scroll and primary action never clipped at mobile widths. EVAL-087: on the mobile certificate the verification result is visible **without scrolling past the map** — the proof result sits above any map. EVAL-088: all four states reachable with recovery controls.
- **Verdict labels (farmer-facing):** Verified · Needs a check · Not accepted. System states stay Verified / Needs Review / Rejected. "Not accepted" always names the reason and blames no one.

## Research-driven patterns (Mobbin, 20 searches, 2026-09-28) — apply in every option
- **No custom viewfinder.** Solution-PRD F4 uses the phone's native camera (file input with capture) so EXIF survives. Our screens are the *slot screen before* the camera and the *review screen after* it.
- **Labelled photo slots with an example picture each:** "The branch", "Basket on the scale", "The day's pile". Counter "1 of 3". At least 1 photo required to continue (Starling Front/Back tiles, Cleo "1 of 10", Grailed example angles).
- **Review after capture:** photo large + a short "Check:" list (in focus · cherries visible · not too dark) + primary "Use this photo", secondary "Take again" (Starling).
- **Weight:** very large centred number, custom full-width keypad with a decimal key, fixed "kg" suffix, the value repeated in the button ("Send 42.5 kg") (Cash App, Noom). A recognition hint from the farmer's own history: "Your last pickings: 38–51 kg" — never a fraud threshold. No ruler or wheel pickers.
- **Home:** one full-width record action with camera icon + word; plot name; last 3 entries with verdict marks (Grab Driver, DoorDash "Current task"). No dashboard numbers.
- **Verdict template shared by all three verdicts:** mark + colour + verdict word, then up to 3 evidence lines each with its own icon, then one button (Uber/Starling). "Needs a check" says who checks and when — ASSUMPTION: "The office usually checks within 1 working day" — and that nothing is needed from the farmer (DoorDash). "Not accepted" names the reason and what to do next, structured like Monese's location failure.
- **Language:** first-run choice as two big buttons "ಕನ್ನಡ / Kannada" and "English" (Discord/Tinder own-script labels). Header shows a small language switch.
- **Certificate:** "Verified on this device" result at the top (also required by EVAL-087), then a dot timeline Harvested → Checked → Batched → Handed to buyer with date + place per step (Bolt/IKEA), then an origin table (Region · Variety · Farms · Harvest window · Quantity) in the Assembly Coffee style. No elevation (not in the data model). Keep the timeline to 4 steps.
- **Avoid:** pending screens with no reason/time/next step; rejection after submit for things checkable earlier; long language lists; raw coordinates.

---

## A · Estate Record Book
- **Hypothesis:** Farmers and FPO staff already keep paper picking books. An app that feels like a trustworthy, dated record book they own lowers novelty and raises pride; the verdict is a seal pressed on the entry.
- **Narrative:** Today → write the entry → it is sealed into your book.
- **Tokens (OKLCH):** paper `0.975 0.010 85` (bg) · ink `0.24 0.035 262` (text, blue-black) · rule `0.86 0.018 85` (hairlines) · cherry `0.50 0.170 27` (primary action) · leaf `0.46 0.110 150` (verified) · turmeric `0.80 0.140 82` (needs a check, dark text on it).
- **Type:** Noto Serif (display, dates, kg numerals) + Noto Serif Kannada; Noto Sans + Noto Sans Kannada (body, labels).
- **Boldness spent on:** the circular seal on verdict screens and entries.
- **Surfaces:** flat paper, hairline rules; entries are ruled lines, not cards. Elevation only for the bottom action bar.
- **Motion:** one moment — seal "presses" onto the entry (scale 1.08→1, 180 ms); reduced motion: appears static.
- **Wireframe (mobile):**
```
[Udgam        ಕನ್ನಡ]
Sunday, 28 September
Plot 2 · Hosahalli
┌──────────────────────┐
│  Record today's picking │  ← cherry, 64px
└──────────────────────┘
Your book ───────────────
27 Sep  42 kg   (seal ✓)
25 Sep  38 kg   (seal ✓)
22 Sep  51 kg   (seal ?)
```
- **Certificate:** an extract from the record book — serif title, ruled table of harvest entries with seals, custody lines, "Verified in your browser" seal.
- **Anti-direction:** not a scrapbook/vintage pastiche; no fake paper textures or torn edges; no script fonts.

## B · Your Plot, Proven
- **Hypothesis:** The most convincing and understandable evidence for a farmer is spatial — seeing their own plot outline with their dot inside it. Put the plot at the centre of every screen.
- **Narrative:** This is your plot → you are inside it → the photo is proven to be from here.
- **Tokens (OKLCH):** mist `0.975 0.006 150` (bg) · canopy `0.30 0.060 155` (text, headers) · fence `0.56 0.130 45` (laterite plot boundary, dashed) · you `0.55 0.160 250` (location dot) · leaf `0.50 0.120 150` (primary action + verified) · amber `0.78 0.150 75` (needs a check) · cherry `0.52 0.180 27` (not accepted).
- **Type:** Anek Latin + Anek Kannada (Ek Type; same family both scripts, semi-condensed, technical-friendly).
- **Boldness spent on:** the live plot map (illustrated from the GeoJSON polygon, contour texture) — the one contained object on each screen.
- **Surfaces:** map panel contained with 16 px radius; everything else flat.
- **Motion:** one moment — the location dot settles inside the fence and the fence line turns solid (240 ms); reduced motion: static.
- **Wireframe (mobile):**
```
[Udgam            ಕನ್ನಡ]
┌──────────────────────┐
│   ╭╌╌╌╌╌╌╌╮  plot map  │
│   ╎   ●   ╎  you: inside│
│   ╰╌╌╌╌╌╌╌╯             │
└──────────────────────┘
Plot 2 · 1.8 ha · Arabica
Last picked 27 Sep · 42 kg
[ Record a picking ]  ← leaf, 60px
```
- **Certificate:** map-led — all plots of the batch on one map, custody as a vertical timeline beside/below it.
- **Anti-direction:** not a GIS tool; no layer toggles, coordinates or scale bars for farmers; no satellite photo clutter on the farmer side.

## C · One Thing at a Time
- **Hypothesis:** For first-time or low-literacy smartphone users, one question per screen, a large pictogram, a "hear this" button and bilingual labels remove nearly all reading load; the app speaks like the FPO field officer would.
- **Narrative:** A short conversation: "Which plot?" → "Take a photo" → "How many kilos?" → "Sent. Here's what we found."
- **Tokens (OKLCH):** day `0.985 0.008 95` (bg) · night `0.20 0.020 60` (text) · cherry `0.52 0.180 27` (primary action) · leaf `0.52 0.130 150` (verified field) · turmeric `0.82 0.150 85` (needs a check field) · clay `0.55 0.150 35` (not accepted field).
- **Type:** Baloo Tamma 2 (Ek Type; Kannada + Latin in one family), heavy weights; Kannada label on top, English beneath.
- **Boldness spent on:** full-bleed verdict screens — one colour field, one symbol, one sentence.
- **Surfaces:** no containers; giant pictograms + stacked bilingual labels; bottom-anchored full-width buttons.
- **Motion:** one moment — screens slide forward/back to show position in the conversation; reduced motion: crossfade.
- **Wireframe (mobile):**
```
● ● ○ ○             (step 2 of 4)
      [ camera pictogram ]
ಫೋಟೋ ತೆಗೆಯಿರಿ
Take a photo of the picking
(🔈 Hear this)
┌──────────────────────┐
│  ಫೋಟೋ · Take photo     │ ← cherry, 64px
└──────────────────────┘
```
- **Certificate:** plain-language story — "This coffee came from 3 farms in Kodagu" as the headline, then 4 illustrated steps, then the in-browser proof.
- **Anti-direction:** not childish; no mascots, cartoons or emoji; pictograms are simple line/solid symbols.

## Plan review against the brief
- A risked the "cream + terracotta" template: fixed by blue-black ink (not brown), cherry (not terracotta) and a cool rule colour; the paper tone is tied to the real picking-book reference, not trend.
- B risked "map as decoration": the map carries the core evidence (inside/outside the fence) and gates the camera, so it is functional.
- C risked "childish": pictograms are restrained symbols and the voice is an officer's, not a cartoon's.
- Distinctness: A↔B differ on narrative, hero, imagery, IA; A↔C on density, interaction, type, composition; B↔C on hero, imagery, interaction, density. All pairs ≥ 3.

---

## D · Opal-inspired — OWNER-SELECTED 2026-09-28 (supersedes A/B/C)
Owner rejected A, B and C and asked for the UI/UX of the **Opal iOS app** (Mobbin reference). Reference screenshots: `.design/exploration/ref/opal-*.jpg` (home, promise, rules-sheet, timer, question, progress, red-sheet, bignumber). **Adapt the design language; do not copy Opal's brand, logo, gem or copy.**

**What Opal's language is (observed):** near-black ground with a soft green-teal ambient glow bleeding from the top; frosted dark rounded cards (≈28 px radius) with hairline light borders; large bold white type, often centred, with ONE key word or number lit in a mint→lime gradient; full-width pill buttons that are dark-translucent with an iridescent green→lavender glow along the bottom edge; floating glass pill tab bar at the bottom; dark pill option rows; a thin mint→cyan progress bar; tinted bottom sheets for serious decisions (red tint for "leave early"); a glowing iridescent 3D object as brand mascot floating over the glow.

**Udgam translation (all builders use exactly these):**
- Brand object: a **glowing coffee cherry** (glossy deep-red sphere with iridescent mint/lavender rim light, a small stem and leaf, floating over a soft green glow; a faint reflection "pedestal" glow beneath). Build it with layered CSS radial gradients and/or SVG gradients so it reads as a rendered object, NOT a pile of flat primitive shapes. Tint variants: verified = green-mint rim glow; needs a check = amber rim glow; not accepted = no cherry, red-tinted sheet.
- Tokens (hex for exactness; may be written as oklch equivalents):
  - `--bg #0A0E0C` (near-black, green-biased) · ambient glow: `radial-gradient(120% 60% at 50% -10%, rgba(64,150,110,.55), rgba(20,60,45,.25) 45%, transparent 70%)`
  - `--surface rgba(255,255,255,.06)` + `backdrop-filter: blur(20px)` · `--surface-2 rgba(255,255,255,.10)` · `--hairline rgba(255,255,255,.12)`
  - `--ink #F3F6F4` · `--ink-2 rgba(243,246,244,.74)` · `--ink-3 rgba(243,246,244,.58)` (ink-3 only ≥ 15 px; all text ≥ 4.5:1 on its surface, body ≥ 7:1)
  - `--grad-text linear-gradient(90deg,#B9F5D2 0%,#7FE3C1 45%,#D8F58C 100%)` (the one lit word/number per screen)
  - `--ok #7FE3A6` · `--check #F2B84B` · `--bad #EF6A5B` · `--cherry #C8322B`
  - Pill button: bg `rgba(255,255,255,.08)`, border `rgba(255,255,255,.14)`, bottom glow `radial-gradient(70% 120% at 50% 130%, rgba(127,227,166,.65), rgba(170,150,255,.35) 45%, transparent 72%)`, height 60 px, radius 999 px, white 18 px semibold label. Destructive/serious variant: same with red glow.
  - Radii: cards 28 px, rows 22 px, pills 999 px. Shadows only for floating tab bar and sheets.
- Type: **Figtree** (Google Fonts, 400/500/600/700/800) for all Latin; **Noto Sans Kannada** for Kannada. Headlines 30–34 px/1.15 bold, centred on moment screens, left-aligned on working screens. Body 17 px/1.5. Numbers use `font-variant-numeric: tabular-nums`.
- Navigation: floating glass pill tab bar with 3 items: **Home · Pickings · Help** (icon + word). Hidden during the record flow (photo → weight → checking → verdict), shown on Home and the pickings list.
- Hero card on Home = the **plot card**: the plot outline (irregular polygon) drawn as a glowing mint line on a dark frosted card with subtle contour lines, the "You" dot with a soft pulse ring, and the sentence "You're inside **Plot 2**" (Plot 2 as the gradient word).
- Motion: one moment — on Verified, the cherry rises 12 px and its rim glow blooms (400 ms, ease-out); progress bar fills as real checks finish. `prefers-reduced-motion`: no movement, glow static.
- Keep from the shared brief and research: every screen/state list, verdict labels, copy rules, EVAL constraints (proof first on mobile certificate, no horizontal scroll, primary action never clipped at 320×568), targets ≥ 48 px (primary 60 px), icon + word, Kannada switch, no fake metrics, no fake processing, pseudonymous producer IDs on public pages.
- **Known risk (record in Design.md §22):** dark UI in direct sunlight — mitigated by near-white text at ≥ 7:1 for body, no grey-on-black secondary text under 4.5:1; to be field-tested at midday.
- **Anti-slop justification (Design.md §24):** glass, glow and gradients are used because the owner explicitly selected Opal's language; each is confined to its Opal role (glow = ambient ground + primary button + brand object; glass = cards, tab bar, sheets; gradient text = one lit word per screen).
