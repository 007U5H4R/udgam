import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stageEndMark, stageStartMark } from '../../src/client/stage-client';
import { T0_MARK } from '../../src/components/field/WeightStep';
import { T1_MARK, VERDICT_IN_MARK } from '../../src/components/ui/VerdictScreen';
import {
  chooseWorld,
  finalVerdict,
  formalRefusal,
  judgeOutcome,
  monthBucket,
  parseS3Args,
  phaseSplit,
  planRuns,
  S3_MARKS,
  S3_MIN_COLD,
  S3_RUNS,
  S3_THRESHOLD_MS,
  scoreS3,
  suiteOf,
  terminalOf,
  type Phases,
  type RawTiming,
  type S3Args,
  type ScoredRun,
} from './perf-s3';

// TSK-29.1 (EVAL-070, S3): the scorer, the CLI arguments, the cold-cache selection and the phase split of
// the capture-to-verdict perf runner. Pure parts only; the browser runs need a server (pnpm eval:perf).

const SPLIT: Phases = { gpsMs: 20, hashSignMs: 8, resendMs: 0, uploadMs: 4, verifyMs: 250, responseMs: 620 };
const run = (ms: number | null, cache: ScoredRun['cache'] = 'warm', outcome: ScoredRun['outcome'] = 'verdict', phases: Phases = SPLIT, uploadVerifyMs: number | null = null): ScoredRun => ({
  ms,
  cache,
  outcome,
  phases,
  uploadVerifyMs,
});
/** 20 runs, the first 5 cold, at the given times. */
const gateRuns = (times: number[]) => times.map((ms, i) => run(ms, i < 5 ? 'cold' : 'warm'));

describe('S3 scorer (EVAL-070)', () => {
  it('takes its threshold from EVAL-070 (30 s), its run count from evaluation-plan §4.3 (20, at least 5 cold)', () => {
    const dataset = JSON.parse(readFileSync('evals/eval-dataset.json', 'utf8')) as { cases: { id: string; expected: { max_latency_ms?: number } }[] };
    expect(S3_THRESHOLD_MS).toBe(dataset.cases.find((c) => c.id === 'EVAL-070')!.expected.max_latency_ms);
    expect(S3_THRESHOLD_MS).toBe(30_000);
    expect(S3_RUNS).toBe(20);
    expect(S3_MIN_COLD).toBe(5);
  });

  it('reports max, p50 and p95 (linear interpolation, R-7)', () => {
    const s = scoreS3(gateRuns(Array.from({ length: 20 }, (_, i) => (i + 1) * 1000)));
    expect(s).toMatchObject({ n: 20, verdicts: 20, p50: 10_500, p95: 19_050, max: 20_000, thresholdMs: 30_000, coldRuns: 5, warmRuns: 15 });
    expect(s.pass).toBe(true);
    expect(s.reasons).toEqual([]);
  });

  it('passes when every run is at most 30 s: exactly 30 000 ms passes, 30 001 ms fails', () => {
    expect(scoreS3(gateRuns([...Array(19).fill(12_000), 30_000])).pass).toBe(true);
    const over = scoreS3(gateRuns([...Array(19).fill(12_000), 30_001]));
    expect(over.pass).toBe(false);
    expect(over.allWithinThreshold).toBe(false);
    expect(over.max).toBe(30_001);
    expect(over.reasons).toContain('run 20: 30001 ms > 30000 ms');
  });

  it('fails a run that never showed the verdict card, whatever the other times', () => {
    const runs = gateRuns(Array(20).fill(9_000));
    runs[3] = run(null, 'cold', 'timeout');
    const s = scoreS3(runs);
    expect(s.pass).toBe(false);
    expect(s.verdicts).toBe(19);
    expect(s.n).toBe(20);
    expect(s.max).toBe(9_000);
    expect(s.reasons).toContain('run 4: no verdict card (timeout)');
  });

  it('is not a gate pass with fewer than 20 runs or fewer than 5 cold-cache runs, even when every run is fast', () => {
    const short = scoreS3(gateRuns(Array(6).fill(8_000)));
    expect(short.allWithinThreshold).toBe(true);
    expect(short.pass).toBe(false);
    expect(short.reasons).toContain('6 runs < 20: not a gate run');
    const warm = scoreS3(Array.from({ length: 20 }, (_, i) => run(8_000, i < 4 ? 'cold' : i === 4 ? 'unknown' : 'warm')));
    expect(warm.pass).toBe(false);
    expect(warm).toMatchObject({ coldRuns: 4, warmRuns: 15, unknownCacheRuns: 1 });
    expect(warm.reasons).toContain('4 cold-cache runs < 5');
  });

  it('has no percentiles when no run reached a verdict', () => {
    const s = scoreS3([run(null, 'cold', 'error')]);
    expect(s).toMatchObject({ n: 1, verdicts: 0, p50: null, p95: null, max: null, pass: false, allWithinThreshold: false });
  });

  it('compares the unrounded time: 30 000.4 ms fails although it reports as 30 000', () => {
    const s = scoreS3(gateRuns([...Array(19).fill(12_000), 30_000.4]));
    expect(s.pass).toBe(false);
    expect(s.reasons).toContain('run 20: 30000.4 ms > 30000 ms');
  });

  it('fails a verdict run whose latency split is missing (EVAL-070 failure condition)', () => {
    const missing = gateRuns(Array(20).fill(9_000));
    missing[2] = run(9_000, 'cold', 'verdict', { ...SPLIT, gpsMs: null, responseMs: null });
    const s = scoreS3(missing);
    expect(s.pass).toBe(false);
    expect(s.allWithinThreshold).toBe(false);
    expect(s.reasons).toContain('run 3: latency split missing (gpsMs, responseMs)');

    const noUpload = gateRuns(Array(20).fill(9_000));
    noUpload[7] = run(9_000, 'warm', 'verdict', { ...SPLIT, uploadMs: null, verifyMs: null });
    expect(scoreS3(noUpload).reasons).toContain('run 8: latency split missing (uploadMs+verifyMs or uploadVerifyMs)');

    // Upload and verify unsplit, but their sum is known: the split is present.
    const joined = gateRuns(Array(20).fill(9_000));
    joined[7] = run(9_000, 'warm', 'verdict', { ...SPLIT, uploadMs: null, verifyMs: null }, 254);
    expect(scoreS3(joined).pass).toBe(true);
  });
});

describe('run outcome (a refusal is not a verdict)', () => {
  it('reads the terminal NDJSON line of the capture answer', () => {
    expect(terminalOf('{"t":"check","id":"geofence","status":"ok"}\n{"t":"verdict","eventId":"E-1","verdict":"Rejected","score":30,"checks":[]}\n')).toEqual({ t: 'verdict', verdict: 'Rejected' });
    expect(terminalOf('{"t":"rejected","reason":"rate_limited","status":429,"retryAfterSec":60}\n')).toEqual({ t: 'rejected', reason: 'rate_limited' });
    expect(terminalOf('{"t":"check","id":"geofence","status":"ok"}\n{"t":"error","retryable":true}\n')).toEqual({ t: 'error' });
    expect(terminalOf('<html>proxy</html>')).toBeNull();
    expect(terminalOf('{"t":"check","id":"geofence","status":"ok"}\n')).toBeNull();
  });

  it('a verdict line on a 2xx answer is a verdict, a verifier Rejected included', () => {
    expect(judgeOutcome({ cardVisible: true, status: 200, terminal: { t: 'verdict', verdict: 'Rejected' }, verdictIn: true })).toEqual({ outcome: 'verdict', reason: null });
    // body unreadable, but 2xx and the app marked the verdict in
    expect(judgeOutcome({ cardVisible: true, status: 200, terminal: null, verdictIn: true })).toEqual({ outcome: 'verdict', reason: null });
  });

  it('a boundary refusal shown on the verdict screen is an error, not a timed verdict', () => {
    expect(judgeOutcome({ cardVisible: true, status: 429, terminal: { t: 'rejected', reason: 'rate_limited' }, verdictIn: true })).toEqual({
      outcome: 'error',
      reason: 'capture answered HTTP 429 (rate_limited): a refusal, not a verdict',
    });
    expect(judgeOutcome({ cardVisible: true, status: 401, terminal: { t: 'rejected', reason: 'bad_signature' }, verdictIn: true }).outcome).toBe('error');
    expect(judgeOutcome({ cardVisible: true, status: 200, terminal: { t: 'error' }, verdictIn: false })).toEqual({ outcome: 'error', reason: 'capture stream ended with error, not a verdict line' });
    expect(judgeOutcome({ cardVisible: true, status: 200, terminal: null, verdictIn: false })).toEqual({ outcome: 'error', reason: 'no verdict line and no udgam:verdict-in mark' });
    expect(judgeOutcome({ cardVisible: true, status: null, terminal: null, verdictIn: true })).toEqual({ outcome: 'error', reason: 'no /api/capture response recorded' });
    expect(judgeOutcome({ cardVisible: false, status: 200, terminal: null, verdictIn: false })).toEqual({ outcome: 'timeout', reason: null });
  });
});

describe('final verdict and formal preconditions', () => {
  const formalArgs: S3Args = { target: 'https://udgam.example.org', runs: 20, cold: 5, weakRuns: 3, immediateRuns: 5, submit: 'after-staging', dataDir: './data', formal: true };
  const live = { gfw: 'ok', sentinelHub: 'ok' };
  const clean = { dirty: false, changes: [] };
  const ok = { args: formalArgs, formalFileExists: false, tree: clean, ci: false, providers: live };

  it('a formal run starts only from a clean tree, outside CI, with no existing file, after-staging, and live providers', () => {
    expect(formalRefusal(ok)).toBeNull();
    expect(formalRefusal({ ...ok, formalFileExists: true })).toMatch(/refusing to overwrite .*perf results are never rewritten/);
    expect(formalRefusal({ ...ok, tree: { dirty: true, changes: [' M evals/perf/run.ts'] } })).toMatch(/--formal needs a clean tree at one commit \(1 change\(s\)\)/);
    expect(formalRefusal({ ...ok, args: { ...formalArgs, submit: 'immediate' } })).toMatch(/--formal is the gate run: .*--submit=after-staging/);
    expect(formalRefusal({ ...ok, ci: true })).toMatch(/--formal is never run in CI/);
    expect(formalRefusal({ ...ok, providers: { gfw: 'fixture', sentinelHub: 'fixture' } })).toMatch(/--formal needs live providers: \/api\/health says gfw=fixture, sentinelHub=fixture/);
    expect(formalRefusal({ ...ok, providers: { gfw: 'ok', sentinelHub: 'error' } })).toMatch(/live providers/);
    expect(formalRefusal({ ...ok, providers: 'unknown' })).toMatch(/live providers: \/api\/health unreadable/);
  });

  it('checks nothing for a local (non-formal) run', () => {
    expect(formalRefusal({ args: { ...formalArgs, formal: false, target: 'http://localhost:4780' }, formalFileExists: true, tree: { dirty: true, changes: ['x'] }, ci: true, providers: 'unknown' })).toBeNull();
  });

  it('a formal run fails when the providers are not all ok after the runs; a local run is judged on its runs only', () => {
    const passing = scoreS3(gateRuns(Array(20).fill(9_000)));
    expect(finalVerdict(passing, { formal: true, providersAfter: live })).toEqual({ pass: true, reasons: [] });
    expect(finalVerdict(passing, { formal: true, providersAfter: { gfw: 'ok', sentinelHub: 'error' } })).toEqual({
      pass: false,
      reasons: ['providers not all ok after the runs: gfw=ok, sentinelHub=error'],
    });
    expect(finalVerdict(passing, { formal: false, providersAfter: { gfw: 'fixture', sentinelHub: 'fixture' } })).toEqual({ pass: true, reasons: [] });
    const failing = scoreS3(gateRuns(Array(6).fill(9_000)));
    expect(finalVerdict(failing, { formal: false, providersAfter: live })).toEqual({ pass: false, reasons: failing.reasons });
  });
});

describe('mark names', () => {
  it('are the app’s own (no drift between the runner and the capture flow)', () => {
    expect(S3_MARKS.t0).toBe(T0_MARK);
    expect(S3_MARKS.t1).toBe(T1_MARK);
    expect(S3_MARKS.verdictIn).toBe(VERDICT_IN_MARK);
    for (const slot of [0, 1, 2]) {
      expect(`${S3_MARKS.stageStartPrefix}${slot}`).toBe(stageStartMark(slot));
      expect(`${S3_MARKS.stageEndPrefix}${slot}`).toBe(stageEndMark(slot));
    }
  });
});

describe('perf CLI arguments', () => {
  it('picks the suite from --suite or --only, S4 by default; a conflict is an error', () => {
    expect(suiteOf([])).toBe('s4');
    expect(suiteOf(['--only=s4'])).toBe('s4');
    expect(suiteOf(['--suite=s3'])).toBe('s3');
    expect(suiteOf(['--only=s3', '--target=http://x'])).toBe('s3');
    expect(suiteOf(['--suite=s3', '--only=s3'])).toBe('s3');
    expect(() => suiteOf(['--suite=s3', '--only=s4'])).toThrow(/--suite=s3 and --only=s4 disagree/);
  });

  it('S3 defaults: 20 runs, 5 cold, 3 weak-network runs, Submit after staging, local output, data dir from the environment', () => {
    expect(parseS3Args(['--suite=s3', '--target=http://localhost:4780'], { DATA_DIR: '/srv/data' })).toEqual({
      target: 'http://localhost:4780',
      runs: 20,
      cold: 5,
      weakRuns: 3,
      immediateRuns: 0,
      submit: 'after-staging',
      dataDir: '/srv/data',
      formal: false,
    });
    expect(parseS3Args(['--suite=s3', '--target=http://localhost:4780'], {}).dataDir).toBe('./data');
  });

  it('S3 takes --runs, --cold, --weak-runs, --submit and --data-dir', () => {
    expect(parseS3Args(['--suite=s3', '--target=http://localhost:4780', '--runs=6', '--cold=3', '--weak-runs=0', '--submit=immediate', '--data-dir=/tmp/d'], {})).toMatchObject({
      runs: 6,
      cold: 3,
      weakRuns: 0,
      submit: 'immediate',
      dataDir: '/tmp/d',
    });
    expect(parseS3Args(['--suite=s3', '--target=http://localhost:4780', '--runs=3'], {}).cold).toBe(3); // never more cold runs than runs
  });

  it('S3 refuses a bad target, run count, cold count, weak count, submit mode, an unknown flag and --out', () => {
    const t = '--target=http://localhost:4780';
    expect(() => parseS3Args(['--suite=s3'], {})).toThrow(/--target=<http\(s\) url> is required/);
    expect(() => parseS3Args(['--suite=s3', '--target=ftp://x'], {})).toThrow(/--target/);
    expect(() => parseS3Args(['--suite=s3', t, '--runs=0'], {})).toThrow(/--runs must be a positive integer/);
    expect(() => parseS3Args(['--suite=s3', t, '--runs=2.5'], {})).toThrow(/--runs/);
    expect(() => parseS3Args(['--suite=s3', t, '--runs=6', '--cold=7'], {})).toThrow(/--cold must be an integer from 1 to --runs/);
    expect(() => parseS3Args(['--suite=s3', t, '--cold=0'], {})).toThrow(/--cold/);
    expect(() => parseS3Args(['--suite=s3', t, '--runs=40', '--cold=2'], {})).toThrow(/at most 10 runs per seeded agent/);
    expect(() => parseS3Args(['--suite=s3', t, '--weak-runs=-1'], {})).toThrow(/--weak-runs must be a non-negative integer/);
    expect(() => parseS3Args(['--suite=s3', t, '--submit=later'], {})).toThrow(/--submit must be after-staging or immediate/);
    expect(() => parseS3Args(['--suite=s3', t, '--path=/verify/x'], {})).toThrow(/unknown flag --path/);
    expect(() => parseS3Args(['--suite=s3', t, '--out=evals/results/x.json'], {})).toThrow(/--out is S4's; S3 writes evals\/results\/local\/ or, with --formal, the baseline/);
  });

  it('S3 --formal only against a production HTTPS host, never a local one', () => {
    expect(() => parseS3Args(['--suite=s3', '--target=http://localhost:4780', '--formal'], {})).toThrow(/--formal needs an https production target/);
    expect(() => parseS3Args(['--suite=s3', '--target=https://localhost:4780', '--formal'], {})).toThrow(/--formal needs an https production target/);
    expect(() => parseS3Args(['--suite=s3', '--target=https://127.0.0.1', '--formal'], {})).toThrow(/--formal/);
    expect(() => parseS3Args(['--suite=s3', '--target=http://udgam.example.org', '--formal'], {})).toThrow(/--formal/);
    expect(() => parseS3Args(['--suite=s3', '--target=https://udgam.example.org', '--formal', '--runs=10'], {})).toThrow(/--formal is the gate run: 20 runs, at least 5 cold/);
    expect(parseS3Args(['--suite=s3', '--target=https://udgam.example.org', '--formal'], {})).toMatchObject({ formal: true, immediateRuns: 5 });
    expect(() => parseS3Args(['--suite=s3', '--target=https://udgam.example.org', '--formal', '--immediate-runs=2'], {})).toThrow(/--formal also reports at least 5 --submit=immediate runs/);
  });

  it('S3 refuses a value on --formal, a repeated flag, a value flag with no value and an unparseable --target', () => {
    const t = '--target=http://localhost:4780';
    expect(() => parseS3Args(['--suite=s3', '--target=https://udgam.example.org', '--formal=yes'], {})).toThrow(/--formal takes no value/);
    expect(() => parseS3Args(['--suite=s3', t, '--runs=5', '--runs=20'], {})).toThrow(/--runs is given more than once/);
    expect(() => parseS3Args(['--suite=s3', t, t], {})).toThrow(/--target is given more than once/);
    expect(() => parseS3Args(['--suite=s3', t, '--runs'], {})).toThrow(/--runs needs a value/);
    expect(() => parseS3Args(['--suite=s3', '--target=http://exa mple.org'], {})).toThrow(/--target=<http\(s\) url> is required/);
    expect(() => parseS3Args(['--suite=s3', '--target=http://[::1'], {})).toThrow(/--target/);
  });

  it('S3 takes --immediate-runs for an ungated worst-case series (0 by default outside --formal)', () => {
    expect(parseS3Args(['--suite=s3', '--target=http://localhost:4780', '--immediate-runs=2'], {}).immediateRuns).toBe(2);
    expect(() => parseS3Args(['--suite=s3', '--target=http://localhost:4780', '--immediate-runs=x'], {})).toThrow(/--immediate-runs must be a non-negative integer/);
  });
});

describe('cold-cache selection', () => {
  it('plans the cold runs first, then the warm ones', () => {
    expect(planRuns(7, 3)).toEqual(['cold', 'cold', 'cold', 'warm', 'warm', 'warm', 'warm']);
    expect(planRuns(20, 5).filter((x) => x === 'cold')).toHaveLength(5);
    expect(planRuns(5, 5)).toEqual(Array(5).fill('cold'));
  });

  it('a cold run takes an unused plot with no harvest-window cache row this month', () => {
    const worlds = [
      { index: 0, plotId: 'PL-A', runs: 1 },
      { index: 1, plotId: 'PL-B', runs: 0 },
      { index: 2, plotId: 'PL-C', runs: 0 },
    ];
    expect(chooseWorld('cold', worlds, new Set(['PL-A', 'PL-B']))).toBe(worlds[2]); // the world itself, not a copy
    expect(chooseWorld('cold', worlds, new Set(['PL-A', 'PL-B', 'PL-C']))).toBeNull();
  });

  it('a warm run takes the least-used plot that has a cache row, within the per-agent run cap', () => {
    const worlds = [
      { index: 0, plotId: 'PL-A', runs: 3 },
      { index: 1, plotId: 'PL-B', runs: 2 },
      { index: 2, plotId: 'PL-C', runs: 1 },
    ];
    expect(chooseWorld('warm', worlds, new Set(['PL-A', 'PL-B']))?.plotId).toBe('PL-B');
    expect(chooseWorld('warm', worlds, new Set())).toBeNull();
    expect(chooseWorld('warm', [{ index: 0, plotId: 'PL-A', runs: 10 }], new Set(['PL-A']))).toBeNull();
  });

  it('the month bucket is the IST month the harvest-window check keys on', () => {
    expect(monthBucket(new Date('2026-10-31T18:29:59Z'))).toBe('2026-10');
    expect(monthBucket(new Date('2026-10-31T18:30:00Z'))).toBe('2026-11');
  });
});

describe('phase split', () => {
  const raw: RawTiming = {
    t0: 1000,
    t1: 9000,
    verdictIn: 8300,
    signs: [
      { start: 500, end: 510 }, // before Send (not this picking)
      { start: 1040, end: 1060 },
    ],
    digests: [
      { start: 100, end: 160, bytes: 4_194_304 },
      { start: 300, end: 350, bytes: 4_194_304 },
    ],
    stage: { start: [200, 400, 600], end: [700, 750, 900] },
    captures: [{ start: 1100, requestStart: 1110, responseStart: 2400, responseEnd: 8200, sendMs: 290 }],
  };

  it('splits t0→t1 into GPS, hash+sign, upload, verify and response, which add up to the total', () => {
    const s = phaseSplit(raw);
    expect(s.totalMs).toBe(8000);
    expect(s.phases).toEqual({ gpsMs: 40, hashSignMs: 60, resendMs: 0, uploadMs: 300, verifyMs: 6800, responseMs: 800 });
    const p = s.phases;
    expect(p.gpsMs! + p.hashSignMs! + p.resendMs! + p.uploadMs! + p.verifyMs! + p.responseMs!).toBe(s.totalMs);
    expect(s.detail).toMatchObject({ serverFirstLineMs: 1000, verdictRenderMs: 100, holdMs: 700, photoHashMs: 110, stagingMs: 700, captureRequests: 1 });
  });

  it('a resend after 409 media_not_staged is its own phase; upload and verify are the last request', () => {
    const s = phaseSplit({ ...raw, captures: [{ start: 1100, requestStart: 1105, responseStart: 1500, responseEnd: 1520, sendMs: 10 }, { ...raw.captures[0]!, start: 1600, requestStart: 1610 }] });
    expect(s.phases).toMatchObject({ gpsMs: 40, hashSignMs: 60, resendMs: 500, uploadMs: 300, verifyMs: 6300, responseMs: 800 });
    expect(s.detail.captureRequests).toBe(2);
  });

  it('leaves upload and verify unsplit (null) when the browser gave no send timing', () => {
    const s = phaseSplit({ ...raw, captures: [{ ...raw.captures[0]!, sendMs: null }] });
    expect(s.phases.uploadMs).toBeNull();
    expect(s.phases.verifyMs).toBeNull();
    expect(s.detail.uploadVerifyMs).toBe(7100);
  });

  it('keeps the unrounded total for the gate beside the rounded one for the report', () => {
    const s = phaseSplit({ ...raw, t1: 31_000.4 });
    expect(s.exactMs).toBeCloseTo(30_000.4, 6);
    expect(s.totalMs).toBe(30_000);
  });

  it('has no total and no split without both marks or without a capture request', () => {
    expect(phaseSplit({ ...raw, t1: null }).totalMs).toBeNull();
    const none = phaseSplit({ ...raw, captures: [] });
    expect(none.phases).toEqual({ gpsMs: 40, hashSignMs: null, resendMs: null, uploadMs: null, verifyMs: null, responseMs: null });
  });
});
