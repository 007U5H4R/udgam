# M-001 gate — owner review items

TKT-21 (TSK-21.x) completes this file with HR1 (evidence-template snapshots), HR2 (known-limitations wording) and HR6 (every scorecard number traced to its results file). The section below was recorded ahead of that, from the owner's decisions of 2026-09-29.

## Owner items before production (EXE14; not blocking M-001 or M-002)
| # | Item | Why | Where it lands |
|---|---|---|---|
| PRE-1 | Restrict the map tile API key (HTTP referrer = production domain; tile endpoints only) | The key is public in the browser by design; restriction limits abuse | TKT-28 production config |
| PRE-2 | Switch to the live remote-sensing provider and re-record the synthetic provider fixtures with real keys | Everything in Stage 7 runs on fixture data; production refuses the fixture provider (EXE12) | TKT-27/28 |
| PRE-3 | Native-speaker review of every Kannada string marked `REVIEW: native speaker` | Machine-assisted Kannada must not ship unreviewed to farmers | before TKT-29 rehearsals |
| PRE-4 | Caddy overwrites `X-Forwarded-For`; the app trusts only that value; forged-header test passes | Per-IP sign-in and capture limits depend on it | TSK-27.3 (EXE14) |

## Owner decisions needed before baseline-v1 (from the P5 gate, 2026-09-29)
| # | Item | Options | Where |
|---|---|---|---|
| OD-1 | EVAL-122 (23 h EXIF gap) is a lone flag → Verified under EV7, so as written it is a measured miss | keep it as a reported miss, or make it accept Verified (it then tests the flag only) | EXE10, ledger P5 |
| OD-2 | EVAL-116 expects the substring "fail over 7 days"; since EXE10 the evidence reads "fail over 24 h" (the verdict is correct) | authorise the substring change | EXE10 |
| OD-3 | EVAL-049 is unreachable as one picking (3,000 kg on 2 ha > the 500 kg capture limit) | move it to a plot of ≤ 0.35 ha, or have the harness submit several pickings | EXE20 |
| OD-4 | Replay narrowing: a payload refused for X, then Y, then X gets the original X refusal back | acknowledge (it keeps EXE11's three guarantees) or ask for a new row | EXE20 |
| OD-5 | D5: "Needs a check" should say *when* the office will look; the mockup's "Usually within 1 working day" was never confirmed | give a real response time, or amend D5 | ledger P5 |
| OD-6 | TC-073: the clean-room checker's brief cited plan sections besides docs/proof-feed.md (QA-P5-3) | accept (three doc-only sufficiency reviews said YES, plus the import-isolation test), or rebuild the checker from the doc alone at Stage 9 | ledger P5 |
| OD-7 | EVAL-055 / EVAL-056 stay reported scenario-6 stretch misses (owner decision, EXE10) | — (recorded) | EXE10 |
| OD-8 | §18's certificate budget of 150 KB HTML+JS gzip can't be met on Next 16: the framework alone is about 141 KB, the certificate's own JS is 25 KB, and a 50-event batch's HTML is about 100 KB because the feed is embedded. S4 measured p50 2.4 s and max 3.17 s on the loaded VM; TKT-21 makes the formal run | raise the budget to what Next 16 allows, or keep it and accept a recorded miss; the TKT-16 reviewers are checking whether the double-embedded feed can be cut | TKT-16 report, TKT-21 |
