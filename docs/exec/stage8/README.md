# Stage 8 · Design Critique — Udgam (complete 2026-10-06)

The running app was critiqued against Design.md and the approved mockups (`.design/exploration/final/*.html`, `og/`). The `impeccable` skill is not in this repo's vendored snapshot, so the `bw-design-critique` procedure was followed directly. Each surface had its own reviewer (Sonnet, High). Fixes landed through implementer subagents with tests, and fresh reviewers re-ran each surface until it was clean.

## Reports
- **First critique:** `stage8-field.md` (DES-001–025), `stage8-office.md` (DES-100–114), `stage8-public.md` (DES-200–220).
- **Re-runs:** `stage8-rerun-field.md` (DES-026–029 new), `stage8-rerun-office.md` (DES-115–117 new, plus the `lang` note DES-118), `stage8-rerun-public.md` (clean), `stage8-rerun-final.md` (**RE-RUN: CLEAN**; DES-030 new, P3).

## Outcome
| | Count |
|---|---|
| Findings raised | 70 (DES-001–030, DES-100–118, DES-200–221) |
| P0 / P1 / P2 / P3 | 0 / 7 / 31 / 32 |
| Fixed and verified on the running app | 64 |
| Parked with a reason | 6 (below) |

## Parked
| DES | Reason |
|---|---|
| DES-005 | No time promise on "Needs a check" (EXE24, OD-5). The copy names who will look and where the answer appears. |
| DES-201 | A lone processor hop with no step reads "Handed to buyer" (EXE32); a signed `toOrgType` comes in a later ticket. |
| DES-204 | Organisation IDs, not names, on the certificate (EXE28). |
| DES-219 | The `PUBLIC_BASE_URL` localhost fallback → TKT-28 (https required in production); Stage 11 verifies the live unfurl. |
| DES-030 | P3: in Kannada at 320 px the third photo slot overflows by 3 px (`.slots` `repeat(3, 1fr)` → `minmax(0, 1fr)`). Predates Stage 8; carried into the Stage 9 fix wave. |
| DES-202 | **Resolved**, not parked: per-batch link-preview words from the frozen artwork (EXE43, EXE45). |

## Decisions
EXE40 (triage), EXE41 (corrections, DES-221), EXE42 (field and office fix decisions; buyer graded status in Design.md §28.7), EXE43 (owner items decided under delegation), EXE45 (per-batch OG images).

## web-deliverables done-gates (final)
| Contract | Result |
|---|---|
| Responsive | PASS: 320/360/375/768/1440; no horizontal scroll except DES-030 (P3, parked) |
| Screen states | PASS: loading, empty, error, populated, plus the real conditional states on every surface |
| Accessibility | PASS: axe 0 violations on every page; focus, targets, contrast, reduced motion and 200 % text |
| Mockup fidelity | PASS |
| OG / social preview | PASS for crawler-visible tags, 1200×630 images, alt text and per-batch words. BLOCKED: the live unfurl and the https production URL (Stage 11) |
