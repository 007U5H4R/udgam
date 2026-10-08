import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVALS_DIR, type EvalCase } from './dataset';
import { REPO_ROOT } from './provenance';

// The one rule that authorises a change of the frozen verification config cfg-1 (EV13, CF-13; EXE34).
// Both the harness's CF-13 check (run.ts) and tests/config-freeze.test.ts call checkConfigFreeze, so the
// gate can never accept a drift the guard rejects.
//
// Once evals/results/baseline-v1.json exists, CONFIG_HASH must equal its provenance.config.hash, unless
// evals/config-changes.md has a table row whose FIRST cell is the new hash, naming a TP/EV decision that
// is recorded as ACCEPTED in decisions.md (a `## <ID> ` heading whose verdict, after its last " — ", reads
// "accepted"; a rejected, proposed or verdict-less heading authorises nothing: Stage 9 CR-205, EXE36 R-6) and, for every scenario the change affects, at least two NEW
// attack-case IDs (absent from baseline-v1) that exist in the dataset as ACTIVE attack cases of that
// scenario (evaluation-plan §10; a retired or pending_decision case runs in no gate, so it measures
// nothing). Rows and headings inside HTML comments or fenced code blocks do not count. A bare mention of the hash anywhere in decisions.md authorises nothing. Before
// baseline-v1 exists the guard passes vacuously. It fails closed: an unreadable or malformed baseline is
// a failure, never "absent".
//
// evals/config-changes.md format, one row per authorised config change:
//   | Config hash | Decision | Scenarios | New attack cases |
//   |---|---|---|---|
//   | <64-hex sha-256> | EV17 | 1, 3 | EVAL-150, EVAL-151, EVAL-152, EVAL-153 |

export const CONFIG_CHANGES_PATH = join(EVALS_DIR, 'config-changes.md');
export const DECISIONS_PATH = join(REPO_ROOT, 'decisions.md');
const BASELINE_FILE = 'baseline-v1.json';

export type Freeze = { ok: boolean; reason: string };
export type FreezeInput = {
  resultsDir: string;
  configHash: string;
  changesPath: string;
  decisionsPath: string;
  cases: Pick<EvalCase, 'id' | 'case_class' | 'scenario' | 'status'>[];
};

/**
 * The text a reader sees: HTML comments (`<!-- … -->`, even across lines) and fenced code blocks (``` or
 * ~~~) are blanked, so a row or a heading quoted inside one never counts (re-review nits R-6 / Q-8).
 */
export function visibleMarkdown(text: string): string {
  const noComments = text.replace(/<!--[\s\S]*?(?:-->|$)/g, (m) => m.replace(/[^\n]/g, ''));
  let fence: string | null = null;
  return noComments
    .split('\n')
    .map((line) => {
      const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (fence === null && f) {
        fence = f;
        return '';
      }
      if (fence !== null) {
        if (f && f[0] === fence[0] && f.length >= fence.length && line.trim() === f) fence = null;
        return '';
      }
      return line;
    })
    .join('\n');
}

/**
 * `## <ID> … — accepted…` on one line: the heading's verdict, the text after its LAST " — ", starts with
 * "accepted" (any case), as every decision heading in decisions.md is written. "accepted" in the title
 * or the body does not count.
 */
const acceptedHeading = (id: string): RegExp => new RegExp(`^## ${id} [^\\n]*— accepted\\b[^—\\n]*$`, 'im');

const readOrNull = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
};

/** The freeze guard (see the header). */
export function checkConfigFreeze(i: FreezeInput): Freeze {
  let text: string | null;
  try {
    text = readOrNull(join(i.resultsDir, BASELINE_FILE));
  } catch (e) {
    return { ok: false, reason: `baseline-v1 exists but cannot be read: ${(e as Error).message}` };
  }
  if (text === null) return { ok: true, reason: 'no baseline-v1 yet: the guard passes vacuously' };
  let baseline: { provenance?: { config?: { hash?: unknown } }; cases?: { id?: unknown }[] };
  try {
    baseline = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'baseline-v1 is not valid JSON' };
  }
  const frozen = baseline.provenance?.config?.hash;
  if (typeof frozen !== 'string' || !/^[0-9a-f]{64}$/.test(frozen)) return { ok: false, reason: 'baseline-v1 lacks provenance.config.hash' };
  if (!Array.isArray(baseline.cases)) return { ok: false, reason: 'baseline-v1 lacks cases' };
  if (frozen === i.configHash) return { ok: true, reason: `CONFIG_HASH equals the baseline-v1 hash ${frozen}` };

  const drift = `CONFIG_HASH ${i.configHash} differs from the baseline-v1 hash ${frozen}`;
  let changes: string | null;
  try {
    changes = readOrNull(i.changesPath);
  } catch (e) {
    return { ok: false, reason: `${drift}, and evals/config-changes.md cannot be read: ${(e as Error).message}` };
  }
  if (changes === null) return { ok: false, reason: `${drift}, and there is no evals/config-changes.md authorising it` };
  const cellsOf = (l: string) => l.split('|').slice(1, -1).map((c) => c.trim());
  const row = visibleMarkdown(changes)
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .map(cellsOf)
    .find((cells) => cells[0] === i.configHash);
  if (!row) return { ok: false, reason: `${drift}, and evals/config-changes.md does not list ${i.configHash}` };
  if (row.length < 4) return { ok: false, reason: `the config-changes row for ${i.configHash} needs 4 cells (hash | decision | scenarios | new attack cases)` };
  const [, decisionCell, scenarioCell, caseCell] = row as [string, string, string, string];

  const decision = /^(TP|EV)\d+$/.exec(decisionCell)?.[0];
  if (!decision) return { ok: false, reason: `${drift}: the row names no TP/EV decision (got "${decisionCell}")` };
  let decisions = '';
  try {
    decisions = readOrNull(i.decisionsPath) ?? '';
  } catch {
    decisions = ''; // unreadable: nothing is recorded (fails closed below)
  }
  if (!acceptedHeading(decision).test(visibleMarkdown(decisions))) return { ok: false, reason: `${drift}: decision ${decision} is not recorded as accepted in decisions.md` };

  const scenarios = [...scenarioCell.matchAll(/\d+/g)].map((m) => Number(m[0]));
  if (scenarios.length === 0) return { ok: false, reason: `${drift}: the row names no affected scenario` };
  const inBaseline = new Set(baseline.cases.map((c) => c.id));
  const byId = new Map(i.cases.map((c) => [c.id, c]));
  const listed = [...caseCell.matchAll(/EVAL-\d{3,}/g)].map((m) => m[0]);
  for (const s of scenarios) {
    const fresh = listed.filter((id) => {
      const c = byId.get(id);
      return c !== undefined && c.status === 'active' && c.case_class === 'attack' && c.scenario === s && !inBaseline.has(id);
    });
    if (new Set(fresh).size < 2) {
      return { ok: false, reason: `${drift}: scenario ${s} needs ≥ 2 new attack cases already in the dataset (and not in baseline-v1); found ${fresh.length === 0 ? 'none' : fresh.join(', ')}` };
    }
  }
  return { ok: true, reason: `${drift}, authorised by ${decision} with new attack cases for scenario(s) ${scenarios.join(', ')}` };
}
