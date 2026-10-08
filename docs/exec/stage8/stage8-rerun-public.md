# Stage 8 re-run: public surface (DES-200..DES-221)

**Reviewer:** fresh design reviewer, clone `s8r-public`, port 4240, `build/stage7` at `9359ed08c5e4148f2c81eccf5c1b44fda704a9d5`.
**Setup:** `pnpm build`, `next start -p 4240` with `E2E=1`, a fresh `DATA_DIR`, a throwaway auth secret (never printed), `REMOTE_SENSING_PROVIDER=fixture`. Data: `NODE_ENV=development pnpm seed` (Kodagu demo batch `B-88BXPZ95`) plus the original review's batches (plain, no organic, 50-event/6-plot, override, long name, processor ok/flagged/held, held-with-no-step), seeded through `seedCertificateWorld`.
**Tools:** Playwright at 375 / 768 / 1440 (plus 360 and 320), print emulation, forced colours, reduced motion, JS off, a `udgam_lang=kn` cookie, `@axe-core/playwright`, DOM and computed-style measurements, curl-equivalent fetch of the crawler HTML.
**Evidence:** `scratchpad/stage8r/public/` (screenshots and `scripts/probe*.mjs`). Servers stopped by PID; `.next`, data dir and `node_modules` deleted; no tracked file edited.

## Original findings: status

| DES | Status | Evidence |
|---|---|---|
| DES-200 map labels/size | VERIFIED-FIXED | Every plot now has a ring marker with a number badge (1..n), and the farm rows carry the same badge. Demo batch: `#origin-map text` = KODAGU, 1, 2 (was only KODAGU). Big batch: 6 plots, 6 badges, hexagons 27x29 px at 375 and 50x53 at 1440. `map-demo-375.png`, `map-big-375.png`, `demo-1440-full.png`. |
| DES-201 "Handed to buyer" for a processor-held batch | PARKED (EXE40, EXE32) | Still reproduces as accepted: `heldNoStep` journey ends "Handed to buyer · To ORG-PROC-C03". The processor-step cases read correctly ("Hulled · At Processor C-03", flagged step in amber). Signed `toOrgType` is the later fix. |
| DES-202 OG image text and "verified" title | PARKED (EXE40, owner; Design Freeze) | `<title>` and `og:title` still "Kodagu Arabica, verified at origin — Udgam" (also under tamper). Unchanged by design. |
| DES-203 print QR and URL | VERIFIED-FIXED | Print emulation: a "Certificate QR code" block with a QR and the URL text `.../verify/B-JRR89XQ9?h=a9a02eac7292` (plain, 50-event and flagged batches). Light set, `#111` ink, white ground. `print-plain-emul.png`. |
| DES-204 org IDs on journey | PARKED (EXE40, EXE28) | "By ORG-HOSAHALLI / To ORG-BUYER-A" still shown. |
| DES-205 colour-only links | VERIFIED-FIXED | "What this can't prove" and "Udgam public key" computed `text-decoration: underline`; "See all checks" has a chevron and underline. Link colour is now `#B9F5D2` against ink `#F3F6F4`, still colour-close but no longer colour-only. |
| DES-206 no-JS state | VERIFIED-FIXED | JS off: proof card reads "This page checks its records in your browser and needs JavaScript. Nothing here is confirmed until it runs." It does not show with JS on. `nojs-375.png`. |
| DES-207 50-event batch | VERIFIED-FIXED | A link under the headline, "Go to the EUDR map file and what this can't prove" (`#dl-block`, 51 px tall), reaches the downloads (scrollY 14296 of 15949). Verified at all widths, no overflow. Rows are not collapsed (the finding allowed either). `big-fold-375.png`. |
| DES-208 evidence copy | VERIFIED-FIXED | "First entry from this phone" / "Follows the previous entry from this phone"; no "follows entry N". `demo-1440-full.png`. |
| DES-209 sign-in failed attempt | VERIFIED-FIXED | After a wrong password: email kept, focus on `#email`, `aria-invalid=true`, `aria-describedby` names the error and help. Same in Kannada. axe none. `signin-wrong-375.png`, `kn-signin-wrong-375.png`. |
| DES-210 unconfirmed states show green | VERIFIED-FIXED | Loading and "Could not check yet": no ✓ icons, dashed neutral dots on the journey and neutral dashed plot outlines, "Not confirmed" / "Checking" chips, and the note "The details below are what the seller published. Until the check passes, they are not confirmed." Remaining mint is link and spinner colour only. Check again recovers to Verified. `st-unavailable-375-full.png`, `st-loading-375-full.png`. |
| DES-211 table header alignment | VERIFIED-FIXED | Cherry and Check headers computed `text-align: right`. |
| DES-212 print leftovers | VERIFIED-FIXED | Print shows every check line expanded under each entry, no "See all checks" label, no dead chevron. `print-plain-emul.png`. |
| DES-213 "hard fail" copy | VERIFIED-FIXED | "(limit 10.0%)" on the page; "hard fail" absent from main text. |
| DES-214 no organic certificate | VERIFIED-FIXED | "No organic certificate on record" present on the no-organic batch. |
| DES-215 mismatch downloads | VERIFIED-FIXED | Files block carries "These files come from this page as published, which did not match its seal. Do not rely on them." `st-tamper-1440-full.png`. |
| DES-216 "Does not match" chip contrast | VERIFIED-FIXED | Chip text `#FFBAB2` bold 15 px on red-tinted surface; estimated against the blended surface at about 7.9:1 (computed 6.85:1 against the unblended tint alone, the conservative bound). Was 5.21:1. |
| DES-217 forced colours | VERIFIED-FIXED | Plots now draw as white hexagons with black outlines and numbered markers on the grey panel. `forced-colors-1440.png`. |
| DES-218 "See all checks" label | VERIFIED-FIXED | Toggles to "Hide checks" when open. Note: EXE41 re-assigned this ID; the parked localhost item is DES-219. |
| DES-219 localhost absolute URLs | PARKED (EXE41 → TKT-28) | `og:url`, `og:image` and the print URL text are `http://localhost:3000/...` as before. Stage 11 check. |
| DES-220 404 and sign-in entry | VERIFIED-FIXED | Certificate 404 header wordmark is now a link to `/` (48 px target). Sign-in carries "Looking for a coffee certificate? Open the link or QR code you were given." (and in Kannada). |
| DES-221 `lang` under a Kannada cookie | VERIFIED-FIXED | With `udgam_lang=kn`: certificate and certificate 404 report `<html lang="en">`; `/` and `/sign-in` report `kn` and render Kannada. No overflow, axe none. |

Counts: 22 items (DES-200..DES-221): 18 VERIFIED-FIXED, 0 STILL-OPEN, 4 PARKED (DES-201, 202, 204, 219).

## New findings

| DES | screen/component | related M-/TKT-/TASK- | finding | category | severity | recommendation | evidence |
|---|---|---|---|---|---|---|---|
| (none) | | | No new finding. Checked for regressions at 375/768/1440 (and 360/320 on five batches): no horizontal scroll, no text under 13 px, no target under 44 px (all link/summary/button targets 48 px or more). axe: no violations on verified, mismatch, flagged, 404, 50-event, loading, unavailable, entries-open, Kannada-cookie certificate and sign-in (Kannada and after a failed attempt). Reduced motion: no running animations. No CSP violations or page errors. | | | | `probe1..6.mjs` output |

Not logged on purpose: the unconfirmed-state body attribute still reads `data-state=loading` for "Could not check yet" (internal only, nothing visible); DES-201/204 remain visible to a reader but are accepted decisions.

## Done-gate table (web-deliverables contract)

| Contract | Result | Evidence |
|---|---|---|
| 1 Responsive 375 / 768 / 1440 (+360, 320) | PASS | scrollWidth equals viewport for demo, 50-event, long-name, override and held-no-step at 320/360/375/768/1440; two columns at 1440, one below; proof card first; targets at least 48 px; no text under 13 px. |
| 2 Screen states: loading | PASS | `?state=loading`: "Checking 0 of 16 records…", neutral dots, "Checking" chips. |
| 2 Error (does not match) | PASS | Tamper: names step and record, meaning, action, "Check again", no green found by computed-style scan, files note. |
| 2 Could not check (key unreachable) | PASS | "Could not check yet", seller-published note, Check again recovers to Verified; no ✓ icons (DES-210 fixed). |
| 2 Not found | PASS | Wrong `h` and no `h` give the same 404 with a wordmark link home. |
| 2 Empty | N/A | A certificate always has at least one entry. |
| 2 Populated | PASS | Demo, 3-event, 50-event, override, organic and no-organic, processor ok, flagged and held. |
| 3 HTML mockup fidelity (`verify.html`) | PASS (accepted deviations) | Map now has labelled, sized plot markers like the mockup; links underlined; table headers aligned. Remaining differences are the parked org-ID names (DES-204). |
| 4 Social preview: crawler tags, absolute og:image, reachable, 1200x630 under 500 KB | PASS (dev) | Tags present in server HTML; absolute from the dev default `http://localhost:3000` (DES-219, Stage 11 https check). |
| 4 OG fidelity | PASS with DES-202 | Image unchanged and fixed text "Kodagu Arabica, verified at origin" (owner, Design Freeze). |
| 4 Live unfurl (Post Inspector / opengraph.xyz) | BLOCKED | No external inspector reachable from the sandbox; Stage 11. |
| Print view | PASS | Light set, `#111` ink, controls hidden, all checks printed, QR and URL text present (EVAL-087 / TC-071 satisfied). |
| Accessibility | PASS | axe clean in all states above at 375 and 1440; focus returns to the email field after a failed sign-in; reduced motion; forced colours readable; lang correct (DES-221). |
| CSP-safe behaviour | PASS | No CSP violations or page errors in any state. |
| 50-event batch | PASS | Verified, no overflow, numbered markers, jump link to downloads. |
| Copy / D5 | PASS | Verified / Needs a check / Not accepted words only; "hard fail" removed; organic stated as on record, not verified. |

Design Freeze: nothing re-opened. DES-202 stays an owner item.

RE-RUN: CLEAN
