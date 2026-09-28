# Emotional & Trust Design Reference — `t-design`

Loaded when a product is **high-stakes, high-trust, AI-driven, or emotionally sensitive** (finance, health, legal, first-run onboarding, anything handling money/identity/irreversible actions). Source: Norman *Emotional Design*.

---

## 1. Norman's three levels (design for all three, deliberately)

- **Visceral** — the immediate gut reaction to look and feel. Governed by first impression: clarity, order, restraint, craft. A cluttered or generic first screen loses trust before a word is read.
- **Behavioral** — the feel of *use*: responsiveness, predictability, competence, "it does what I expect." This is where most product love is won or lost.
- **Reflective** — the story the user tells themselves afterward: "I'm the kind of person who uses this," pride, recommendation. Governed by outcomes, identity fit, and the end of the experience (peak-end).

## 2. Emotional journey map (record in `Design.md §4`)

Walk the dominant flow and name, at each key step, the **intended emotion** and the **risk emotion** to prevent:

| Step | Intended feeling | Risk to prevent | Design response |
|------|------------------|-----------------|-----------------|
| Entry / first view | oriented, capable | overwhelmed, lost | one clear next action |
| Core task | in control, confident | uncertain, anxious | feedback, undo, visible state |
| Wait / processing | informed, patient | abandoned, suspicious | truthful progress (see §4) |
| Success / end | accomplished, assured | "did it work?" | explicit confirmation + next step |
| Error | guided, unblamed | frustrated, blamed | see [[cognitive-design]] + §Error below |

Engineer the **peak** (one moment of genuine competence/delight) and the **end** (clean, affirming) — that pair is what's remembered ([[behavioral-design]] Peak-End).

## 3. Trust design (record in `Design.md §19`)

Trust is earned by legibility, not by claiming it ("trusted by millions" claims *reduce* trust when generic). Activate when trust-sensitivity is medium/high:

- **Transparency** — show what the system is doing and why; no hidden state changes.
- **Provenance** — for any consequential output, show where it came from (source, timestamp, who/what produced it).
- **Reversibility** — undo, drafts, confirmation-before-commit for irreversible actions; the user is never trapped.
- **Honest limits** — state what the product can't do or isn't sure about; over-claiming is a trust leak.
- **Data dignity** — say plainly what data is used and why, at the moment it's relevant (not buried).
- **No fake social proof / metrics** — see [[anti-ai-slop]].

## 4. AI epistemic UX (activate for AI / RAG / agent products)

Do **not** present AI output as unquestionable truth. Explicitly design:

- **Source citations & evidence** — link claims to their sources; make them inspectable.
- **Provenance** — which model/tool/document produced this; when.
- **Uncertainty** — communicate confidence honestly (hedge, ranges, "based on N sources"); don't fabricate certainty.
- **Conflicting / missing evidence** — show when sources disagree or when there's nothing to answer from, rather than inventing.
- **System / tool status** — truthful, real-time state of what the agent is doing.
- **Human confirmation** — consequential/irreversible AI actions require explicit user confirmation.
- **Fallback / error handling** — graceful, honest behavior when retrieval or a tool fails.

### Real process transparency (never fake it)
Show processing stages **only when they actually happen**:
`Retrieving sources → Reading documents → Comparing evidence → Generating answer`.
Never fabricate "AI thinking" animations or invented delay to seem more capable — that is a dark pattern ([[anti-ai-slop]], [[behavioral-design]] Labor Illusion).

## 5. Error psychology (record in `Design.md §20`)

Errors are emotional events. Design them so the user feels **guided, not blamed**:

- **Blame the system, never the user** — "That email isn't recognized," not "You entered an invalid email."
- **Say what happened, why, and the fix** — every error names the recovery action.
- **Prevent > correct** — constrain input, validate inline, use good defaults so the error never occurs.
- **Preserve work** — never discard user input on error.
- **Place the message where the eye is** — next to the cause, not in a distant banner.
- **Match tone to stakes** — light for trivial, serious and clear for consequential; never cute about data loss or money.

## Output hooks

Feeds `Design.md` **§4 Emotional Journey**, **§19 Trust & Transparency**, **§20 Error & Recovery Strategy**, and (for AI) the epistemic-UX requirements woven into §18 State Design + §19. Cross-refs: [[cognitive-design]], [[behavioral-design]], [[anti-ai-slop]].
