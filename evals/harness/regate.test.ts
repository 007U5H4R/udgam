import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDataset } from './dataset';
import { evaluate, regate, type ResultsFile } from './run';
import { verifyResult, WORLD, worldHarness } from './testing/release-world';

// regate (TASK-22 fix round 1, B-4): the release re-derives every harness gate from the file's own cases,
// the dataset and the thresholds in code, and lists every place the stored file disagrees. Expected
// values are fixed literals. No test TITLE names an EVAL ID (the release would count it as evidence).

const display = (r: ReturnType<typeof regate>) => Object.fromEntries(r.gates.map((g) => [g.id, `${g.display} ${g.pass ? 'PASS' : 'FAIL'}`]));
const clone = (h: ResultsFile): ResultsFile => JSON.parse(JSON.stringify(h)) as ResultsFile;

describe('regate: gates from the cases, not the stored flags', () => {
  it('an honest file regates to its own gates with no problems', () => {
    const r = regate(worldHarness(), WORLD, 'M1');
    expect(display(r)).toEqual({ S1: '100.0 % (4/4) PASS', 'S1-floor': '100.0 % PASS', S2: '0.0 % (0/1) PASS', 'S6-lib': '100.0 % (1/1) PASS', S7: 'Yes PASS', CF: '0 PASS' });
    expect(r.problems).toEqual([]);
  });

  it('a flipped pass flag is found, and the recomputed gate decides', () => {
    const h = clone(worldHarness({ undetected: ['EVAL-001'] }));
    const s1 = h.gates.find((g) => g.id === 'S1')!;
    expect(s1).toMatchObject({ display: '75.0 % (3/4)', pass: false });
    s1.pass = true;
    h.summary.exitCode = 0;
    const r = regate(h, WORLD, 'M1');
    expect(display(r).S1).toBe('75.0 % (3/4) FAIL');
    expect(r.problems).toContain('gate S1: the file says 75.0 % (3/4) PASS, its cases give 75.0 % (3/4) FAIL');
    expect(r.problems).toContain('summary.exitCode 0 contradicts the recomputed gates (FAIL)');
  });

  it('a case flipped to passed is found from its own verify() result', () => {
    const h = clone(worldHarness({ undetected: ['EVAL-001'] }));
    const c = h.cases.find((x) => x.id === 'EVAL-001')!;
    Object.assign(c, { outcome: 'passed', detected: true });
    const r = regate(h, WORLD, 'M1');
    expect(r.problems).toContain('EVAL-001 says passed, its verify() result gives failed');
    expect(r.problems).toContain('EVAL-001 says detected=true, its verify() result gives false');
    expect(display(r).S1).toBe('75.0 % (3/4) FAIL');
  });

  it('dataset facts come from the dataset: re-classing an attack case does not drop it from S1', () => {
    const h = clone(worldHarness({ undetected: ['EVAL-002'] }));
    Object.assign(h.cases.find((x) => x.id === 'EVAL-002')!, { caseClass: 'legitimate_edge', scenario: null });
    expect(display(regate(h, WORLD, 'M1')).S1).toBe('75.0 % (3/4) FAIL');
  });

  it('a verifier case that claims a verdict without a result, and a proof case with a failed assertion, are problems', () => {
    const h = clone(worldHarness());
    h.cases.find((x) => x.id === 'EVAL-005')!.result = null;
    h.cases.find((x) => x.id === 'EVAL-058')!.assertions[0]!.pass = false;
    const r = regate(h, WORLD, 'M1');
    expect(r.problems).toContain('EVAL-005 says passed without a verify() result');
    expect(r.problems).toContain('EVAL-058 says passed, but its assertions do not all pass');
    expect(display(r)).toMatchObject({ S2: '100.0 % (1/1) FAIL', 'S6-lib': '0.0 % (0/1) FAIL' });
  });

  it('a hidden network call or a dropped case fails S7 and fires CF-12 again', () => {
    const h = clone(worldHarness());
    h.runtime.networkCalls = ['https://example.invalid/'];
    h.cases = h.cases.filter((x) => x.id !== 'EVAL-003');
    const r = regate(h, WORLD, 'M1');
    expect(display(r)).toMatchObject({ S7: 'No FAIL', CF: '1 FAIL' });
    expect(r.criticalConditions.map((f) => f.id)).toEqual(['CF-12']);
    expect(r.problems).toContain('critical conditions: the file says none, its cases give CF-12');
  });

  it('problems the file recorded about earlier results files are kept (only stricter)', () => {
    const h = clone(worldHarness());
    h.totals.problems = ['results file evals/results/eval-run-x.json is not valid JSON (…)'];
    expect(display(regate(h, WORLD, 'M1')).S7).toBe('No FAIL');
  });

  it('CF-13 is judged now, from the drift the release passes in', () => {
    const r = regate(worldHarness(), WORLD, 'M1', { baselineHash: 'f'.repeat(64), currentHash: 'e'.repeat(64), authorised: false });
    expect(r.criticalConditions.map((f) => f.id)).toEqual(['CF-13']);
    expect(display(r).CF).toBe('1 FAIL');
  });

  it('a stored assertion verdict is irrelevant: the result decides', () => {
    const h = clone(worldHarness());
    h.cases.find((x) => x.id === 'EVAL-004')!.result = verifyResult('Verified', 'ok');
    expect(regate(h, WORLD, 'M1').problems).toContain('EVAL-004 says passed, its verify() result gives failed');
  });
});

describe('regate on a real harness run', () => {
  it('reproduces every gate of a full M1 run over the repository dataset, with no problems', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'udgam-regate-'));
    try {
      const r = JSON.parse(JSON.stringify(await evaluate({ seed: 7, resultsDir: dir }))) as ResultsFile; // as read back from disk
      const re = regate(r, loadDataset(), 'M1');
      expect(re.problems).toEqual([]);
      expect(re.gates.map((g) => [g.id, g.display, g.pass])).toEqual(r.gates.map((g) => [g.id, g.display, g.pass]));
      expect(re.criticalConditions).toEqual(r.criticalConditions);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
