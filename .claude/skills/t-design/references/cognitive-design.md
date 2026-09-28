# Cognitive Design Reference — `t-design`

Loaded by `t-design/SKILL.md` when a screen has non-trivial decisions, reading, or memory demands. Summarized rules, not source text. Sources: Johnson *Designing with the Mind in Mind*, Norman *Design of Everyday Things*, Kahneman *Thinking, Fast and Slow*, Weinschenk *100 Things Every Designer Needs to Know About People*.

---

## 1. Mental-model analysis (fill before designing any non-trivial flow)

For the primary flow, answer explicitly — put the answers in `Design.md §2 User Context`:

- **User goal** — what they came to accomplish (a verb + object, not "engage").
- **Starting knowledge** — what they already know; what they don't.
- **Expected vocabulary** — the words *they* use for domain objects (use these as labels).
- **Existing conventions** — apps they already know that set expectations (Jakob's Law).
- **Primary uncertainty** — the one thing they'll be unsure about.
- **Primary fear / risk** — what they're afraid will go wrong (data loss, cost, embarrassment, irreversible action).
- **Success signal** — how they'll know they succeeded.
- **Recovery expectation** — what they expect when something fails.

**Rule:** design to the user's mental model, not the system's data model. When the two diverge, the UI bridges the gap — the user must never be asked to think in database terms.

## 2. Cognitive load (minimize the *unnecessary* kind)

Three loads (Sweller): **intrinsic** (inherent task difficulty — can't remove, can sequence), **extraneous** (caused by the interface — remove ruthlessly), **germane** (effort that builds the user's model — preserve).

Reduce extraneous load by:
- **Chunking** — group related fields/actions; 5–9 items per group max before it needs structure.
- **Progressive disclosure** — show the common path; defer the rare/advanced behind a clear affordance.
- **Recognition over recall** — show options, don't make users remember them (menus > memorized commands; recent/suggested values > blank fields).
- **Sensible defaults** — the most common choice pre-selected; the user confirms rather than constructs.
- **One primary action per view** — visually dominant; everything else is secondary/tertiary.

Record a short **Cognitive Load Analysis** in `Design.md §8`: for each key screen name the intrinsic difficulty, the extraneous load you removed, and what you deliberately deferred.

## 3. Attention (it is scarce, serial, and change-driven)

- Users **scan, don't read** — in F/Z patterns; the top-left and the first words of lines carry weight.
- **Peripheral vision detects change/motion** — reserve motion for things that genuinely need attention; ambient motion becomes noise and then invisible.
- **Change blindness** — users miss changes that aren't near their focus; put confirmations and errors where the eye already is (near the action), not in a far corner.
- **One focal point per view.** Competing focal points = no focal point.

Record an **Attention Architecture** in `Design.md §7`: the single focal point per key screen, the intended scan order, and how secondary info recedes.

## 4. Interaction cost (every step is a tax)

Interaction cost = the physical + cognitive effort to reach a goal: clicks, taps, scrolls, keystrokes, field entries, decisions, waits, context switches, page loads, reads.

- Count the steps for the **dominant task**; each step must earn its place.
- Prefer **fewer decisions** over fewer screens (a decision is more expensive than a click).
- Eliminate: redundant confirmations, re-entered data, needless navigation, dead-end states.
- **Fitts's Law** — frequent/important targets: larger and closer to where the user already is; destructive targets: not adjacent to frequent ones.

Record an **Interaction Cost Analysis** in `Design.md §21`: step count for the dominant task and where cost was cut.

## 5. System 1 / System 2 (Kahneman)

- **System 1** (fast, automatic, pattern-matching) drives most UI use — leverage familiarity, clear affordances, and defaults so the easy path is the correct path.
- **System 2** (slow, deliberate) engages for consequential/irreversible actions — for those, *deliberately* add friction: confirmation, summary-before-commit, undo windows.
- Match the effort to the stakes: don't make routine actions effortful, don't make dangerous actions effortless.

## 6. Norman fundamentals (baseline, always apply)

- **Affordances & signifiers** — controls look like what they do; clickable looks clickable.
- **Mapping** — control layout mirrors real-world/spatial relationships.
- **Feedback** — every action produces immediate, visible response.
- **Constraints** — make wrong actions impossible or hard (disable, validate, guide).
- **Visibility** — the available actions and current state are visible, not hidden in memory.

## Output hooks

This reference feeds `Design.md` sections: **§2 User Context**, **§7 Attention Architecture**, **§8 Cognitive Load Analysis**, **§21 Interaction Cost Analysis**, and informs **§5 Information Architecture**. See also [[ux-heuristics]] for the HCI laws (Hick, Fitts, Jakob) and [[behavioral-design]] for choice architecture.
