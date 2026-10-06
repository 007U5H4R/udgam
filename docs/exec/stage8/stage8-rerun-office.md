# Stage 8 re-run: surface `office` (admin, buyer, processor)

Reviewer: fresh design reviewer. Branch `build/stage7` @ 9359ed08c5e4148f2c81eccf5c1b44fda704a9d5. Clone `s8r-office`, `pnpm build` + `next start -p 4220` (`E2E=1`, `DEMO_MODE=1`, fixture satellite provider, fresh data dir). Seeded with `pnpm seed`, `seed-accounts` (demo password), and the e2e seeds `seed-agreements` (7 statuses), `seed-review`, `seed-batches`, `seed-processing` (open batch and one handed to ORG-PROC-C03). Server killed by PID; `.next` and data dir deleted.

Evidence: `scratchpad/stage8r/office/` (screenshots `a-*`, `b-*`, `p-*`, `nf-*`, `replay-review-*`, `decbar-*`, `settle-*`, `transfer-err-*`, `buyer-bottom-*`, `bn-*`, `320-/zoom200-/motion-*`; mockups in `mock/`; `*.mjs` are the scripts). Machine results: axe (wcag2a/aa, 21aa, 22aa, best-practice) plus target sizes, horizontal scroll, h1 count and min font on 252 renders at 1440/768/375 (admin, buyer, processor, every list/detail and `?state=loading|empty|error`), plus 320 px, 640x400 CSS px (the 200 % zoom equivalent) and a default-motion run (1440) on 21 routes each. All of those: **0 horizontal scroll, 0 axe violations** (the earlier `page-has-heading-one`, `landmark-unique`, `landmark-one-main` and `region` hits are gone). Min font 13 px everywhere.

## 1. Original findings

| DES | Status | Evidence |
|---|---|---|
| DES-100 demo result mark unsized | VERIFIED-FIXED | After "Submit old photos sent again" (1440) and "Submit cherry from cleared forest" (375): the mark is 22 x 22 px, chip reads "Not accepted", evidence line and "Open its review" sit directly under it. `demo-after-1440.png`, `demo2-after-375.png`; axe clean |
| DES-101 buyer status after grading (QA-M002-1) | VERIFIED-FIXED | List row "Graded · waiting for the FPO to settle"; detail chip "Waiting for the FPO to settle" with the Delivered batch card and a read-only "Your grade: You graded it Very good · 80. E2E FPO 76NZ settles it next…". Chip fits at 320 (no scroll). Design.md §28.7 now holds the word (line 346). `b-ag-ready-1440.png`, `txt.mjs` output |
| DES-102 "used before" photo marker | VERIFIED-FIXED | Replay review: 3 `[data-used-before]` tiles with red outline, mark and "Same photo as the 2 Oct picking" at 1440 (131x211), 768 and 375 (94x207); axe clean. `replay-review-1440.png`, `replay-review-375-view.png` |
| DES-103 no h1 on full-screen details | VERIFIED-FIXED | axe `page-has-heading-one` clean on every detail, plot new, batch new, batch detail, buyer batch and agreement detail and their loading skeletons at 768 and 375. `admin1.log`, `sweep-buyerE2E.log` |
| DES-104 default white 404 | VERIFIED-FIXED | Status 404 on 22 unknown/foreign IDs and unknown routes (admin, buyer, processor, signed out) at 1440 and 375: dark ground `rgb(10,14,12)`, h1 "We can't find that page.", styled card with a back link, rail/tab bar kept in the shell, axe clean. New wayfinding nit is DES-115. `nf-*.png`, `nf.mjs` run |
| DES-105 Sign out on every screen | VERIFIED-FIXED | Exactly one visible Sign out on 11 admin, 6 buyer and 2 processor routes at 1440, 768 and 375 (`so.mjs`): rail foot at 700 px and up (83 x 57), a 56 px pill at the end of the screen on phones, focus ring 3 px `#D8F58C`. Not reachable from two phone details: see DES-117 |
| DES-105 follow-up: buyer full-screen detail Sign out | VERIFIED-FIXED | At 375 and 768 the buyer batch detail, agreement detail (graded, to-grade, created) and new agreement end with a 56 px Sign out (`DetailSignOut`), clear of any sticky bar and with nothing below it; at 1440 the in-detail copy is hidden (`display:none`) and the list column's is the only one. Keyboard: reached in 3 tab stops with the 3 px focus ring. `buyer-bottom-grade-375.png`, `bs.mjs`, `kb.mjs` |
| DES-106 map controls | VERIFIED-FIXED | Zoom +/- are 48 x 48 px, attribution is 13 px type (link 56 x 15, a text credit with more than 24 px clearance). `m1.mjs` at all 3 widths on plot detail and Add a plot |
| DES-107 batch builder at 50 pickings | VERIFIED-FIXED | 23 pickings: plot filter select, "Select all Arabica (14)" and "Select all Robusta (9)", which switch to "Clear Arabica"; "Showing 2 of 23 pickings" after filtering; a hidden choice stays selected; the Create bar reads "Create batch · 14 pickings · 3525.5 kg"; the other crop is disabled with "Another crop: a batch holds one crop."; rows are 78 px at 1440 (was 96). `bn-selected-1440.png`, `bn-filtered-375.png` |
| DES-108 duplicate landmark names | VERIFIED-FIXED | Regions read "Hosahalli field agent Phones", "Field agent, Chikkamagaluru round Plots this agent records", etc.; axe `landmark-unique` clean |
| DES-109 transfer pill silently disabled | VERIFIED-FIXED | The pill is enabled; submit with nothing chosen shows "Choose a buyer or processor from the list." (amber, `aria-invalid`), focus moves to the select, nothing is recorded, at 1440, 768 and 375. `transfer-err-375.png` |
| DES-110 page titles | VERIFIED-FIXED | One pattern: "Review · Udgam", "Batch B-TDVP0SYR · Udgam", "Agreement AG-RJ2YDSCY · Udgam", "Plot PL-… · Udgam", "Review VR-… · Udgam". A nested 404 keeps its route's title (EXE42, accepted) |
| DES-111 card rhythm | VERIFIED-FIXED | Score card to QR card gap is 16 px at 1440. `a-batch-detail-1440.png` |
| DES-112 demo vocabulary | VERIFIED-FIXED | "Should be caught by: Inside the plot (Needs a check)", "(Not accepted)", result chip "Not accepted". `data-verdict` is unchanged (EXE42) |
| DES-113 decision bar wrapping | VERIFIED-FIXED | At 768 "Accept as verified" 230 x 60 and "Not accepted" 230 x 56 are each on one line, with "Check again" beside them. `decbar-768.png` |
| DES-114 settle label | VERIFIED-FIXED | Pill reads "Settle · ₹1,50,000.00" on one line at 1440, 768 and 375 (335 x 60); the hint names the FPO ("…before it pays E2E FPO 76NZ."). `settle-375.png` |

Parked from the original report: none for this surface (EXE40 parks only DES-005, 201, 202, 204 and 219, which are field/public).

## 2. New findings (regressions and gaps found on the re-run)

DES range used: DES-115 to DES-117. No P0, P1 or P2.

| DES | screen/component | related | finding | category | severity | recommendation | evidence |
|---|---|---|---|---|---|---|---|
| DES-115 | Admin not-found for a batch or a plot ID | DES-104, Design.md §18 | The styled 404 on `/admin/batches/B-NOPE0000`, `/admin/plots/PL-NOPE0000` and `/admin/review/VR-NOPE…` says "Back to Review" (`/admin`), and the rail highlights nothing. A person who followed a bad batch link lands in Review, not Batches. The buyer and processor cards and the agreement card go to their own list. | IA / wayfinding | P3 | Give each admin route group its own back label and target ("Back to Batches" for batches, "Back to Plots" for plots). Not frozen. | `nf-admin-_admin_plots_PL_NOPE0000-1440.png`; `nf.mjs`: back link `Back to Review>/admin` on 3 admin routes |
| DES-116 | Admin demo result "Open its review" and the plot attestation "Download certificate (PDF)" | Design.md §17 (targets at least 48 px) | Two standalone text links are below 48 px: "Open its review" is 246 x 26 at 375 and 898 x 27 at 1440, and "Download certificate (PDF)" is 186 x 18. Both have more than 24 px clearance from their neighbours (WCAG 2.5.8 passes), both are secondary on desktop-first admin screens, and the first is also reachable from the queue. Neither was in the first report's measurements (the demo link was 27 px there and was not logged; the PDF link is on a plot that had no attestation). | accessibility | P3 | Give both links the pill/ghost-button treatment or `min-height: 48px; display: inline-flex; align-items: center`. Not frozen. | `m4.mjs` (320, 640, 1440): `a[Open its review] 246x26`, `a[Download certificate (PDF)] 186x18`; `dl.mjs`: nearest target 53 px away; `dl-link-1440.png` |
| DES-117 | Admin review detail and processor batch detail at 375 | DES-105 follow-up, EXE42 deviation 5 | The two full-screen details that still carry no Sign out are the admin review detail (hidden so the sticky decision bar is clear) and the processor batch detail (no copy at the end of the screen). Sign out is one tap away through "Back to list" (or "Back to batches"), so no task is blocked. The buyer details were fixed in the follow-up. | IA / discoverability | P3 | Add the end-of-screen Sign out pill to the processor detail, as on the admin batch detail. For the review detail, put it below the "All 12 checks" card or leave it as accepted. Not frozen. | `so.mjs`: 375 `/admin/review/VR-BR3G3CPT40ZQ` and `/processor/batches/B-F2C6TPPX` visible 0; `p-detail-375.png` |

Also noted, not logged as findings (consistent with EXE42 or by design):
- With a `udgam_lang=kn` cookie the English-only office pages (`/admin`, `/buyer`, `/processor`) render `<html lang="kn">` with English text (observed on `/admin`, `/admin/batches`, `/admin/demo` at 375). `documentLang` (DES-221) covers only `/verify`. The cookie is only set from the field app, the office has no language control, and the global not-found is intentionally localised, so I rate it P3 and mention it here rather than numbering it: extend `ENGLISH_ONLY` to `/admin`, `/buyer`, `/processor` when the office stays English-only.
- A nested not-found keeps its route's title ("Batch B-NOPE0000 · Udgam"): EXE42, accepted.
- "Print QR" opens its own small window (light, ink on white); if a popup blocker refuses it, the whole dark page prints. Pre-existing, and the office has no print contract.
- Dark glass, glow and radii, the `<code>` check keys, the hard-fail score pointer: as in the first report, deliberately not logged.

Counts of new findings: P0 0, P1 0, P2 0, P3 3.

## 3. Checks beyond the finding list

- **Layout 375 / 768 / 1440 / 320:** no horizontal scroll on any route; Sign out and the floating tab bar do not overlap at the end of short pages (`bottom_admin_*-375.png`); the sticky Create-batch bar sits above the tab bar at 375.
- **Four states:** loading, empty, error and populated verified on queue, plots, batches, phones, agreements (admin and buyer), buyer batches, processor list and detail, buyer agreement detail, new agreement and the demo page. Not-found is now a styled state (DES-104). Working and action-error states were not re-driven (no fix touched them; the e2e server has no chain).
- **Kannada:** office surfaces are English-only by design (no Kannada glyphs rendered under a `kn` cookie); see the `lang` note above.
- **Reduced motion:** all runs used `reduce`, plus a 1440 default-motion run on 21 routes with no horizontal scroll, no axe violation and no layout change.
- **Print:** office screens have no print contract; "Print QR" (own window) is unchanged.
- **200 % text:** the 640 x 400 CSS px run (the WCAG 1.4.4 / 1.4.10 equivalent) shows no scroll and no axe violation on 21 routes: BLOCKED in the first report, now PASS.
- **Mockup fidelity:** `admin.html` and `contract.html` re-rendered at 1440, 768 and 375 (`mock/`). The layout, tokens, rail, score card, photo tiles and check rows match; the rail-foot Sign out is a deliberate addition (EXE40) and the Settle label is the accepted EXE42 deviation.
- **Frozen items:** none of the re-run findings touches a Design Freeze item (IA, heroes, visual direction, one primary pill, one motion moment, native scroll, three-cherry brand). No `owner` flags.

## 4. Done-gate table (web-deliverables contract, office surface)

| Gate | Result | Evidence |
|---|---|---|
| 1 Responsive: no horizontal scroll at 375 / 768 / 1440 (and 320, 640x400) | PASS | `hscroll` false on all 252 renders and on 21 routes at each of 320, 640x400 and the default-motion 1440 run |
| 1 Responsive: nav usable | PASS | Rail at 700 px and up, floating tab bar below it, buyer header links, processor one-item rail; Back pill in full-screen details; Sign out reachable on every list and buyer detail (two phone details one tap away, DES-117) |
| 1 Responsive: primary actions reachable | PASS | Decision bar (1440/768/375), Settle bar, Create batch bar and Sign the grade all verified in view |
| 1 Responsive: touch targets | PASS with P3 | Everything is at least 48 px except the Leaflet credit (13 px text link), the inline "certificate" link, "Open its review" and "Download certificate (PDF)" (DES-116, P3) |
| 1 Responsive: readable, not clipped | PASS | Min font 13 px; no clipped text; settle and decision labels on one line |
| 1 Responsive: dialogs/sheets usable | PASS | Not changed since the first report; transfer and field-check panel re-checked at 375 |
| 2 States: Loading | PASS | Skeletons plus a named line on every list and detail, no spinner-only |
| 2 States: Empty | PASS | `?state=empty` on every list and detail |
| 2 States: Error | PASS | "Couldn't load… Nothing was changed." with Try again; not-found is now styled (DES-104) |
| 2 States: Populated | PASS | All seeded agreement statuses, review, batch, processor |
| 2 States: field checks | PASS | Transfer "Choose a buyer or processor from the list." with `aria-invalid` and focus on the select (DES-109 fix) |
| 3 Mockup fidelity | PASS | No material divergence left (DES-100, 101, 102 fixed) |
| 4 Social preview / OG | N/A | Authenticated, private surfaces |
| Accessibility: axe | PASS | 0 violations in all runs (moderate rules included) |
| Accessibility: keyboard and focus | PASS | 3 px `#D8F58C` ring on Sign out (rail and buyer detail) and "Select all"; order follows visual order |
| Accessibility: names, colour-only cues | PASS | Landmarks named per agent; every status is word + mark + colour |
| Accessibility: text at 200 % | PASS | 640 x 400 CSS px run, 21 routes: no scroll, no axe violation |
| Content and copy (D5, forbidden words) | PASS | D5 words on the demo page, graded wording "Graded · waiting for the FPO to settle" |

RE-RUN: CLEAN
