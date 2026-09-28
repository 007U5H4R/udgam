# Evaluation Framework — Companion to `build-workflow.md`

Referenced on demand from `build-workflow.md` (Stage 3 — Evaluation Design, and the stages that consume it). This file holds the **detailed** framework; `build-workflow.md` holds the stages, gates, and integration touchpoints. Do not duplicate stage definitions here.

## Core principle

**Define what "good" means before implementation, establish measurable acceptance criteria, evaluate continuously during development, and preserve evidence of quality across releases.** Treat evaluation as an engineering discipline, not final-QA documentation.

The framework is **generic and conditional**: it applies to every project — traditional software, APIs, PWAs, mobile/web apps, data products, and AI/LLM/RAG/agent systems — but each project activates **only** the evaluation layers its architecture and features warrant. **AI-specific evaluations activate only when the project actually contains AI/ML/LLM/RAG/agentic behavior.** Do not force every project into one format, and do not generate artifacts a project doesn't need.

**Adaptive, not bureaucratic.** Evaluation depth is proportional to: product risk · feature complexity · business impact · AI uncertainty · security sensitivity · production criticality. Examples:
- A **static website** → no LLM dataset; basic functional + accessibility + performance checks.
- A **CRUD app** → functional, integration, accessibility, performance.
- A **RAG product** → retrieval, groundedness, citation, latency, source-integrity.
- An **autonomous agent** → task completion, tool usage, trajectory, recovery, cost, safety.
- A **data pipeline** → data quality, completeness, schema, freshness, performance.

## Tests vs. evaluations (both may be required)

- **Tests** answer: *"Did the system behave exactly as specified?"* — API returned 200; DB row created; auth rejected an invalid token. Usually deterministic pass/fail.
- **Evaluations** answer: *"How good was the resulting behavior or outcome?"* — Was the AI answer accurate? Was retrieval relevant? Was the workflow usable? Was performance acceptable? Did the feature achieve the intended outcome? Some dimensions are deterministic, others scored (LLM-as-a-Judge or human).

## Evaluation categories (select what applies)

Claude determines which categories apply rather than mechanically applying all of them.

- **Functional** — correct business logic, workflow completion, state transitions, CRUD behavior, permissions, validation rules, error handling.
- **Product acceptance** — does the implemented feature satisfy the intended user outcome? task completion, usability, expected workflow, business-rule compliance, acceptance criteria.
- **AI** *(only if the project contains AI/ML/LLM/RAG/agentic behavior)* — correctness, groundedness, hallucination rate, retrieval precision, retrieval recall, citation accuracy, classification accuracy, instruction adherence, structured-output compliance, tool-selection accuracy, tool-execution accuracy, agent task-completion rate, trajectory quality, source integrity, safety, refusal correctness, latency, token usage, inference cost. **Select only the metrics relevant to the product.**
- **Performance** — API latency, page-load performance, throughput, concurrency, memory usage, database performance, background-job duration.
- **Reliability** — retry behavior, graceful degradation, timeout handling, queue recovery, service failure, idempotency, duplicate processing.
- **Security** — authentication, authorization, input validation, secrets exposure, injection risks, dependency vulnerabilities, privilege boundaries.
- **Design** — UX consistency, accessibility, responsive behavior, design-system compliance, interaction clarity.

## The `/evals` package

Default structure (adapt when the project needs no dataset — e.g. a CRUD app may use functional test cases instead of an AI-style dataset; do not create meaningless empty files):

```text
/evals
    evaluation-plan.md
    eval-dataset.json        # where relevant
    /scorers
    /results
    /reports
```

Preserve history — accumulate versioned evidence, never overwrite unless an artifact is explicitly ephemeral:

```text
/evals
    evaluation-plan.md
    eval-dataset.json
    /scorers
    /results
        baseline-v1.json
        eval-v1.json
        eval-v2.json
    /reports
        eval-report-v1.md
        eval-report-v2.md
```

## `evaluation-plan.md` contents

What needs to be evaluated · why it matters · applicable evaluation categories · metrics · scoring methodology · acceptance thresholds · **critical failure conditions** · automated evaluation strategy · manual evaluation strategy · human-review requirements · regression strategy · release gates. It must explicitly answer: **"What would make this feature or system unacceptable for release?"**

## Evaluation cases (design before implementation where reasonable)

Each major feature should have measurable expected behavior. Generic case:

```json
{
  "id": "EVAL-001",
  "feature": "feature-name",
  "category": "functional",
  "input": "...",
  "expected_behavior": "...",
  "expected_output": "...",
  "failure_conditions": [],
  "priority": "critical",
  "automated": true,
  "tags": []
}
```

Extend the schema to the project — do not force every project into one format.

**AI projects** may add: `"expected_sources": []`, `"forbidden_sources": []`, `"minimum_score": 0.9`, `"judge_type": "deterministic | llm | human"`.

**APIs** may add: `"expected_status": 200`, `"expected_schema": "..."`, `"maximum_latency_ms": 500`.

**UI projects** may add: `"viewport": "mobile"`, `"expected_interaction": "..."`, `"accessibility_requirement": "..."`.

## Dataset coverage (where relevant)

Happy paths · edge cases · boundary cases · failure scenarios · invalid inputs · ambiguous inputs · high-risk scenarios · high-business-impact workflows · known historical defects · regression cases.

**AI systems additionally:** adversarial inputs · hallucination scenarios · tool failure · retrieval failure · malformed context · prompt injection where relevant · conflicting evidence · missing evidence · model output-format failure.

## Baseline before optimization

For any feature whose measurable quality can change over time (AI quality, API performance, retrieval accuracy, page performance, workflow completion time, error rate, cost, throughput), establish and **store** a baseline before optimizing:

```text
/evals/results/baseline-v1.json
```

Never rely solely on "this version seems better" — compare against measurable evidence.

## AI-specific rule — write evals before prompt optimization

If a project contains AI behavior, **do not begin substantial prompt optimization before defining evaluation criteria and representative cases.** Sequence:

```text
Define expected behavior → Create eval cases → Run baseline →
Modify prompt/model/retrieval/agent → Rerun evals → Compare results
```

Prompt quality must not be judged only by manually inspecting a few outputs.

## Continuous evaluation triggers (during Execution)

Rerun the relevant evaluations whenever behavior-changing code lands:
- **Software:** API contract changes · DB schema changes · business-rule changes · authentication changes.
- **AI:** prompt · model · embedding · chunking · retrieval · reranker · tool · agent-instruction · routing · memory · context-building changes.
- **Frontend:** interaction · navigation · responsive behavior · accessibility-sensitive components.

Detect regressions rather than silently accepting them.

## Eval-run result artifact

Generated from **actual execution output** (never hand-entered) at `/evals/results/eval-run-{version}.json`. Capture: total cases · passed · failed · skipped · scores · critical failures · regressions · improvements · runtime · configuration · timestamp. Never hide or silently remove failed cases.

## Provenance

Each formal run records enough to identify exactly what was evaluated (only the fields relevant to the project): application version · git commit hash · branch · environment · evaluation dataset version · test-suite version · model/provider · prompt version · retrieval configuration · runtime configuration · timestamp.

## Reproducibility

Where feasible, provide a **single top-level command** that orchestrates the relevant sub-suites, e.g. `npm run eval`, `npm run test:e2e`, `python scripts/run_evals.py`, or `make evaluate`. A reviewer should be able to clone the project and reproduce the reported results; reports are generated from real output, not typed-in percentages.

## Final Evaluation Report (`/evals/reports/eval-report-{version}.md`)

Generated during Final QA. Show only rows applicable to the project:

```text
Evaluation Area            Baseline      Current       Target
----------------------------------------------------------------
Functional Pass Rate          91%          100%          100%
API p95 Latency              620ms         310ms        <400ms
Accessibility Issues            8             1             0
AI Citation Accuracy           82%           96%          >=95%
Critical Failures                3             0             0
```

Must include: overall PASS / FAIL · release recommendation · critical blockers · failed evaluation IDs · regression summary · baseline comparison · known limitations.

## Integration with the consolidated QA report

Final QA's `QA-report.md` (assembled by the `bw-security-review` skill, Stage 10) remains the single consolidated release-quality artifact. Beyond Design Critique + Code Review + Security Review, it also includes: functional testing results · evaluation results · performance results where applicable · AI evaluation results where applicable · regression results.

## Release gates (project-specific)

Block release when: critical functionality fails · a critical security issue exists · mandatory acceptance criteria fail · required evaluation suites were not executed · a critical regression appears · a mandatory quality threshold is missed.

**AI systems additionally:** block when critical hallucination evals fail · groundedness falls below threshold · citation integrity fails · tool execution becomes unreliable · safety requirements fail.

**Thresholds must not be weakened simply to make a release pass.** Any threshold modification is documented with justification.

## Production failures become regression cases (all projects)

```text
Production Issue → Root Cause Analysis → Reproduce Failure →
Add Evaluation/Test Case → Implement Fix → Verify PASS →
Retain Regression Case Permanently
```

Applies to UI bugs · API defects · business-rule failures · performance regressions · security defects · AI hallucinations · retrieval failures · agent failures. Whenever technically reasonable, never fix a meaningful production defect without first or simultaneously creating a reproducible regression case.

## Definition of Done templates

**Base (every project):**
```text
[ ] Functional implementation complete
[ ] Acceptance Criteria satisfied
[ ] Required tests created
[ ] Required tests pass
[ ] Required evaluation cases created
[ ] Applicable evaluation suite executed
[ ] Critical evaluations pass
[ ] No unacceptable regression against baseline
[ ] Results persisted
[ ] Required documentation updated
[ ] Required observability added
```

**AI features additionally:**
```text
[ ] AI eval dataset updated
[ ] AI eval suite executed
[ ] Prompt/model configuration recorded
[ ] Critical hallucination/groundedness/tool-use evals pass
```

**Performance-sensitive:** `[ ] Performance thresholds pass`
**Security-sensitive:** `[ ] Required security checks pass`

Do not treat a successful demo as sufficient evidence of completion.

## Worked ticket examples (see the `bw-problem-breakdown` skill, Stage 5, for the ticket schema)

**Non-AI feature:**
```text
FEATURE  Implement payment workflow
TASK     Implement payment validation
TASK     Create payment success evaluation cases
TASK     Create payment failure evaluation cases
TASK     Add idempotency tests
TASK     Add latency threshold test
```

**AI feature:**
```text
FEATURE  Implement document question answering
TASK     Create retrieval evaluation dataset
TASK     Implement groundedness scorer
TASK     Establish baseline
TASK     Implement retrieval pipeline
TASK     Run regression evaluation
```

Every applicable ticket/task carries: Type · Priority · Description · Dependencies · Acceptance Criteria · Definition of Done · Test Cases · Related Eval IDs.
