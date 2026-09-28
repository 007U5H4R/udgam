# Product Analytics Reference — `t-design` (+ Stages 6 / 9 / 12)

Loaded at the **measurement step** of a Product Journey design, and by Stage 6 (instrumentation plan), Stage 9 (analytics QA) and Stage 12 (post-launch loop). **Measure the journey, not every click. Analytics is designed before instrumentation.** Stage 4 writes a **tool-agnostic** contract; Stage 6 derives tool-specific files once the tool is confirmed. If the PRD already mandates the tool, Stage 4 may derive them too.

Mixpanel facts below were checked against docs.mixpanel.com on **2026-09-25**. Re-verify before relying on them; items marked *house principle* are our rules, not Mixpanel's wording.

## Contents
1. The contract · 2. Event design · 3. Starter taxonomy + journey properties · 4. Identity · 5. Funnels · 6. Retention, cohorts, activation validation, time-to-value · 7. Validation checklist (Stage 9) · 8. Stage-6 derivation (Mixpanel) · 9. Post-launch loop + experiments · 10. Privacy

---

## 1. The contract: `analytics/product-analytics-contract.md` (Stage 4, canonical design-time measurement spec)

Contents:
- **Product questions:** the decisions this data must inform.
- **North Star candidate + activation hypothesis:** refining `Discovery-PRD.md` success criteria and `evaluation-plan.md` metrics, never competing with them.
- **Event taxonomy** (§3), **funnel definitions** (§5), **retention definitions + cohorts** (§6).
- **Required event properties**, plus user and account/workspace properties.
- **Experiment dimensions** (§9), **identity rules** (§4), **environment rules** (§8).
- **Privacy rules** (§10), **instrumentation ownership**, and the **validation plan** (§7).

**Governance:** every event carries a definition, trigger, properties, owner, purpose, the reports that use it, and a status. **No orphan events**, meaning none that no report uses. Write definitions clean enough to paste into Mixpanel **Lexicon** (the data dictionary). If the org has **Data Standards** (Enterprise), align names and metadata with it.

## 2. Event design

- **Events are behaviour; properties are context.** `Analysis Completed` + `{analysis_type: contract, source_type: pdf, entry_source: landing, status: success}`, not `MarketingUserCompletedAIAnalysisFromPDF`. One general event plus properties keeps funnels and segmentation flexible (docs.mixpanel.com/docs/data-structure/events-and-properties).
- **Names are Object + past-tense Verb.** Mixpanel's docs use snake_case (`song_played`); many teams use Title Case (`Signup Completed`). **Pick one casing per project and never mix them.** Names are case-sensitive.
- **Start small** (*house principle*): define the KPIs, map them to the user flow, derive the events, and instrument **one primary funnel** first. Mixpanel warns that tracking "everything" produces unused data (docs.mixpanel.com/docs/tracking-best-practices/tracking-plan).
- **Super properties** carry values every event needs, such as `experiment_variant` and `entry_source`. Register them once. Events sent before registration read "(not set)", which is not a variant.

## 3. Starter taxonomy + journey properties

```text
Landing Viewed · Primary CTA Clicked · Signup Started · Signup Completed · Onboarding Started ·
Onboarding Step Completed · Onboarding Skipped · Onboarding Completed · Core Action Started ·
Core Action Completed · Activation Reached · Empty State Action Selected · Paywall Viewed ·
Upgrade Selected · Checkout Started · Checkout Completed · Checkout Failed
```
Use only the ones the product questions need.

**Useful properties:**
- Onboarding: `step_id`, `step_name`, `variant`, `elapsed_time`. Don't create one event per field.
- Empty states: `action` = create | import | sample | template, plus `object_type`.
- Paywall: `trigger_feature`, `plan_from`, `plan_to`, `usage_state`, `trial_state`. These explain *why* someone upgraded.
- Samples and templates: template selected → sample started → sample converted to real work → real data imported. This tells you whether samples speed activation or become dead ends.

**Reusable journey properties:** `entry_source · campaign · landing_variant · cta_location · auth_method · onboarding_variant · persona · use_case · template · workspace_type · plan · trial_status · device_class · platform · experiment_variant`.

**Returning use:** prefer business-value events (`Core Action Completed`, `Existing Object Continued`) over a custom session concept.

## 4. Identity (verify the project's ID-management version before implementing)

- **Simplified ID Merge** is the default for organisations created since April 2024. **The API can't be switched once a project has data** (docs.mixpanel.com/docs/tracking-methods/id-management).
- Under Simplified ID Merge:
  - Call **`identify(user_id)`** at signup, at login, and when the app reopens logged in.
  - Call **`reset()`** at logout.
  - Anonymous `$device_id` events merge into `$user_id` the first time both appear on the same event, so **landing → CTA → signup → activation become one journey**.
  - `alias` and `$merge` are **ignored**, so don't use legacy alias patterns.
- **Original ID Merge** (older projects):
  - `reset()` only on a deliberate user switch.
  - A cluster holds at most 500 IDs.
  - `alias` is legacy.
- **The `user_id` must be stable and never change:** a database ID. **Never** an email address, display name or session ID, because `$user_id`s can't be merged or changed later.
- **B2B:** model **user** and **account/workspace** separately (group analytics or account properties). For example, user activation = "created first report"; workspace activation = "data source connected + 2 members performed the core action".

## 5. Funnels (`analytics/mixpanel-funnels.md` when Mixpanel is confirmed)

```yaml
funnel: {name, question, population, steps, conversion_window, exclusions, breakdowns, success_metric, interpretation}
```
- **Start with the primary journey:** qualified landing → signup → core action → activation.
- **Add later, only when needed:** activation → paid, and invite → team activation. Don't create 25 funnels on day one.
- **Mixpanel mechanics:**
  - The conversion window defaults to **7 days** (up to 366 days or 12 sessions) and starts at step 1.
  - You can **hold up to 3 properties constant**.
  - **Exclusion steps** can't be the first or last step.
  - Time-to-convert can be shown as average, median, percentile, minimum or maximum (docs.mixpanel.com/docs/reports/funnels/funnels-advanced).
- **Metrics:** overall and step conversion, drop-off, time between steps, total time to activation, and conversion by segment.
- **Never optimise one step in isolation.** A signup variant that raises `Signup Completed` but lowers `Activation Reached` is worse.
- **Activated Visitor Rate** = unique visitors who reach activation ÷ qualified unique landing visitors. It aligns acquisition with product better than signup rate does. Also consider **Retained Activated Visitor Rate**.

## 6. Retention, cohorts, activation validation, time-to-value

```yaml
retention: {name, question, birth_event, return_event, eligible_population, cadence, window, breakdowns, exclusions, rationale}
```
- **Birth and return events:**
  - The birth event is the starting action (e.g. `Activation Reached`).
  - The return event must represent **continued value** (`Core Action Completed`, `Project Updated`, `Report Created`), **not** Login or Page Viewed, unless those genuinely are the value.
  - Mixpanel "**on or after**" (the default) counts a return in that period or any later one; "**on**" counts only that exact period (docs.mixpanel.com/docs/reports/retention).
- **Cadence matches natural usage** (*house principle*):
  - daily: messaging, habit or productivity tools
  - weekly: project management, most B2B tools, reporting
  - monthly or periodic: finance close, compliance, tax, planning

  Never default to daily.
- **Cohorts:**
  - Activated / Not Activated
  - activated in the first session vs activated over multiple sessions
  - Trial Activated, Paid Activated, Team Activated
  - by use case, onboarding variant and acquisition source
- **Activation validation** (repeatable): compare Cohort A (reached the activation candidate) with Cohort B (didn't) on week-1 and week-4 retention, core-action frequency, paid conversion and team adoption. **If A doesn't materially outperform B, the activation event is weak. Revise the hypothesis.**
- **Time-to-value:** make sure these intervals can be computed:
  - landing → signup
  - signup → core action started
  - signup → core action completed
  - signup → activation
  - first session → activation

  Segment each by source, onboarding variant, device, use case, plan and template.

## 7. Validation checklist (Stage 9; record evidence in `test-cases.md` → `QA-report.md`)

```
[ ] anonymous events fire                      [ ] CTA event fires ONCE per intended action
[ ] identify() on signup/login; reset() on logout; pre-auth events join the identified user
[ ] no duplicate events (incl. React strict-mode double effects, retries)
[ ] required properties present, correctly typed   [ ] super properties registered before first event
[ ] correct environment/project token          [ ] test/QA users excluded or isolated
[ ] activation fires only when the real value condition is met (not on page load)
[ ] experiment variant persists across sessions and auth   [ ] paywall context properties present
[ ] funnel steps appear in the right order; timestamps valid   [ ] retention birth/return events available
[ ] no prohibited PII in any payload
[ ] INGESTION PROVEN in Mixpanel's Events view (Data → Events), not by HTTP 200
[ ] correct residency host for the project (US api / EU api-eu / IN api-in)
[ ] build-time env vars (e.g. VITE_*/NEXT_PUBLIC_*) present in the BUILD environment, not only runtime
[ ] project timezone set deliberately (reports use it)
```
**Why the last four exist (scar):** `/track` returns `1`/HTTP 200 even for an invalid token (use `verbose=1`). Events sent to the wrong regional host are **not ingested**. Build-time-inlined tokens missing from the build environment ship analytics silently disabled. Only the Events view proves that data landed.

## 8. Stage-6 derivation (Mixpanel)

Once the tool is confirmed, derive from the contract (never edit these independently):
```
analytics/
├── product-analytics-contract.md     (Stage 4, canonical)
├── mixpanel-tracking-plan.csv        Event Name · Description · Journey Stage · Trigger · Required Properties ·
│                                     Optional Properties · User/Account Scope · Owner · Environment · PII Allowed? ·
│                                     Used In Funnel · Used In Retention · Implementation Status · Validation Status
├── mixpanel-funnels.md   ├── mixpanel-retention.md   ├── mixpanel-cohorts.md   └── mixpanel-validation.md (§7)
```
Stage 6 also decides:
- **SDK and tracking side:** Mixpanel recommends tracking as much as possible **server-side**, because client-side ad-blockers can lose 30–50% of events. A proxy mitigates this. Server-side code must manage `$device_id` for anonymous users itself.
- **Identity wiring:** per §4.
- **Deduplication:** `$insert_id`.
- **Environments:** **separate dev and prod projects** with token switching. Stop sending data to dev after testing, because MTUs are counted per project.
- **Residency host** and **data contracts**.
- **Analytics tests.**

**Report automation:** an official **Mixpanel MCP server** exists (dashboards and cohorts; an org admin must enable it). Build reports through it **only if it's connected and the user approves**. Otherwise write exact setup specs, and **never claim reports were created.**

## 9. Post-launch loop (Stage 12) + experiments

`ANALYZE FUNNEL → FIND DROP-OFF → COMPARE SEGMENTS → TIME-TO-VALUE → RETENTION → VALIDATE ACTIVATION → HYPOTHESIS → EXPERIMENT → UPDATE DESIGN/PRODUCT`. Wait for enough real usage before drawing conclusions.

Questions to ask:
- **Funnel:** Where's the largest meaningful drop-off, and is it a real problem or intentional qualification? Is signup or onboarding friction too high? Is the first action understandable? Are failures causing abandonment? Does mobile activation lag desktop? Which CTA source and entry path activate fastest?
- **Retention:** Do activated users return more? Which activation paths, use cases, onboarding variants and sources retain best? Does fast activation predict retention? Do sample-data users adopt real data? Does team behaviour lift retention?

```yaml
experiment: {name, hypothesis, variant_property, primary_metric, guardrail_metrics, activation_impact, retention_impact, segment}
```
Prioritise activation, retained value and paid value over vanity micro-conversions. Every experiment names guardrails (e.g. `signup_completion`, `week_4_retention`).

## 10. Privacy + data minimisation

```yaml
analytics_privacy: {allowed_user_properties, prohibited_properties, consent_requirements, retention_policy_reference}
```
Never send passwords, secrets, tokens, raw sensitive documents or content, or PII that no question needs. Use IDs, not emails, as identity. Consent is decided per jurisdiction and product (Stage 6/10). A consent banner skipped for a pilot is a documented decision, not an oversight.

## Output hooks

Feeds `analytics/product-analytics-contract.md`, `Design.md §27 measurement`, Stage-6 `technical-plan.md`, Stage-9 `test-cases.md`, and Stage-12 learning. Cross-refs: [[product-journey]], [[web-conversion]], [[behavioral-design]].
