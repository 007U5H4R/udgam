import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { BrowserContext, Page, Response } from '@playwright/test';
import type { SeededCapture } from '../../e2e/helpers/seed-capture';
import { istDate } from '../../src/lib/format';
import { argOf, chromiumLaunchOptions, perfProvenance } from '../perf/cli';
import { applyReferenceProfile, EV9_NETWORK, type Network } from '../perf/network';
import { writePerfResult } from '../perf/output';
import { summarizeLatency } from '../scorers/latency';
import { REPO_ROOT } from './provenance';
import { RESULTS_DIR } from './results';
import { treeState } from './tree-state';

// S3 capture-to-verdict perf runner (EVAL-070, evaluation-plan §4.3, EV9; technical-plan TSK-29.1), behind
//
//   pnpm eval:perf --suite=s3 --target=<url> [--runs=20] [--cold=5] [--weak-runs=3] [--immediate-runs=0]
//                  [--submit=after-staging|immediate] [--data-dir=<target's DATA_DIR>] [--formal]
//
// Each run is one picking in Playwright Chromium at 375 × 812: three AI-generated demo photos
// (assets/demo-photos, TP29: never evidence) padded to the 4 MB placeholder size, the phone's GPS mocked
// inside a seeded plot, Chromium CDP network emulation at the EV9 placeholder profile (10/5 Mbit/s, 80 ms).
// HR3 was waived (TP29), so the photo size and the network profile are ASSUMPTIONS, and the result says so.
// t0 = the Send tap (`udgam:t0-submit`, marked in its click handler), t1 = the verdict card visible
// (`udgam:t1-verdict`, marked once the verdict screen's heading has mounted). Gate (EVAL-070): every one of
// 20 runs reaches the verdict card in ≤ 30 s with its latency split recorded, at least 5 of them with a
// cold harvest-window cache. A run counts only if the capture answered 2xx with a verdict line: a boundary
// refusal (429, a bad signature, …) also ends on the verdict screen ("Not accepted"), but it is an error
// here, not a timed verdict. A verifier Rejected verdict is a verdict.
//
// Seeding, as S4 does (evals/perf/fixtures.ts): the target's own DATA_DIR (--data-dir) is written by the
// capture-world seeder the e2e specs use (e2e/helpers/seed-capture.ts, in a child process): per seeded
// world one organisation, one agent (random test-only password), one enrolled phone (test-only key,
// injected into the browser's IndexedDB) and one plot with the P01 fixture geometry. The secrets stay in
// this process's memory; they are never printed or written.
//
// Cold cache: the harvest-window NDVI answer is cached per plot and IST month (remote-sensing/cache.ts).
// The runner reads the target's remote_sensing_cache table just before each Send: a run whose plot has no
// `ndvi_window` row for this month is cold, otherwise warm (unknown when the table cannot be read). It
// seeds one world per planned cold run, takes a world with no row for each cold run and the least-used
// world with a row for each warm run. Seeded plots have no registration cache either, so on a cold run
// forest loss and the NDVI history are fetched too (colder than §4.3's registered plot).
//
// Phase split, from what the browser exposes (no app change): page marks, Resource Timing of the
// POST /api/capture fetch, CDP send timing, and an init script that times crypto.subtle.sign and the
// photo digests. See phaseSplit. Reported without a gate: weak-network runs (1.5 Mbit/s up, 300 ms) and
// --submit=immediate runs (Send right after the weight: the photos go inside t0→t1, the worst case).
//
// Output: evals/results/local/perf-s3-<sha>.json (git-ignored, replaced on a re-run). --formal writes
// evals/results/baseline-perf-v1-s3-<sha>.json, once: only from a clean tree, outside CI, against an HTTPS
// production host whose /api/health reports live providers before the runs (and again after them, or the
// run fails), with at least 5 ungated --submit=immediate runs in the file.

/** EVAL-070 expected.max_latency_ms (evaluation-plan §4.3): every run at most 30 s. */
export const S3_THRESHOLD_MS = 30_000;
/** Automated runs in the gate and how many of them must have a cold harvest-window cache (§4.3). */
export const S3_RUNS = 20;
export const S3_MIN_COLD = 5;
/** Ungated --submit=immediate runs a formal run also records (the worst case, in the formal file). */
export const S3_FORMAL_IMMEDIATE_RUNS = 5;
/** HR3 waived (TP29): the placeholder photo size, an assumption, not a measurement. */
export const S3_PHOTO_BYTES = 4 * 1024 * 1024;
/** Weak network (§4.3), reported without a gate. The plan names upload and RTT only; download stays EV9's. */
export const WEAK_NETWORK: Network = { downloadMbps: EV9_NETWORK.downloadMbps, uploadMbps: 1.5, latencyMs: 300 };
/**
 * Runs per seeded agent at most: 3 stage uploads a run against the 60-per-10-min stage limit (TSK-30.2) and
 * one capture against the 30-per-10-min phone limit (TSK-19.3), with room to spare.
 */
export const MAX_RUNS_PER_WORLD = 10;

/** The app's performance marks (WeightStep T0_MARK, VerdictScreen T1_MARK / VERDICT_IN_MARK, stage-client). */
export const S3_MARKS = {
  t0: 'udgam:t0-submit',
  t1: 'udgam:t1-verdict',
  verdictIn: 'udgam:verdict-in',
  stageStartPrefix: 'udgam:stage-start:',
  stageEndPrefix: 'udgam:stage-end:',
} as const;

const SLOTS = [
  { label: 'The branch', file: 'branch-01.jpg' },
  { label: 'Basket on the scale', file: 'scale-01.jpg' },
  { label: "The day's pile", file: 'pile-01.jpg' },
] as const;
const KG = '42.5';
const SEED_TIMEOUT_MS = 60_000;

export type { Network };
export type CacheState = 'cold' | 'warm' | 'unknown';
export type Outcome = 'verdict' | 'timeout' | 'error';
export type SubmitMode = 'after-staging' | 'immediate';
/** /api/health's provider block, or 'unknown' when it could not be read. */
export type Providers = Record<string, string> | 'unknown';

// ---------------------------------------------------------------------------------------------------
// Phase split

/** What the page and CDP recorded for one run (page times in ms from the page's time origin). */
export type RawTiming = {
  t0: number | null;
  t1: number | null;
  verdictIn: number | null;
  /** crypto.subtle.sign calls (the init script). */
  signs: { start: number; end: number }[];
  /** crypto.subtle.digest calls over ≥ 1 MiB: the photo hashes, taken at "Use this photo". */
  digests: { start: number; end: number; bytes: number }[];
  /** udgam:stage-start:<i> / udgam:stage-end:<i> (TSK-30.5). */
  stage: { start: number[]; end: number[] };
  /**
   * Each POST /api/capture after t0, in order: Resource Timing (fetch called, request sent, first and last
   * response byte) and the CDP send time (request start → body fully sent), null when CDP gave none.
   */
  captures: { start: number; requestStart: number; responseStart: number; responseEnd: number; sendMs: number | null }[];
};

export type Phases = {
  /** t0 → the payload's signature starts: the phone key's load and any wait for a fresh GPS fix (TP13). */
  gpsMs: number | null;
  /** Signature start → the capture request starts: canonicalise, ECDSA sign, save to the outbox. */
  hashSignMs: number | null;
  /** First capture request → the last one: the resend after a 409 media_not_staged (0 when none). */
  resendMs: number | null;
  /** The last request: fetch called → its body fully sent (the photos too, unless staged). */
  uploadMs: number | null;
  /** Body sent → the last response byte: parse, boundary, media, context, checks, commit, verdict line. */
  verifyMs: number | null;
  /** The verdict line received → the verdict card visible: render plus the checking screen's 600 ms hold. */
  responseMs: number | null;
};

export type PhaseDetail = {
  /** Body sent → first response byte (the first check line): the server before verification streams. */
  serverFirstLineMs: number | null;
  /** Last response byte → `udgam:verdict-in` (the verdict rendered on the checking screen). */
  verdictRenderMs: number | null;
  /** `udgam:verdict-in` → t1: the auto-advance hold. */
  holdMs: number | null;
  /** Upload and verify together, when the browser gave no send timing to split them. */
  uploadVerifyMs: number | null;
  /** Outside t0→t1: hashing the photos at "Use this photo" (summed). */
  photoHashMs: number | null;
  /** Outside t0→t1 when staged before Send: the first stage-start → the last stage-end. */
  stagingMs: number | null;
  captureRequests: number;
};

const rnd = (x: number | null): number | null => (x === null ? null : Math.round(x));

/**
 * Split t0→t1 into the EV9 phases. GPS + hash+sign + resend + upload + verify + response = t1 − t0 when
 * every part is known. Hashing the photos happens at "Use this photo", before t0, and is reported beside
 * the split (photoHashMs), as is the background staging upload (stagingMs). `exactMs` is the unrounded
 * t1 − t0 the gate compares; `totalMs` and the phases are rounded for the report.
 */
export function phaseSplit(raw: RawTiming): { totalMs: number | null; exactMs: number | null; phases: Phases; detail: PhaseDetail } {
  const { t0, t1, verdictIn } = raw;
  const exactMs = t0 !== null && t1 !== null ? t1 - t0 : null;
  const sign = t0 === null ? undefined : raw.signs.find((s) => s.start >= t0);
  const captures = t0 === null ? [] : raw.captures.filter((c) => c.start >= t0);
  const first = captures[0];
  const last = captures.at(-1);
  const bodySent = last && last.sendMs !== null ? last.requestStart + last.sendMs : null;
  const diff = (a: number | null | undefined, b: number | null | undefined) => (a === null || a === undefined || b === null || b === undefined ? null : rnd(b - a));
  const phases: Phases = {
    gpsMs: diff(t0, sign?.start),
    hashSignMs: diff(sign?.start, first?.start),
    resendMs: diff(first?.start, last?.start),
    uploadMs: diff(last?.start, bodySent),
    verifyMs: diff(bodySent, last?.responseEnd),
    responseMs: diff(last?.responseEnd, t1),
  };
  const digestMs = raw.digests.filter((d) => t0 === null || d.end <= t0).reduce((s, d) => s + (d.end - d.start), 0);
  const detail: PhaseDetail = {
    serverFirstLineMs: diff(bodySent, last?.responseStart),
    verdictRenderMs: diff(last?.responseEnd, verdictIn),
    holdMs: diff(verdictIn, t1),
    uploadVerifyMs: last && bodySent === null ? diff(last.start, last.responseEnd) : null,
    photoHashMs: raw.digests.length > 0 ? rnd(digestMs) : null,
    stagingMs: raw.stage.start.length > 0 && raw.stage.end.length > 0 ? rnd(Math.max(...raw.stage.end) - Math.min(...raw.stage.start)) : null,
    captureRequests: captures.length,
  };
  return { totalMs: rnd(exactMs), exactMs, phases, detail };
}

/** The parts of the EV9 split a verdict run lacks (EVAL-070 fails a run with its split missing). */
export function splitMissing(phases: Phases, uploadVerifyMs: number | null): string[] {
  const missing: string[] = (['gpsMs', 'hashSignMs', 'resendMs'] as const).filter((k) => phases[k] === null);
  if ((phases.uploadMs === null || phases.verifyMs === null) && uploadVerifyMs === null) missing.push('uploadMs+verifyMs or uploadVerifyMs');
  if (phases.responseMs === null) missing.push('responseMs');
  return missing;
}

// ---------------------------------------------------------------------------------------------------
// Scorer

/** One run as the gate sees it: `ms` is the unrounded t1 − t0. */
export type ScoredRun = { ms: number | null; outcome: Outcome; cache: CacheState; phases: Phases; uploadVerifyMs: number | null };
export type Stats = { n: number; p50: number | null; p95: number | null; max: number | null };
export type S3Summary = Stats & {
  /** Runs that reached the verdict card. */
  verdicts: number;
  thresholdMs: number;
  coldRuns: number;
  warmRuns: number;
  unknownCacheRuns: number;
  /** Every run reached the verdict card, with its split, in at most the threshold. */
  allWithinThreshold: boolean;
  /** The S3 gate: allWithinThreshold, over at least 20 runs, at least 5 of them cold. */
  pass: boolean;
  /** Why the gate did not pass (empty when it did). */
  reasons: string[];
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const r1 = (x: number) => Math.round(x * 10) / 10;

/** p50, p95 and max of `samples` (the S4 scorer's R-7 percentiles; max rounded for the report), or nulls. */
export function latencyStats(samples: number[]): Stats {
  if (samples.length === 0) return { n: 0, p50: null, p95: null, max: null };
  const { n, p50, p95, max } = summarizeLatency(samples, S3_THRESHOLD_MS);
  return { n, p50, p95, max: r2(max) };
}

/**
 * The S3 gate over the automated runs (EVAL-070): every run reached the verdict card in ≤ 30 s (the
 * unrounded time) with its latency split, there are at least 20 runs and at least 5 had a cold
 * harvest-window cache. S3 names no percentile, so the gate is on the maximum; p50 and p95 are reported.
 */
export function scoreS3(runs: ScoredRun[]): S3Summary {
  const timed = runs.filter((r) => r.outcome === 'verdict' && r.ms !== null);
  const stats = latencyStats(timed.map((r) => r.ms!));
  const count = (c: CacheState) => runs.filter((r) => r.cache === c).length;
  const reasons: string[] = [];
  runs.forEach((r, i) => {
    if (r.outcome !== 'verdict' || r.ms === null) {
      reasons.push(`run ${i + 1}: no verdict card (${r.outcome})`);
      return;
    }
    if (r.ms > S3_THRESHOLD_MS) reasons.push(`run ${i + 1}: ${r1(r.ms)} ms > ${S3_THRESHOLD_MS} ms`);
    const missing = splitMissing(r.phases, r.uploadVerifyMs);
    if (missing.length > 0) reasons.push(`run ${i + 1}: latency split missing (${missing.join(', ')})`);
  });
  const allWithinThreshold = runs.length > 0 && reasons.length === 0;
  if (runs.length < S3_RUNS) reasons.push(`${runs.length} runs < ${S3_RUNS}: not a gate run`);
  if (count('cold') < S3_MIN_COLD) reasons.push(`${count('cold')} cold-cache runs < ${S3_MIN_COLD}`);
  return {
    ...stats,
    n: runs.length,
    verdicts: timed.length,
    thresholdMs: S3_THRESHOLD_MS,
    coldRuns: count('cold'),
    warmRuns: count('warm'),
    unknownCacheRuns: count('unknown'),
    allWithinThreshold,
    pass: reasons.length === 0,
    reasons,
  };
}

/** Whether /api/health reports every provider `ok` (live and reachable; `fixture` is not live). */
export const liveProviders = (p: Providers): boolean => p !== 'unknown' && Object.keys(p).length > 0 && Object.values(p).every((v) => v === 'ok');
const describeProviders = (p: Providers): string => (p === 'unknown' ? '/api/health unreadable' : Object.entries(p).map(([k, v]) => `${k}=${v}`).join(', '));

/** The result's pass: the gate, and for a formal run live providers after the runs too. */
export function finalVerdict(summary: S3Summary, o: { formal: boolean; providersAfter: Providers }): { pass: boolean; reasons: string[] } {
  const reasons = [...summary.reasons];
  if (o.formal && !liveProviders(o.providersAfter)) reasons.push(`providers not all ok after the runs: ${describeProviders(o.providersAfter)}`);
  return { pass: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------------------------------
// Run outcome

export type Terminal = { t: 'verdict'; verdict: string } | { t: 'rejected'; reason: string } | { t: 'error' };

/** The last terminal line (verdict, rejected or error) of a /api/capture NDJSON answer, or null. */
export function terminalOf(body: string): Terminal | null {
  let out: Terminal | null = null;
  for (const raw of body.split('\n')) {
    let line: unknown;
    try {
      line = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!line || typeof line !== 'object') continue;
    const l = line as { t?: unknown; verdict?: unknown; reason?: unknown };
    if (l.t === 'verdict') out = { t: 'verdict', verdict: String(l.verdict) };
    else if (l.t === 'rejected') out = { t: 'rejected', reason: String(l.reason) };
    else if (l.t === 'error') out = { t: 'error' };
  }
  return out;
}

/**
 * A run with the verdict card visible is a verdict only if the last capture answer was 2xx and ended
 * with a verdict line (or, its body unreadable, the app marked the verdict in). A boundary refusal also
 * lands on the verdict screen ("Not accepted") and is an error here.
 */
export function judgeOutcome(o: { cardVisible: boolean; status: number | null; terminal: Terminal | null; verdictIn: boolean }): { outcome: Outcome; reason: string | null } {
  if (!o.cardVisible) return { outcome: 'timeout', reason: null };
  if (o.status === null) return { outcome: 'error', reason: 'no /api/capture response recorded' };
  if (o.status < 200 || o.status > 299) {
    const why = o.terminal?.t === 'rejected' ? ` (${o.terminal.reason})` : '';
    return { outcome: 'error', reason: `capture answered HTTP ${o.status}${why}: a refusal, not a verdict` };
  }
  if (o.terminal && o.terminal.t !== 'verdict') return { outcome: 'error', reason: `capture stream ended with ${o.terminal.t}, not a verdict line` };
  if (!o.terminal && !o.verdictIn) return { outcome: 'error', reason: 'no verdict line and no udgam:verdict-in mark' };
  return { outcome: 'verdict', reason: null };
}

// ---------------------------------------------------------------------------------------------------
// Arguments

export class UsageError extends Error {}

/** The perf suite: --suite (the plan's name) or --only (TKT-21's), S4 when neither is given. */
export function suiteOf(argv: string[]): string {
  const suite = argOf(argv, 'suite');
  const only = argOf(argv, 'only');
  if (suite !== undefined && only !== undefined && suite !== only) throw new UsageError(`--suite=${suite} and --only=${only} disagree`);
  return suite ?? only ?? 's4';
}

export type S3Args = { target: string; runs: number; cold: number; weakRuns: number; immediateRuns: number; submit: SubmitMode; dataDir: string; formal: boolean };

const VALUE_FLAGS = new Set(['suite', 'only', 'target', 'runs', 'cold', 'weak-runs', 'immediate-runs', 'submit', 'data-dir']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);
const GATE_RUN = `--formal is the gate run: ${S3_RUNS} runs, at least ${S3_MIN_COLD} cold, --submit=after-staging`;

/** Whether `target` is this machine (a local production build, never the reference host). */
export const isLocalTarget = (target: string): boolean => {
  const host = new URL(target).hostname;
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost') || host.startsWith('127.');
};

const int = (raw: string | undefined, fallback: number): number => (raw === undefined ? fallback : /^-?\d+$/.test(raw) ? Number(raw) : NaN);

export function parseS3Args(argv: string[], env: { DATA_DIR?: string }): S3Args {
  const seen = new Set<string>();
  for (const a of argv) {
    const name = a.startsWith('--') ? a.slice(2).split('=')[0]! : a;
    if (name === 'out') throw new UsageError("--out is S4's; S3 writes evals/results/local/ or, with --formal, the baseline");
    if (!a.startsWith('--') || (!VALUE_FLAGS.has(name) && name !== 'formal')) throw new UsageError(`unknown flag ${a.split('=')[0]}`);
    if (seen.has(name)) throw new UsageError(`--${name} is given more than once`);
    seen.add(name);
    if (name === 'formal' && a !== '--formal') throw new UsageError('--formal takes no value');
    if (name !== 'formal' && !a.includes('=')) throw new UsageError(`--${name} needs a value`);
  }
  const target = argOf(argv, 'target') ?? '';
  let url: URL | null = null;
  try {
    url = new URL(target);
  } catch {
    // reported below
  }
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) throw new UsageError('--target=<http(s) url> is required');
  const runs = int(argOf(argv, 'runs'), S3_RUNS);
  if (!Number.isInteger(runs) || runs < 1) throw new UsageError('--runs must be a positive integer');
  const cold = int(argOf(argv, 'cold'), Math.min(S3_MIN_COLD, runs));
  if (!Number.isInteger(cold) || cold < 1 || cold > runs) throw new UsageError('--cold must be an integer from 1 to --runs');
  if (runs > cold * MAX_RUNS_PER_WORLD) throw new UsageError(`at most ${MAX_RUNS_PER_WORLD} runs per seeded agent: raise --cold to at least ${Math.ceil(runs / MAX_RUNS_PER_WORLD)}`);
  const weakRuns = int(argOf(argv, 'weak-runs'), 3);
  if (!Number.isInteger(weakRuns) || weakRuns < 0) throw new UsageError('--weak-runs must be a non-negative integer');
  const submit = argOf(argv, 'submit') ?? 'after-staging';
  if (submit !== 'after-staging' && submit !== 'immediate') throw new UsageError('--submit must be after-staging or immediate');
  const formal = seen.has('formal');
  const immediateRuns = int(argOf(argv, 'immediate-runs'), formal ? S3_FORMAL_IMMEDIATE_RUNS : 0);
  if (!Number.isInteger(immediateRuns) || immediateRuns < 0) throw new UsageError('--immediate-runs must be a non-negative integer');
  if (formal && (url.protocol !== 'https:' || isLocalTarget(target))) throw new UsageError('--formal needs an https production target (the baseline is never a local run)');
  if (formal && (runs < S3_RUNS || cold < S3_MIN_COLD)) throw new UsageError(GATE_RUN);
  if (formal && immediateRuns < S3_FORMAL_IMMEDIATE_RUNS) throw new UsageError(`--formal also reports at least ${S3_FORMAL_IMMEDIATE_RUNS} --submit=immediate runs`);
  const dataDir = argOf(argv, 'data-dir') || env.DATA_DIR || './data';
  return { target, runs, cold, weakRuns, immediateRuns, submit, dataDir, formal };
}

/**
 * Why a formal run may not start, or null (always null for a local run). Checked before anything is
 * seeded or measured: never in CI, the gate's submit mode, a baseline is never rewritten, one clean commit,
 * and live providers (§4.3: the reference condition uses the live providers).
 */
export function formalRefusal(i: { args: S3Args; formalFile?: string; formalFileExists: boolean; tree: { dirty: boolean; changes: string[] }; ci: boolean; providers: Providers }): string | null {
  if (!i.args.formal) return null;
  if (i.ci) return '--formal is never run in CI (it needs the production host and its live providers)';
  if (i.args.submit !== 'after-staging') return GATE_RUN;
  if (i.formalFileExists) return `refusing to overwrite ${i.formalFile ?? 'the S3 baseline'}: perf results are never rewritten`;
  if (i.tree.dirty) return `--formal needs a clean tree at one commit (${i.tree.changes.length} change(s))`;
  if (!liveProviders(i.providers)) return `--formal needs live providers: ${i.providers === 'unknown' ? '' : '/api/health says '}${describeProviders(i.providers)}`;
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Cold-cache selection

/** The cache intent of each run: the cold runs first (one fresh plot each), then the warm ones. */
export function planRuns(runs: number, cold: number): ('cold' | 'warm')[] {
  return Array.from({ length: runs }, (_, i) => (i < cold ? 'cold' : 'warm'));
}

export type WorldSlot = { index: number; plotId: string; runs: number };

/**
 * The world (agent, phone, plot) for the next run. Cold: an unused plot with no harvest-window cache row
 * this month (`cached` holds the plot IDs that have one). Warm: the least-used plot with a row, under
 * MAX_RUNS_PER_WORLD. Null when no world fits; the runner then takes the least-used world and labels the
 * run by what the cache held.
 */
export function chooseWorld<W extends WorldSlot>(intent: 'cold' | 'warm', worlds: W[], cached: ReadonlySet<string>): W | null {
  if (intent === 'cold') return worlds.find((w) => w.runs === 0 && !cached.has(w.plotId)) ?? null;
  const warm = worlds.filter((w) => cached.has(w.plotId) && w.runs < MAX_RUNS_PER_WORLD);
  return warm.reduce<W | null>((best, w) => (best === null || w.runs < best.runs ? w : best), null);
}

/** The harvest-window cache's month bucket: the IST month of the receipt date (ndvi_harvest_window). */
export const monthBucket = (now: Date): string => istDate(now.toISOString()).slice(0, 7);

// ---------------------------------------------------------------------------------------------------
// The browser runs

export type Series = 'reference' | 'weak' | 'immediate';

export type S3Run = {
  run: number;
  profile: Series;
  world: number;
  plotId: string;
  /** The cache this run was planned for, and what the target's cache table held just before Send. */
  intended: 'cold' | 'warm';
  cache: CacheState;
  /** t1 − t0 rounded for the report; null unless the run is a verdict. */
  ms: number | null;
  /** t1 − t0 unrounded, as the gate compares it. */
  exactMs: number | null;
  outcome: Outcome;
  /** The verdict card's heading (Verified, Needs a check, Not accepted, …), for a verdict run. */
  verdict: string | null;
  /** The last /api/capture answer: its HTTP status and terminal NDJSON line. */
  captureStatus: number | null;
  terminal: Terminal | null;
  phases: Phases;
  detail: PhaseDetail;
  /** Photos staged (201) before Send, and the capture request bodies' sizes (null: a body with photo bytes). */
  stagedBeforeSend: number;
  captureBodyBytes: (number | null)[];
  errors: string[];
};

type World = WorldSlot & { seed: SeededCapture; context: BrowserContext };

/** Times crypto.subtle.sign and large digests in the page (harness instrumentation, no app change). */
function instrument(): void {
  const rec: { signs: { start: number; end: number }[]; digests: { start: number; end: number; bytes: number }[] } = { signs: [], digests: [] };
  Object.defineProperty(window, '__udgamPerf', { value: rec });
  const proto = SubtleCrypto.prototype;
  const sign = proto.sign;
  const digest = proto.digest;
  proto.sign = function (this: SubtleCrypto, ...args: Parameters<SubtleCrypto['sign']>) {
    const start = performance.now();
    return sign.apply(this, args).then((r) => {
      rec.signs.push({ start, end: performance.now() });
      return r;
    });
  };
  proto.digest = function (this: SubtleCrypto, ...args: Parameters<SubtleCrypto['digest']>) {
    const start = performance.now();
    const data = args[1] as ArrayBuffer | ArrayBufferView;
    const bytes = data?.byteLength ?? 0;
    return digest.apply(this, args).then((r) => {
      if (bytes >= 1 << 20) rec.digests.push({ start, end: performance.now(), bytes });
      return r;
    });
  };
}

/** A demo photo padded after its end-of-image marker to 4 MiB with random bytes: a valid, unique JPEG. */
function paddedPhoto(file: string): Buffer {
  const base = readFileSync(join(REPO_ROOT, 'assets/demo-photos', file));
  return Buffer.concat([base, randomBytes(Math.max(16, S3_PHOTO_BYTES - base.length))]);
}

/** Seed one capture world into the target's DATA_DIR with the e2e seeder (child process; output parsed, never printed). */
function seedWorld(dataDir: string): SeededCapture {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', DATA_DIR: resolve(dataDir), LOG_LEVEL: 'silent' };
  delete env.DATABASE_URL;
  const out = execFileSync(join(REPO_ROOT, 'node_modules/.bin/tsx'), ['e2e/helpers/seed-capture.ts', '--plots', 'P01'], {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
    timeout: SEED_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  }).toString();
  return JSON.parse(out.trim().split('\n').at(-1)!) as SeededCapture;
}

/** Plot IDs among `plotIds` with a harvest-window cache row this month, or null when the table cannot be read. */
async function cachedPlots(dataDir: string, plotIds: string[]): Promise<Set<string> | null> {
  const { createClient } = await import('@libsql/client');
  const db = createClient({ url: `file:${join(resolve(dataDir), 'udgam.db')}` });
  try {
    const r = await db.execute({
      sql: `SELECT DISTINCT plot_id FROM remote_sensing_cache WHERE kind = 'ndvi_window' AND month_bucket = ? AND plot_id IN (${plotIds.map(() => '?').join(',')})`,
      args: [monthBucket(new Date()), ...plotIds],
    });
    return new Set(r.rows.map((row) => String(row.plot_id)));
  } catch {
    return null;
  } finally {
    db.close();
  }
}

async function signIn(page: Page, target: string, email: string, password: string): Promise<void> {
  await page.goto(new URL('/sign-in', target).toString());
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith('/sign-in'), { timeout: 30_000 });
}

/**
 * The body of a finished response, or null if it cannot be read within 5 s. A refusal's short 4xx body
 * reads; the streamed 200 NDJSON the page consumed usually does not (DevTools keeps no copy), so a 2xx run
 * then rests on its status plus the app's `udgam:verdict-in` mark (judgeOutcome). Read after t1: untimed.
 */
async function bodyText(r: Response): Promise<string | null> {
  return Promise.race([r.text().catch(() => null), new Promise<null>((done) => setTimeout(() => done(null), 5_000))]);
}

const isCapture = (url: string, method: string) => method === 'POST' && new URL(url).pathname === '/api/capture';

/** One picking, measured. */
async function measure(world: World, o: { target: string; net: Network; submit: SubmitMode; dataDir: string; timeoutMs: number }): Promise<Omit<S3Run, 'run' | 'profile' | 'intended'>> {
  const page = await world.context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  let staged = 0;
  let sending = false;
  let lastCapture: Response | null = null;
  const bodies: (number | null)[] = [];
  page.on('response', (r) => {
    if (!sending && new URL(r.url()).pathname === '/api/capture/stage' && r.status() === 201) staged++;
    if (isCapture(r.url(), r.request().method())) lastCapture = r;
  });
  page.on('request', (r) => {
    // Playwright keeps a body it can read in full (the staged, photo-free picking); a body with photo bytes reads as null.
    if (isCapture(r.url(), r.method())) bodies.push(r.postDataBuffer()?.length ?? null);
  });
  const cdp = await world.context.newCDPSession(page);
  const captureIds: string[] = [];
  const sendMs = new Map<string, number | null>();
  cdp.on('Network.requestWillBeSent', (e) => {
    if (isCapture(e.request.url, e.request.method)) captureIds.push(e.requestId);
  });
  cdp.on('Network.responseReceived', (e) => {
    const t = e.response.timing;
    if (captureIds.includes(e.requestId)) sendMs.set(e.requestId, t && t.sendEnd >= 0 && t.sendStart >= 0 ? t.sendEnd - t.sendStart : null);
  });
  let cache: CacheState = 'unknown';
  const fail = (outcome: Outcome) => {
    const none = phaseSplit({ t0: null, t1: null, verdictIn: null, signs: [], digests: [], stage: { start: [], end: [] }, captures: [] });
    return { world: world.index, plotId: world.plotId, cache, ms: null, exactMs: null, outcome, verdict: null, captureStatus: null, terminal: null, phases: none.phases, detail: none.detail, stagedBeforeSend: staged, captureBodyBytes: bodies, errors: errors.slice(0, 10) };
  };
  try {
    await applyReferenceProfile(cdp, { network: o.net });
    await page.goto(new URL(`/field/record?plot=${world.plotId}`, o.target).toString());
    await page.locator('input[type="file"][data-hydrated="true"]').first().waitFor({ state: 'attached', timeout: 60_000 });
    for (const s of SLOTS) {
      await page.getByLabel(s.label).setInputFiles({ name: s.file, mimeType: 'image/jpeg', buffer: paddedPhoto(s.file) });
      const use = page.getByRole('button', { name: 'Use this photo' });
      await use.click({ timeout: 30_000 });
      await use.waitFor({ state: 'detached', timeout: 60_000 });
    }
    await page.getByRole('heading', { name: 'How many kilos?' }).waitFor({ timeout: 30_000 });
    if (o.submit === 'after-staging') {
      await page.waitForFunction((p) => [0, 1, 2].every((i) => performance.getEntriesByName(`${p}${i}`).length === 1), S3_MARKS.stageEndPrefix, { timeout: 300_000, polling: 250 });
    }
    for (const k of KG) await page.locator(`#keypad [data-k="${k}"]`).click();
    // Playwright's emulated position reports once; a phone's watch reports about once a second. Set it again
    // so the fix the flow holds is fresh at Send, as on a phone (TP13), and Send does not wait 10 s for one.
    await world.context.setGeolocation({ latitude: world.seed.plots[0]!.inside.lat, longitude: world.seed.plots[0]!.inside.lng, accuracy: 8 });
    const cached = await cachedPlots(o.dataDir, [world.plotId]);
    cache = cached === null ? 'unknown' : cached.has(world.plotId) ? 'warm' : 'cold';
    sending = true;
    await page.locator('#send-btn').click();
    let cardVisible = true;
    try {
      await page.locator('#verdict-h').waitFor({ state: 'visible', timeout: o.timeoutMs });
    } catch {
      cardVisible = false;
      errors.push(`no verdict card within ${o.timeoutMs} ms`);
    }
    if (cardVisible) {
      try {
        await page.waitForFunction((m) => performance.getEntriesByName(m).length > 0, S3_MARKS.t1, { timeout: 10_000 });
      } catch {
        errors.push(`verdict card shown but ${S3_MARKS.t1} was not marked within 10 s`);
      }
      try {
        // Resource Timing records the fetch once its stream has ended (just after the verdict line).
        await page.waitForFunction((n) => performance.getEntriesByType('resource').filter((e) => new URL(e.name).pathname === '/api/capture').length >= n, captureIds.length, { timeout: 10_000 });
      } catch {
        errors.push(`verdict card shown but Resource Timing lacks an entry for each of the ${captureIds.length} /api/capture requests after 10 s`);
      }
    }
    // No named helpers inside evaluated code: tsx's keepNames wraps them in __name(), which the page lacks.
    const t = await page.evaluate(
      ({ t0, t1, vin, startPrefix, endPrefix }) => {
        const marks = [t0, t1, vin].map((n) => performance.getEntriesByName(n)[0]?.startTime ?? null);
        const rec = (window as unknown as { __udgamPerf?: { signs: { start: number; end: number }[]; digests: { start: number; end: number; bytes: number }[] } }).__udgamPerf;
        const res = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
          .filter((e) => new URL(e.name).pathname === '/api/capture')
          .sort((a, b) => a.startTime - b.startTime)
          .map((e) => ({ start: e.startTime, requestStart: e.requestStart, responseStart: e.responseStart, responseEnd: e.responseEnd }));
        return {
          t0: marks[0] ?? null,
          t1: marks[1] ?? null,
          verdictIn: marks[2] ?? null,
          signs: rec?.signs ?? [],
          digests: rec?.digests ?? [],
          stage: {
            start: performance.getEntriesByType('mark').filter((m) => m.name.startsWith(startPrefix)).map((m) => m.startTime),
            end: performance.getEntriesByType('mark').filter((m) => m.name.startsWith(endPrefix)).map((m) => m.startTime),
          },
          res,
          heading: document.querySelector('#verdict-h')?.textContent?.trim() ?? null,
        };
      },
      { t0: S3_MARKS.t0, t1: S3_MARKS.t1, vin: S3_MARKS.verdictIn, startPrefix: S3_MARKS.stageStartPrefix, endPrefix: S3_MARKS.stageEndPrefix },
    );
    const sends = captureIds.map((id) => sendMs.get(id) ?? null);
    const split = phaseSplit({ ...t, captures: t.res.map((c, i) => ({ ...c, sendMs: t.res.length === sends.length ? sends[i]! : null })) });
    const last = lastCapture as Response | null;
    const captureStatus = last ? last.status() : null;
    const body = cardVisible && last ? await bodyText(last) : null;
    const terminal = body === null ? null : terminalOf(body);
    const judged = judgeOutcome({ cardVisible, status: captureStatus, terminal, verdictIn: t.verdictIn !== null });
    if (judged.reason) errors.push(judged.reason);
    // A verdict whose t0 or t1 mark is missing has no time: an error (the reason is logged above).
    const outcome: Outcome = judged.outcome === 'verdict' && split.exactMs === null ? 'error' : judged.outcome;
    return {
      world: world.index,
      plotId: world.plotId,
      cache,
      ms: outcome === 'verdict' ? split.totalMs : null,
      exactMs: outcome === 'verdict' ? split.exactMs : null,
      outcome,
      verdict: outcome === 'verdict' ? t.heading : null,
      captureStatus,
      terminal,
      phases: split.phases,
      detail: split.detail,
      stagedBeforeSend: staged,
      captureBodyBytes: bodies,
      errors: errors.slice(0, 10),
    };
  } catch (err) {
    errors.push(`run failed: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
    return fail('error');
  } finally {
    await page.close();
  }
}

type Ungated = { gated: false; runs: S3Run[]; summary: Stats };

export type S3Result = {
  gate: 'S3';
  case: 'EVAL-070';
  target: string;
  targetKind: 'local' | 'production';
  /** /api/health's provider block before and after the runs: `fixture` is not the live providers §4.3 asks for. */
  providers: { before: Providers; after: Providers };
  assumptions: string[];
  profile: {
    viewport: { width: number; height: number };
    network: Network;
    weakNetwork: Network;
    photos: { count: number; bytes: number; source: string };
    submit: SubmitMode;
    cpuThrottle: null;
    cache: string;
  };
  runs: S3Run[];
  summary: S3Summary;
  /** Per-phase p50 / p95 / max over the reference runs that reached a verdict. */
  phases: Record<keyof Phases, Stats>;
  weak: Ungated;
  /** --submit=immediate runs on the EV9 profile (formal: at least 5): the photos go inside t0→t1. */
  immediate: Ungated;
  pass: boolean;
  /** Why the result is not a pass: the gate's reasons, and for a formal run the providers after. */
  reasons: string[];
};

export type RunS3Options = Omit<S3Args, 'formal'> & { formal?: boolean; providersBefore?: Providers; timeoutMs?: number; log?: (line: string) => void };

export async function providerHealth(target: string): Promise<Providers> {
  try {
    const r = await fetch(new URL('/api/health', target), { signal: AbortSignal.timeout(10_000) });
    const body = (await r.json()) as { providers?: Record<string, string> };
    return body.providers ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

const toScored = (r: S3Run): ScoredRun => ({ ms: r.exactMs, outcome: r.outcome, cache: r.cache, phases: r.phases, uploadVerifyMs: r.detail.uploadVerifyMs });
const ungated = (runs: S3Run[]): Ungated => ({ gated: false, runs, summary: latencyStats(runs.filter((r) => r.outcome === 'verdict' && r.exactMs !== null).map((r) => r.exactMs!)) });

export async function runS3(o: RunS3Options): Promise<S3Result> {
  const log = o.log ?? (() => undefined);
  const timeoutMs = o.timeoutMs ?? 120_000;
  const providersBefore = o.providersBefore ?? (await providerHealth(o.target));
  const { chromium } = await import('@playwright/test');
  const { injectDevice } = await import('../../e2e/helpers/capture');
  const browser = await chromium.launch(chromiumLaunchOptions());
  let nextWorld = 0;
  const open = async (): Promise<World> => {
    const seed = seedWorld(o.dataDir);
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await context.addInitScript(instrument);
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: seed.plots[0]!.inside.lat, longitude: seed.plots[0]!.inside.lng, accuracy: 8 });
    const page = await context.newPage();
    try {
      await signIn(page, o.target, seed.agentEmail, seed.testOnlyAgentPassword);
      await injectDevice(page, seed);
    } finally {
      await page.close();
    }
    return { index: nextWorld++, plotId: seed.plots[0]!.id, runs: 0, seed, context };
  };
  const worldsFor = async (n: number): Promise<World[]> => {
    const out: World[] = [];
    for (let i = 0; i < n; i++) out.push(await open());
    return out;
  };

  const series = async (profile: Series, plan: ('cold' | 'warm')[], worlds: World[], net: Network, submit: SubmitMode): Promise<S3Run[]> => {
    const out: S3Run[] = [];
    for (const [i, intended] of plan.entries()) {
      const cached = (await cachedPlots(o.dataDir, worlds.map((w) => w.plotId))) ?? new Set<string>();
      const world = chooseWorld(intended, worlds, cached) ?? worlds.reduce((a, b) => (b.runs < a.runs ? b : a));
      world.runs++;
      const m = await measure(world, { target: o.target, net, submit, dataDir: o.dataDir, timeoutMs: profile === 'weak' ? timeoutMs * 2 : timeoutMs });
      const r: S3Run = { run: i + 1, profile, intended, ...m };
      log(`  ${profile} run ${r.run}/${plan.length} (${r.cache}): ${r.ms === null ? `${r.outcome}${r.errors.length > 0 ? ` (${r.errors.at(-1)})` : ''}` : `${r.ms} ms, ${r.verdict}`}`);
      out.push(r);
    }
    return out;
  };
  /** An ungated series on its own worlds: the first run cold, the rest warm. */
  const extra = async (profile: Series, n: number, net: Network, submit: SubmitMode): Promise<S3Run[]> => {
    if (n === 0) return [];
    const worlds = await worldsFor(Math.ceil(n / MAX_RUNS_PER_WORLD));
    try {
      return await series(profile, planRuns(n, worlds.length), worlds, net, submit);
    } finally {
      for (const w of worlds) await w.context.close();
    }
  };

  try {
    const worlds = await worldsFor(o.cold);
    log(`seeded ${worlds.length} capture worlds into ${o.dataDir}`);
    let runs: S3Run[];
    try {
      runs = await series('reference', planRuns(o.runs, o.cold), worlds, EV9_NETWORK, o.submit);
    } finally {
      for (const w of worlds) await w.context.close();
    }
    const weakRuns = await extra('weak', o.weakRuns, WEAK_NETWORK, o.submit);
    const immediateRuns = await extra('immediate', o.immediateRuns, EV9_NETWORK, 'immediate');
    const providersAfter = await providerHealth(o.target);

    const summary = scoreS3(runs.map(toScored));
    const verdict = finalVerdict(summary, { formal: o.formal ?? false, providersAfter });
    const ok = runs.filter((r) => r.outcome === 'verdict');
    const phaseKeys: (keyof Phases)[] = ['gpsMs', 'hashSignMs', 'resendMs', 'uploadMs', 'verifyMs', 'responseMs'];
    const phases = Object.fromEntries(phaseKeys.map((k) => [k, latencyStats(ok.map((r) => r.phases[k]).filter((x): x is number => x !== null))])) as S3Result['phases'];
    const local = isLocalTarget(o.target);
    const live = liveProviders(providersBefore) && liveProviders(providersAfter);
    return {
      gate: 'S3',
      case: 'EVAL-070',
      target: o.target,
      targetKind: local ? 'local' : 'production',
      providers: { before: providersBefore, after: providersAfter },
      assumptions: [
        'HR3 waived (TP29): the 10/5 Mbit/s, 80 ms network profile is the EV9 placeholder, not a field measurement.',
        'HR3 waived (TP29): photos are AI-generated demo photos padded to the 4 MB placeholder size, not the demo phone’s real size.',
        'Chromium CDP network emulation on this host, not a phone on a rural link; no CPU throttling.',
        'Weak profile: §4.3 names only upload and RTT; download kept at EV9’s 10 Mbit/s.',
        ...(live ? [] : ['Remote sensing is not the live providers (see `providers`): the provider wait is not representative of §4.3.']),
        ...(local ? ['Local production build on this host, not the production (Oracle A1) host.'] : []),
        o.submit === 'after-staging'
          ? 'Send is tapped once the three photos are staged (TSK-30.5): their upload is outside t0→t1 and reported as detail.stagingMs.'
          : 'Send is tapped right after typing the weight: staging still running is aborted and the photos go with the picking.',
        ...(o.immediateRuns > 0 ? ['`immediate` (no gate): Send right after the weight on the EV9 profile, the worst case with the photos inside t0→t1.'] : []),
      ],
      profile: {
        viewport: { width: 375, height: 812 },
        network: EV9_NETWORK,
        weakNetwork: WEAK_NETWORK,
        photos: { count: SLOTS.length, bytes: S3_PHOTO_BYTES, source: 'assets/demo-photos (AI-generated, TP29), padded with random bytes' },
        submit: o.submit,
        cpuThrottle: null,
        cache: 'harvest-window cache read from the target DB before each Send; seeded plots have no registration cache',
      },
      runs,
      summary,
      phases,
      weak: ungated(weakRuns),
      immediate: ungated(immediateRuns),
      pass: verdict.pass,
      reasons: verdict.reasons,
    };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------------------------------
// CLI (called by evals/perf/run.ts for --suite=s3)

/** Run the S3 suite from the command line; returns the exit code (0 = the gate passed). */
export async function s3Cli(argv: string[], env: { DATA_DIR?: string } = { DATA_DIR: process.env.DATA_DIR }): Promise<number> {
  const usage = '\nusage: pnpm eval:perf --suite=s3 --target=<url> [--runs=20] [--cold=5] [--weak-runs=3] [--immediate-runs=0] [--submit=after-staging|immediate] [--data-dir=<dir>] [--formal]';
  let args: S3Args;
  try {
    args = parseS3Args(argv, env);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(`eval:perf: ${err.message}${usage}`);
    return 2;
  }
  const started = Date.now();
  // Refused before seeding or measuring (formalRefusal).
  const before = treeState();
  const formalFile = join(RESULTS_DIR, `baseline-perf-v1-s3-${before.shortSha}.json`);
  const providersBefore = await providerHealth(args.target);
  const refusal = formalRefusal({ args, formalFile, formalFileExists: existsSync(formalFile), tree: before, ci: !!process.env.CI, providers: providersBefore });
  if (refusal) {
    console.error(`eval:perf: ${refusal}`);
    return 2;
  }
  console.log(
    `S3 (EVAL-070) against ${args.target}: ${args.runs} runs (${args.cold} cold), ${args.weakRuns} weak-network runs, ${args.immediateRuns} immediate runs, submit ${args.submit}`,
  );
  const result = await runS3({ ...args, providersBefore, log: (l) => console.log(l) });
  const git = treeState();
  const out = { ...result, provenance: { ...perfProvenance(started, git), formal: args.formal } };
  const file = args.formal ? writePerfResult(formalFile, out) : writePerfResult(join(RESULTS_DIR, 'local', `perf-s3-${git.shortSha}.json`), out, { overwrite: true });
  const s = result.summary;
  const p = result.phases;
  const fmt = (x: number | null) => (x === null ? '—' : `${Math.round(x)}`);
  const extraLine = (name: string, u: Ungated) => (u.runs.length > 0 ? `\n  ${name} (no gate): ${u.summary.n} verdicts of ${u.runs.length}, p50 ${fmt(u.summary.p50)} ms, max ${fmt(u.summary.max)} ms` : '');
  console.log(
    `S3 ${result.pass ? 'PASS' : 'FAIL'} (${result.targetKind}${args.formal ? ', formal' : ', not the baseline'}): ${s.n} runs, ${s.verdicts} verdicts, ${s.coldRuns} cold / ${s.warmRuns} warm / ${s.unknownCacheRuns} unknown; ` +
      `p50 ${fmt(s.p50)} ms, p95 ${fmt(s.p95)} ms, max ${fmt(s.max)} ms (every run ≤ ${s.thresholdMs} ms with its split: ${s.allWithinThreshold ? 'yes' : 'no'})` +
      (result.reasons.length > 0 ? `\n  not a pass: ${result.reasons.join('; ')}` : '') +
      `\n  phases p50 (ms): GPS ${fmt(p.gpsMs.p50)}, hash+sign ${fmt(p.hashSignMs.p50)}, upload ${fmt(p.uploadMs.p50)}, verify ${fmt(p.verifyMs.p50)}, response ${fmt(p.responseMs.p50)}` +
      extraLine('weak network', result.weak) +
      extraLine('submit immediately', result.immediate) +
      `\n  providers before: ${describeProviders(result.providers.before)}; after: ${describeProviders(result.providers.after)}` +
      `\nwrote ${file}`,
  );
  return result.pass ? 0 : 1;
}
