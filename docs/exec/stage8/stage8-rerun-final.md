# Stage 8 FINAL re-run (field, office, public)

Reviewer: fresh, clone `s8f`, port 4320. Branch `build/stage7` @ `f297c1479aa9ca4b9f52ce86978bf299fc5b3ea0`.
Setup: `pnpm build` and `next start -p 4320` (E2E=1, DEMO_MODE=1, fixture provider, throwaway auth secret, fresh `.e2e-data`). Seeds: `pnpm seed` (Kodagu demo), `seed-accounts`, `seed-certificate` (Kodagu Arabica), a Chikkamagaluru Arabica and a Chikkamagaluru Robusta certificate world (`plotShift` from `metadata.int.test.ts`), `seed-agreements`, `seed-review`, `seed-batches`, `seed-processing --to-processor`, and one capture world per field test.
Evidence: `scratchpad/stage8/final/{field,office,public}/` (screenshots, probe scripts, logs). Raw logs: `scratchpad/s8f-field-run.log`, `s8f-field2-run.log`, `s8f-office-des*.log`, `s8f-office-sweep.log`, `s8f-public-sweep.log`.
The server was stopped by PID, and `.next`, `.e2e-data` and test output were deleted. No tracked file was edited. Scratch specs sit untracked in the clone.

## 1. Original to status

| DES | status | fresh evidence |
|---|---|---|
| DES-026 photo error covered by the pinned pills | VERIFIED-FIXED | The error is the first child of the pinned action block, above both pills. At 375 it spans y 579–656 and "Use this photo" starts at 666. At 360 it is 507–584 and the pill is at 594. At 320 it is 347–424 and the pill is at 432. It is in view at all three sizes. `elementFromPoint` at its centre hits the error. Colour `rgb(255,140,126)` with an icon. axe `[]` and no horizontal scroll at 375 and 360. At 320 the only overflow is DES-030, which is unrelated. `field/des026-error-{375,360,320}.png` |
| DES-027 "See all checks" card | VERIFIED-FIXED | Detail pages for Not accepted, Needs a check and Verified/other, at 375, 360 and 320. Gap to the evidence card is 16 px. `.r-why` has border 0 and padding 0. Space above the summary is 13 px and below is 13 px, so no empty band and no stray hairline. Opened and closed states are axe `[]`. `field/des027-detail-*.png` |
| DES-028 reason beside "Yes, send" after a refused key | VERIFIED-FIXED | On an unlikely weight, typing 4, ".", 3 leaves "4." with two lines, the rule line ("Kilos in halves…") and the check line ("4 kg is far from your last pickings (38–51 kg)…"), and the pill "Yes, send 4 kg". A refused key on a normal weight shows the rule alone with "Send 42 kg". At 320 the pill is at 490–550 of 568, so it is still on screen. axe `[]`. `field/des028-refused-{375,360,320}.png`, `des028-alone-*.png` |
| DES-029 stale sign-in assertion | VERIFIED-FIXED | `field-critique`, `sign-in` and `enrol` on `phone` and `phone-small`: 80 passed, 0 failed. Measured: the pill bottom is 725 of 812 at 375, with the certificate hint at 747–792 under it (also 360, 320, 768 and 1440). |
| DES-115 admin not-found back link | VERIFIED-FIXED | `/admin/batches/B-NOPE…` says "Back to Batches" (`/admin/batches`) and the rail marks Batches. `/admin/plots/PL-NOPE…` says "Back to Plots" and the rail marks Plots. `/admin/review/VR-NOPE…` says "Back to Review". Agreement, buyer and processor cards go to their own lists. All are 404, dark ground, 56 px pill (48 px for the agreement card), axe `[]`, no horizontal scroll, at 1440 and 375. `office/nf-*.png` |
| DES-116 two sub-48 px links | VERIFIED-FIXED | "Download certificate (PDF)" is 186×48 at 1440, 768 and 375, with at least 51 px to the nearest target. "Open its review" is 128×48 at 1440 and 768 and 122×48 at 375. Demo result axe `[]` and no overflow. `office/des116-plot-*.png`, `demo-result-*.png` |
| DES-117 Sign out on the two phone details | VERIFIED-FIXED | At 375 the admin review detail (2 queue items) has one visible Sign out, 335×56 at the end of the page, above the decision actions, and it receives the hit-test. The processor batch detail has one, 335×56, and tapping it goes to `/sign-in`. The admin batch detail and the processor list also have one. `office/end-review-375.png`, `end-proc-375.png` |
| DES-118 office `lang` under a Kannada cookie | VERIFIED-FIXED | With `udgam_lang=kn` and signed in, `/admin` (all 9 routes plus the admin not-found), `/buyer` (3 routes) and `/processor` (2 routes) declare `en` at 1440 and 375. The signed-in agent's `/field` and `/field/pickings` declare `kn`. Signed out, `/sign-in` declares `kn` and `/verify/*` declares `en`. |
| DES-202 per-batch link-preview images | VERIFIED-FIXED | See §2. |

Not re-opened: DES-005, DES-201, DES-204 and DES-219 stay PARKED (EXE24, EXE32, EXE28, EXE41/TKT-28). `og:image`, the `og:url` and the print-QR URL carry `http://localhost:3000/...` because `PUBLIC_BASE_URL` is unset here. This is the parked DES-219.

## 2. DES-202 evidence (curl with a `facebookexternalhit` user agent)

| batch | `<title>` / `og:title` | `og:image` | `og:image:alt` | image |
|---|---|---|---|---|
| Kodagu Arabica `B-R78Y3431` | "Kodagu Arabica, verified at origin — Udgam" | `/og/verify-kodagu-arabica.png` | "The Udgam coffee-cherry mark beside the words “Kodagu Arabica, verified at origin”" | 200 `image/png`, 1200×630, 342 456 B; the picture reads "Kodagu Arabica, verified at origin" |
| Chikkamagaluru Arabica `B-BEMXF48R` | "Chikkamagaluru Arabica, verified at origin — Udgam" | `/og/verify-chikkamagaluru-arabica.png` | "…“Chikkamagaluru Arabica, verified at origin”" | 200, 1200×630, 349 331 B; the picture reads "Chikkamagaluru / Arabica, / verified at origin" |
| Chikkamagaluru Robusta `B-1AXQZWM9` | "Chikkamagaluru Robusta, verified at origin — Udgam" | `/og/verify-chikkamagaluru-robusta.png` | "…“Chikkamagaluru Robusta, verified at origin”" | 200, 1200×630, 349 992 B; the picture reads "Chikkamagaluru / Robusta, / verified at origin" |

- `og:image:width` is 1200 and `og:image:height` is 630.
- `twitter:image`, `twitter:image:alt` and `twitter:title` equal their `og:` counterparts. The description names the right district and crop.
- The page `<title>` and h1 match the preview words, and there is no "Kodagu" anywhere on the Chikkamagaluru pages.
- Files: `public/final/public/{kodagu,chik-arabica,chik-robusta}.{html,png}`, under `scratchpad/stage8/final/public/`.

## 3. Regression sweep

Method: Playwright on the production build (field, office and certificate), `@axe-core/playwright` (wcag2a/aa, 21a/aa, 22aa, best-practice), `scrollWidth` against `clientWidth`, and 48 px target measurement.

- **Field at 375, 360 and 320.** Home, Help (Close in view at 727–783, 655–711 and 483–539), Pickings, the record flow (photos, error, review, weight normal, unlikely, refused), detail (3 verdicts, open and closed), verdict (Verified), checking, the offline sheet, and the sign-in (en, error, kn) at 375, 360, 320, 768 and 1440.
  - States on the fix-touched screens: Home loading, empty and error. Pickings loading, empty and error. Detail 404. The record error and unlikely/refused states.
  - Result: axe 0 violations on every page, and no horizontal scroll, except DES-030 (Kannada record photos at 320).
- **Field Kannada.** `/field`, `/field/pickings`, the detail, the record page and `/enrol` declare `kn` under the cookie. The sign-in under kn declares `kn`. No horizontal scroll at 375 and 360. At 320 the only exception is DES-030.
- **Office at 1440, 768 and 375.**
  - Routes: 13 admin routes, 7 buyer routes, 3 processor routes and the FPO agreement route, plus loading, empty and error forced states on 5 admin lists, 2 buyer lists and the processor list.
  - 3 viewports × about 50 pages each. Result: no horizontal scroll, axe 0 violations everywhere, and every target is at least 48 px except the Leaflet credit (13 px text) and the inline "certificate" link on buyer agreement details. Both are known and accepted.
  - Not-found pages: styled, dark and axe-clean in all three roles.
- **Certificate at 375, 768 and 1440.**
  - Pages: Kodagu Arabica, Chikkamagaluru Arabica and Chikkamagaluru Robusta (verified), `?state=loading`, `?state=mismatch`, "could not check yet" (key fetch blocked), wrong `h` (404) and an unknown batch (404).
  - Result: no horizontal scroll, axe 0 violations, and `lang="en"` everywhere (also under the kn cookie).
  - Print emulation at 375 and 1440 for all three batches: white ground, `#111` ink, no nav, the "Certificate QR code" block with the batch URL, and no horizontal scroll. Every check line is expanded.
- **Sign-in.** The pill sits in the lower fifth with the hint under it. axe `[]` in en and kn, with the error showing.

## 4. New findings

Ranges: field DES-030+, office DES-119+, public DES-223+.

| DES | screen/component | related M-/TKT-/TASK- | finding | category | severity | recommendation | evidence |
|---|---|---|---|---|---|---|---|
| DES-030 | Record flow, photos step (`.slots`), Kannada at 320×568 | TKT-10 · TASK-11 (original port of `field.css`, not a fix-wave regression) | `.slots` is `repeat(3, 1fr)`. The Kannada words ("ತಕ್ಕಡಿಯ ಮೇಲಿನ ಬುಟ್ಟಿ", "ದಿನದ ರಾಶಿ") make the third card's min-content wider than its track. The grid reaches x 323 on a 320 px screen: `scrollWidth` 323 against 320, the third card has no right gutter and its right border is 3 px off screen. English is clean at 320, and Kannada is clean at 360 and 375. No pan is possible (`scrollX` stays 0 after `scrollTo(20,0)`, body `overflow: hidden`), and no text is cut. Design.md §16 and §17 promise no horizontal scroll and reflow at 320. | layout / responsive (Kannada) | P3 | Use `grid-template-columns: repeat(3, minmax(0, 1fr))` and let `.s-name` wrap with `overflow-wrap: anywhere`. Not frozen. | `field/kn-record-320.png`; probe `## probe 320 {"sw":[323,320,323], "out":["LI.…slot right=323 w=96 …"]}` and `scrollX 0` |

No new office or public findings. Note, not logged: on the admin review detail at 375 the end-of-page Sign out pill sits directly above "Accept as verified". That is the placement DES-117 suggested. It has the same outline weight as "Not accepted", and signing out loses nothing.

## 5. Done-gate (web-deliverables)

| gate | field | office | public (certificate) |
|---|---|---|---|
| Responsive (375/360/320, 1440/768/375, 375/1440 + print) | PASS with DES-030 (P3) | PASS | PASS |
| No horizontal scroll | PASS with DES-030 (3 px, unscrollable) | PASS | PASS |
| axe | PASS (0) | PASS (0) | PASS (0) |
| Four states on touched screens | PASS | PASS | PASS |
| Targets ≥ 48 px | PASS | PASS (known 13 px Leaflet credit and the inline "certificate" link) | PASS |
| Kannada / `lang` | PASS (`/field`, `/sign-in` = kn) | PASS (`/admin`, `/buyer`, `/processor` = en) | PASS (`/verify` = en) |
| OG / link preview | n/a | n/a | PASS (per-batch title, image and alt agree; 1200×630; 200) |
| Print | n/a | n/a | PASS |

Frozen items: none of the fixes verified here touches a Design Freeze item. DES-202 was changed at the owner's explicit instruction (EXE43). DES-030 would not touch one.

Counts: original DES-026–029, 115–118 and 202 are all VERIFIED-FIXED (9 of 9). New: 0 P0, 0 P1, 0 P2, 1 P3 (DES-030).

RE-RUN: CLEAN
