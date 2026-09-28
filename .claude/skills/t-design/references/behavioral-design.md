# Behavioral Design Reference — `t-design`

Loaded when a flow has a **decision, funnel, multi-step task, or motivation problem**. Choice architecture that respects the user. Every principle here is paired with the **ethical gate** at the end — apply none of these to extract behavior against the user's interest.

---

## Principle library (select only what the flow warrants; record choices in `Design.md §9`)

### Goal Gradient Effect
Motivation increases with proximity to a goal. **Use:** progress indicators for multi-step tasks; show endowed progress (start the user partway, e.g. "1 of 5 done" for an already-completed prerequisite) *only when true*. **Don't:** invent fake progress or infinite goals.

### Peak-End Rule
People judge an experience by its emotional **peak** and its **end**, not the average. **Use:** engineer one moment of delight/competence at the peak (the "aha" or first success) and a clean, affirming end (clear confirmation, what-happens-next). **Don't:** end on a dead-end, an upsell wall, or ambiguity. Map this in `Design.md §4 Emotional Journey`.

### Von Restorff (Isolation) Effect
The distinct item is remembered and chosen. **Use:** make the single primary action visually distinct; make the recommended plan stand out. **Don't:** make five things all "stand out" (then none do) — one emphasis per view.

### Choice Overload (Hick's Law's cousin)
Too many equally-weighted options → paralysis and regret. **Use:** curate, recommend a default, group, or stage choices. Prefer 3–5 meaningful options over 12 flat ones. **Don't:** dump every option at equal weight. See [[ux-heuristics]] Hick's Law.

### Serial Position Effect
First and last items are remembered best. **Use:** put the most important nav items / list entries first and last; bury the least important in the middle. Applies to menus, onboarding steps, feature lists.

### Zeigarnik Effect
Unfinished tasks create mental tension that pulls users back. **Use:** show incomplete state honestly (checklist with remaining items, "profile 60% complete" *when accurate*), saved drafts, resumable flows. **Don't:** manufacture artificial incompleteness or nag.

### Labor Illusion — **USE ETHICALLY ONLY**
People value outcomes more when they *see* the work behind them. **Use ONLY when the work is real:** show the actual stages of a genuinely running process ("Retrieving sources → Comparing clauses → Drafting summary") so the wait is legible. **Never:** fabricate delay or fake "AI thinking" to seem more valuable — that is a dark pattern (see [[anti-ai-slop]] §Real Process Transparency).

## Psychology principle selection by product type

| Product type | Likely-relevant principles |
|--------------|----------------------------|
| Simple landing / marketing | Peak-End, Von Restorff (one CTA), Jakob, visual hierarchy, aesthetic-usability; heavy anti-slop scrutiny |
| Onboarding / multi-step | Goal Gradient, Zeigarnik, Serial Position, progressive disclosure, cognitive-load chunking |
| Enterprise dashboard | Hick/Choice-Overload (curate), Tesler (product absorbs complexity), recognition-over-recall, information density, error prevention |
| Transactional / checkout / finance | Trust design, System-2 friction on commit, error psychology, reversibility, no dark patterns |
| AI / RAG / agent | Epistemic UX (citations/provenance/uncertainty), real process transparency, trust, honest limits |

Pick only what fits, then pass the gate below.

## Ethical Behavioral Design Gate (MANDATORY — every behavioral choice passes this)

Before including any principle above, confirm **all** of:

- [ ] It helps the user accomplish **their own** goal, not just the business's.
- [ ] It is **truthful** — no fabricated progress, scarcity, social proof, urgency, or metrics.
- [ ] The user can **decline / reverse / ignore** it without penalty or trickery.
- [ ] It does **not** exploit fear, shame, addiction, or FOMO.
- [ ] The **easy path** and the **honest path** are the same path.

**Banned outright (dark patterns):** confirmshaming, forced continuity, roach-motel cancellation, disguised ads, sneak-into-basket, fake countdowns, fake "X people viewing," pre-checked consent, bait-and-switch, obstruction. If a request implies one, refuse it and note why in `decisions.md`.

## Output hooks

Feeds `Design.md` **§9 Behavioral & Psychological Design Rationale** (list each principle used + why + the ethical-gate pass) and **§4 Emotional Journey** (peak-end). Cross-refs: [[emotional-design]], [[ux-heuristics]], [[anti-ai-slop]]. The **Psychology Principle Selection Table** in `SKILL.md` maps product type → likely-relevant principles.
