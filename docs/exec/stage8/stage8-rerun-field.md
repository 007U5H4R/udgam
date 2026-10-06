# Stage 8 re-run: surface `field` (farmer/agent phone app)

Reviewer: `s8r-field` (fresh). Build: `build/stage7` @ `9359ed08c5e4148f2c81eccf5c1b44fda704a9d5`, `pnpm build` + `next start -p 4200`, `E2E=1`, fixture provider, throwaway auth secret, fresh `DATA_DIR`. Worlds seeded with `e2e/helpers/seed-capture.ts` (3 events, 2 plots, office phone; 203 events for the Pickings limit).
Viewports: 375×812 (primary), 360×740, 320×568 (record flow), 768×1024, 1440×900 (field is a centred phone column there). Kannada (`udgam_lang=kn`), reduced motion, offline (`context.setOffline`), print (emulated media).
Evidence folder: `/tmp/claude-0/-home-user-udgam/7d6abfcb-5350-51dc-9aa1-9a3d4f3c8522/scratchpad/stage8/field-rerun/` (screenshots; the probe specs are in `specs/`). Mockup renders: `mock-index-375.png`, `mock-index-768.png` (the earlier `stage8/field/mock-*.png` set still stands for the other screens).
Method: the probe specs log `## …` measurement lines (quoted below). axe was run (wcag2a/aa, 21, 22aa, best-practice) on Home, Help (More open), Pickings, detail, record steps, saved sheet, offline sheet, verdicts, sign-in, enrol, Kannada pages and a 203-row Pickings list, at the listed viewports. Result: 0 violations of any impact on every screen.
The suite check: `field-*`, `sign-in`, `enrol`, `capture-*` on the `phone` project: 77 passed, 1 failed (see DES-029).

## 1. Original findings

| DES | status | evidence |
|---|---|---|
| DES-001 Help exit off-screen | VERIFIED-FIXED | Close is pinned in view at every size: `DES-001 375 {closeBox y 727, h 56, inView true}`, `360 {y 655, inView true}`, 768 and 1440 also true; fade marks more below (`help-375.png`); Language, This phone, Sign out sit behind "Language, this phone, sign out" (`help-more-375.png`, `help-more-360.png`, `help-1440.png`). axe on Help: `[]` at all four widths |
| DES-002 Offline navigation | VERIFIED-FIXED (EXE40/EXE42 accepted limit) | `context.setOffline(true)`: "Send now" stays on `/field/pickings`, row kept, note "No network here. Nothing is lost: your pickings are still saved on this phone." (`offline-sendnow-375.png`, log `DES-002 sendnow`); a tab tap shows the "No network here" sheet and the URL stays (`offline-tab-375.png`, `DES-002 tab {sheet:true}`); no `chrome-error`. Lie-fi remains the accepted gap (EXE42) |
| DES-003 Contours past the card | VERIFIED-FIXED | `.plot-card` is `overflow: hidden` at 360/375/768/1440 (measurement `DES-003 …{"overflow":"hidden"}`); the contour group is still wider than the card (-13/+56 px at 375) but is clipped: `home-375.png`, `home-768.png` show the lines end at the glass edge |
| DES-004 Reused-photo copy | VERIFIED-FIXED | Not accepted screen: "This photo was used before." + "Take new photos of today's picking and record it again. If these photos are new, tell the office." (`verdict-rejected-375.png`, log `DES-004`); same lines in detail (`detail-rejected-375.png`) |
| DES-005 No "when" on Needs a check | PARKED (EXE24, OD-5; EXE40) | Copy names who and where: "The office will look at this. You'll see the answer in Pickings. You don't need to do anything." (`verdict-second-360.png`) |
| DES-006 Silent "Try again" | VERIFIED-FIXED | Held request: "Trying…" disabled with `aria-busy="true"` (`DES-006 busy [true,"true"]`, `saved-sheet-trying-375.png`); then "Still no network. Nothing is lost." (`saved-sheet-still-375.png`) |
| DES-007 Colour-only selection | VERIFIED-FIXED | Check icon on the pressed language and the pressed plot, none on the others (`lang-sheet-375.png`, `plot-chooser-375.png`; measurement `["true",true,"English"]`, `["true",true,"Plot 1 · …"]`, `["false",false,…]`) |
| DES-008 Kannada legend | VERIFIED-FIXED | Chip on its own line, explanation full width, each verdict word on one line (`kn-help-375.png`, `kn-help-mid-375.png`); axe `[]` |
| DES-009 Kannada chip and slot | VERIFIED-FIXED | Header chip word is 1 line (`kn chip lines 1`, `kn-pickings-open-375.png`); "ಮುಂದಿನದು" on one line beside its icon (`kn-record-375.png`) |
| DES-010 Weight pill too high | VERIFIED-FIXED | Send pill bottom within 18 px of the viewport bottom at every size: 794/812 (375), 722/740 (360), 550/568 (320), 1006/1024, 882/900; keypad targets 56 to 64 px (`rec-weight-375.png`, `rec-weight-320.png`) |
| DES-011 Not-found | VERIFIED-FIXED (other wave) | `/field/pickings/EV-DOESNOTEXIST` returns 404 with the styled dark card "We can’t find that picking." + "Back to Pickings" + tab bar (`detail-404-375.png`); `/field/nonsense` returns 404 "We can’t find that page." + "Go to your home screen" (`field-404-375.png`); Kannada heading and `lang="kn"` correct (`kn-404-375.png`); axe `[]` |
| DES-012 Floating tab bar | VERIFIED-FIXED | `position: fixed`, bottom gap 14 px on Home, Pickings empty/loading/error, detail and not-found at 375/360/768/1440 (`pk-empty-375.png`, `tabbar home … {"pos":"fixed","bottomGap":14}`); at scroll end the content clears the bar (`detail-nc-360.png`, `home-end-360.png`); axe `target-size` clean on detail at 360 |
| DES-013 Un-enrolled record flow | VERIFIED-FIXED | With the key store emptied, `/field/record` goes to `/enrol` (log `DES-013 "…/enrol"`, `record-unenrolled-375.png`); Home shows "Set up this phone" in place of Record (`home-unenrolled-375.png`); no "Not accepted" anywhere |
| DES-014 Small tel link | VERIFIED-FIXED | "Call the office" pill with the number, `tel:+918272000111`, 56 px high, 317×56 at 375 and 302×56 at 360 (`DES-014 …`); target scan of every field screen at 375 found no control under 48 px |
| DES-015 Sign-in language | VERIFIED-FIXED (other wave) | With `udgam_lang=kn` sign-in renders "Udgam ಗೆ ಸೈನ್ ಇನ್ ಮಾಡಿ", Kannada labels, button and error, and `<html lang="kn">` matches (`signin-kn-375.png`, `signin-kn-error-375.png`; log `signin kn {"lang":"kn", …}`); English unchanged; axe `[]` in both |
| DES-016 Disclosure chevrons | VERIFIED-FIXED | Chevron on "What can I do?" and "See all checks", pointing up when open (`pickings-open-375.png`, `detail-nc-360.png`; `DES-016 {n:2, chevron:2}` at all widths) |
| DES-017 Broken thumbnail | VERIFIED-FIXED | A thumbnail that fails to load shows a neutral tile with a camera icon and "Photo not available" (`detail-thumbmissing-375.png`); a real photo still renders (`detail-rejected-375.png`) |
| DES-018 Photo error style | VERIFIED-FIXED as to styling; NEW overlap DES-026 | Error is `rgb(255,140,126)` (`--bad-ink`), has an icon, margin-top 12 px (`DES-018 … {"color":"rgb(255, 140, 126)","mt":"12px","icon":true}` at 320/360/375/768/1440). The message is now covered by the pinned pills on small phones, see DES-026 |
| DES-019 Silent keypad | VERIFIED-FIXED | 499 kg: amber "499 kg is far from your last pickings (38–51 kg). Check the number before you send." and pill "Yes, send 499 kg" (`rec-weight-499-375.png`); a refused ".3" shows "Kilos in halves (.0 or .5), up to 500 kg." (`rec-weight-refused-375.png`). Same at 320, 360, 768, 1440. Small inconsistency in the refused state is DES-028 |
| DES-020 axe minor | VERIFIED-FIXED | axe (all tags, incl. best-practice) returns `[]` on record photos/review/weight at 320, 360, 375, 768, 1440, on error cards, detail, Help, sheets |
| DES-021 No Sign out | VERIFIED-FIXED (EXE40/EXE42) | Help → More → "Sign out" with "Pickings saved on this phone stay on it." (`help-more-375.png`); signing out lands on `/sign-in`, `/field` then redirects to sign-in, and the outbox count is the same before and after (`outbox before/after signout [1,1]`) |
| DES-022 200-picking limit | VERIFIED-FIXED | 203 seeded: 200 rows, then "Showing your last 200 pickings. Ask the office for earlier ones." (`pickings-limit-375.png`); axe `[]` |
| DES-023 Kannada heading leading | VERIFIED-FIXED | `kn h1 lh 1.35` (`kn-home-375.png`) |
| DES-024 "You" label collision | VERIFIED-FIXED | Dot outside at NW, N, NE, SW, W of the plot: the label sits below the dot and clear of the farmer line (`home-outside-nw-375.png`, `home-outside-n-375.png`) |
| DES-025 (1) Thumb-zone pills | VERIFIED-FIXED (design); see DES-029 for the stale test | Enrol "Set up this phone" and "Go to Home" end 20 px above the bottom at 375/360/768 (`enrol-form-375.png`, `enrol-done-375.png`, `Set up this phone 375 {bottom 792}`); the sign-in pill ends at y=725 of 812, with the new certificate hint under it (`signin-en-error-375.png`) |
| DES-025 (2) Sign-in error copy | VERIFIED-FIXED (other wave) | "Email or password is not right." + "If you have forgotten it, ask the office that set up your account." (`signin-en-error-375.png`); Kannada equivalent (`signin-kn-error-375.png`); enrol errors still carry the office path |

Counts: 23 VERIFIED-FIXED, 1 PARKED (DES-005), 0 STILL-OPEN. (DES-018 is fixed as written; its follow-on is a new finding.)

## 2. New findings (regressions and misses)

| DES | screen/component | related M-/TKT-/TASK- | finding | category | severity | recommendation | evidence |
|---|---|---|---|---|---|---|---|
| DES-026 | Review step, unreadable-photo error (`photo-error`) | TKT-10 · TASK-12 (DES-018 fix) | The error is in the page flow above two pinned pills ("Use this photo", "Take again"). At 360×740 the error box (y 595–672) sits entirely under the "Use this photo" pill (y 594–654), so the farmer sees only a faded half line; at 320×568 it is 396–472 against the pill at 432–492; at 375×812 the last line "Open camera." is 12 px under the pill (601–678 vs 666). The page scrolls (scrollHeight 838 at 360), but nothing says so. The farmer taps "Use this photo" and sees nothing happen, which is the failure DES-018 set out to fix. | feedback / layout | P2 | Put the error above the check list or inside the pinned action block (above the pills), or add bottom padding to the scroll area equal to the pinned block's height and `scrollIntoView` the alert when it appears. Not frozen. | `rec-badphoto2-360.png`, `rec-badphoto2-320.png`, `rec-badphoto-375.png`; measurement `overlap 360 {"err":{"top":595,"bottom":672},"b":[…"Use this photo" top 594, bottom 654…]}`, `overlap 320`, `overlap 375` |
| DES-027 | Picking detail, "See all checks" card | TKT-11 · TASK-12 | The disclosure sits in a `row tall` card that carries the Pickings row's top divider, but on the detail page nothing is above it, so the card opens with an empty section and a hairline. It also touches the evidence card above it (about 2 px gap, against 12 px between cards elsewhere). Present before the fixes (visible in the original `stage8/field/pk-detail-rej-375.png`) and not logged then. | visual consistency | P3 | On the detail page drop the divider (`.r-why` border-top and padding) and give the card the standard 12 px gap. | `detail-rejected-375.png`, `detail-thumbmissing-375.png`, `detail-nc-360.png` |
| DES-028 | Weight step, refused key while the weight is unlikely | TKT-10 · TASK-11 | After a refused key the hint line shows the half-kilo rule, but the pill keeps its "check" label. Typing "4" then "." then "3" on a farmer whose last pickings were 38–51 kg leaves "4." in the display, the rule in the hint and the pill reading "Yes, send 4 kg": the confirm label with no visible reason, because the "far from your last pickings" line is replaced. The next valid key restores both. | feedback / edge-case UX | P3 | Show the refused-key line for about 2 s, then fall back to the check line, or stack both lines; or keep the pill's label tied to the line that is showing. | `rec-weight-refused-375.png`; measurement `DES-019 refused 375 {"hint":"Kilos in halves (.0 or .5), up to 500 kg.","num":"4."}`, pill "Yes, send 4 kg" |
| DES-029 | e2e `field-critique.spec.ts` "DES-025 (1)" (gate, not UI) | TKT-04/05 · TASK-5, TASK-6 | The test fails at HEAD: sign-in pill bottom is 725, the spec expects greater than 752 (812 - 60). Commit 07ea92b (DES-209/220, "point to the certificate on sign-in") added a two-line hint under the pill, which moved it up 67 px after the field wave had passed 18/18. The design is acceptable (the pill is in the lower fifth, hint below, 87 px from the edge), so this is a stale assertion from two waves interacting, found only by running the specs together. | process / regression gate | P3 | Update the assertion for the sign-in page (for example bottom within 100 px), or move the hint above the pill. The Stage 9 gate run must not carry a red test. | `e2e/field-critique.spec.ts:333`, run: `Expected: > 752  Received: 725`; `signin-en-error-375.png` |

## Deliberately not logged

- Programmatic focus box on the `h1` of record steps after a `page.goto` (not after a tap): unchanged, correct for keyboard users.
- Pickings and Home content running behind the floating tab bar mid-scroll (`home-375.png`): the approved floating look (Design.md §14); clearance at the scroll end verified.
- The lavender glow on the Kannada pill in the language sheet: the primary-pill treatment on first-run focus; unchanged from the first review.
- "Language: ಕನ್ನಡ" in Help's More row is a switch to the other language (text button), same as the header chip.
- Dark UI in direct sunlight: still needs the owner's midday test (§22).

## 3. Done-gate table (web-deliverables.md), surface `field`

| Contract | Result | Evidence |
|---|---|---|
| 1. Responsive: 375 | PASS | `scrollWidth == 375` on Home, Pickings, detail, Help, sheets, enrol, sign-in, record steps; targets ≥ 48 px (scan of ten screens, no hits) |
| 1. Responsive: 360 and 320 | PASS with DES-026 | Same at 360×740 and 320×568 (record flow, weight keypad 56 px keys, pill at 550/568); the photo error is covered at these sizes (DES-026) |
| 1. Responsive: 768 | PASS | Centred phone column, no overflow (`scrollW 768 … [768,768]`), Help Close in view |
| 1. Responsive: 1440 | PASS | Same column centred, no overflow, Help Close in view (`help-1440.png`, `scrollW 1440 … [1440,1440]`) |
| 1. Responsive: reflow, long text | PASS | Kannada across Home, Help, Pickings, record, sign-in with no mid-word breaks (`kn-*-375.png`); 63-character name case unchanged. Browser text zoom to 200 % not exercised |
| 2. Screen states: Home | PASS | loading, empty, error, populated, outside plot (5 geometries), un-enrolled (`home-loading-375.png`, `home-empty-375.png`, `home-error-375.png`, `home-outside-*-375.png`, `home-unenrolled-375.png`) |
| 2. Screen states: Pickings | PASS | loading, empty, error, boundary, populated (3 and 203 rows), saved-on-phone, offline note (`pk-*-375.png`, `pickings-pending-375.png`, `pickings-limit-375.png`) |
| 2. Screen states: Record / verdict | PASS with DES-026, DES-028 | photos, review, weight (normal, unlikely, refused key), checking, Verified, Needs a check, Not accepted (reused photo), Couldn't send, Trying, Still no network |
| 2. Screen states: offline | PASS | tabs, Record and Send now stay in the app with the sheet or note; no browser offline page (EXE42 lie-fi limit accepted) |
| 2. Screen states: error boundary | PASS | `?state=throw` shows "Couldn't load your entries … safe on this phone" + Try again (`pk-throw-375.png`) |
| 2. Screen states: not found | PASS | styled 404 in English and Kannada, field and picking (DES-011) |
| 3. HTML mockup | PASS | `final/index.html` rendered at 375 and 768 (`mock-index-*.png`); app and mockup do not materially diverge; DES-005 parked |
| 4. Social preview / OG | N/A | Authenticated private PWA |
| Accessibility: axe | PASS | 0 violations (any impact) on all listed screens at all listed widths |
| Accessibility: focus visible, order, names | PASS | 3 px `rgb(216, 245, 140)` solid outline; tab order Language, Record, Home, Pickings, Help |
| Accessibility: contrast incl. colour-only | PASS | selection states now carry a check mark (DES-007); verdict chips word + shape + colour; axe colour-contrast clean |
| Accessibility: target size ≥ 48 px | PASS | scan found no interactive control under 48×48 on Home, Help, sheets, Pickings, detail, record steps |
| Accessibility: reduced motion | PASS | `getAnimations()` is 0 on Home and on checking; "See result" button shown; normal motion has only the `pulse` animation on Home |
| Print | N/A | Field is an interactive phone app; print emulation renders Home without breakage (`home-print-375.png`); not a deliverable |
| Kannada layout | PASS | DES-008, 009, 015, 023 fixed |
| Copy: D5 verdict words / forbidden words | PASS | "Verified", "Needs a check", "Not accepted" with mark + colour; the new copy (Trying…, Still no network, More, Sign out, DES-004, DES-019) uses no forbidden word |

## Frozen items

None of the new findings touches a Design Freeze item (IA, heroes, visual direction, one primary pill, one motion moment, native scroll, three-cherry brand). DES-026 to DES-029 are pixel-level or test fixes. DES-005 stays parked on the owner's side (EXE24).

## Cleanup

Own server (PID in `s8r-field-server.pid`) stopped by PID; `.next`, `.e2e-data`, `test-results` and my probe specs removed from the clone (copies kept in `stage8/field-rerun/specs/`). No tracked file touched, nothing committed.

RE-RUN: NOT CLEAN
