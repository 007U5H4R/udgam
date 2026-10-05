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
| OD-8 | §18's certificate budget of 150 KB HTML+JS gzip can't be met on Next 16: the framework alone is about 141 KB, the certificate's own JS is 25 KB, and a 50-event batch's HTML is about 100 KB because the feed is embedded. S4 measured p50 2.4 s and max 3.17 s on the loaded VM; TKT-21 makes the formal run | raise the budget to what Next 16 allows, or keep it and accept a recorded miss; measured by the TKT-16 spec review: framework JS 141.3 KB, /verify JS 161.7 KB, HTML 104.2 KB for 50 events (feed data block 43 KB, RSC payload 52 KB), total 265.9 KB. The feed appears twice because the spec'd `<script id="proof-feed">` is a Server Component and Next also serialises it into RSC; removing one copy (passing the feed only as a prop, or fetching `/api/verify`, which breaks §18's no-second-round-trip) saves about 43 KB, leaving about 223 KB. Suggested restatement: page JS above the framework baseline. S4 varied 1.9–4.7 s at load 47 on one build: the formal run needs a quiet host (TKT-21) | TKT-16 report, TKT-21 |
| OD-9 | Harness defaults for M-002: `DEFAULT_MILESTONE` stays M1 and the default ledger stays hashchain. EXE15 said the milestone moves to M2 when M-002 starts, but a plain `pnpm eval` on hashchain would then fail S6-lib at 7/8 (EVAL-103 needs the EVM ledger and Anvil) | keep M1 and hashchain as the defaults, with M2 run via `--ledger=evm --milestone=M2` in contracts.yml (as now); or switch both defaults, making Foundry a requirement for `pnpm eval` | TKT-24 spec review, EXE15 |

**Owner answers, 2026-10-05 (EXE23):** OD-1 b · OD-2 yes · OD-3 b · OD-4 acknowledged · OD-6 a · OD-9 a. Still open: OD-5, OD-8.
**Delegated decisions, 2026-10-05 (EXE24):** OD-5: Needs a check names who and where, with no time promise. OD-8: budget restated (client JS above the framework ≤ 60 KB gzip; HTML ≤ 120 KB; S4 unchanged and measured in TKT-21). All OD items are now decided.
