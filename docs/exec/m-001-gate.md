# M-001 gate — owner review items

TKT-21 (TSK-21.x) completes this file with HR1 (evidence-template snapshots), HR2 (known-limitations wording) and HR6 (every scorecard number traced to its results file). The section below was recorded ahead of that, from the owner's decisions of 2026-09-29.

## Owner items before production (EXE14; not blocking M-001 or M-002)
| # | Item | Why | Where it lands |
|---|---|---|---|
| PRE-1 | Restrict the map tile API key (HTTP referrer = production domain; tile endpoints only) | The key is public in the browser by design; restriction limits abuse | TKT-28 production config |
| PRE-2 | Switch to the live remote-sensing provider and re-record the synthetic provider fixtures with real keys | Everything in Stage 7 runs on fixture data; production refuses the fixture provider (EXE12) | TKT-27/28 |
| PRE-3 | Native-speaker review of every Kannada string marked `REVIEW: native speaker` | Machine-assisted Kannada must not ship unreviewed to farmers | before TKT-29 rehearsals |
| PRE-4 | Caddy overwrites `X-Forwarded-For`; the app trusts only that value; forged-header test passes | Per-IP sign-in and capture limits depend on it | TSK-27.3 (EXE14) |
