import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  chooseWorld,
  monthBucket,
  parseS3Args,
  phaseSplit,
  planRuns,
  S3_MIN_COLD,
  S3_RUNS,
  S3_THRESHOLD_MS,
  scoreS3,
  suiteOf,
  WEAK_NETWORK,
  type RawTiming,
  type ScoredRun,
} from './perf-s3';

// TSK-29.1 (EVAL-070, S3): the scorer, the CLI arguments, the cold-cache selection and the phase split of
// the capture-to-verdict perf runner. Pure parts only; the browser runs need a server (pnpm eval:perf).

const run = (ms: number | null, cache: ScoredRun['cache'] = 'warm', outcome: ScoredRun['outcome'] = 'verdict'): ScoredRun => ({ ms, cache, outcome });
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
    expect(parseS3Args(['--suite=s3', '--target=https://udgam.example.org', '--formal'], {}).formal).toBe(true);
  });

  it('the weak-network profile is 1.5 Mbit/s up at 300 ms (reported, no gate)', () => {
    expect(WEAK_NETWORK).toMatchObject({ uploadMbps: 1.5, latencyMs: 300 });
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
    expect(chooseWorld('cold', worlds, new Set(['PL-A', 'PL-B']))?.plotId).toBe('PL-C');
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

  it('has no total and no split without both marks or without a capture request', () => {
    expect(phaseSplit({ ...raw, t1: null }).totalMs).toBeNull();
    const none = phaseSplit({ ...raw, captures: [] });
    expect(none.phases).toEqual({ gpsMs: 40, hashSignMs: null, resendMs: null, uploadMs: null, verifyMs: null, responseMs: null });
  });
});
