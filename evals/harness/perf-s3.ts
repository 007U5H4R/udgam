import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { join, resolve } from 'node:path';
import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import type { SeededCapture } from '../../e2e/helpers/seed-capture';
import { istDate } from '../../src/lib/format';
import { EV9_NETWORK } from '../perf/network';
import { hostHardware, writePerfResult } from '../perf/output';
import { percentile } from '../scorers/latency';
import { appVersion, REPO_ROOT } from './provenance';
import { RESULTS_DIR } from './results';
import { treeState } from './tree-state';

// S3 capture-to-verdict perf runner (EVAL-070, evaluation-plan §4.3, EV9; technical-plan TSK-29.1), behind
//
//   pnpm eval:perf --suite=s3 --target=<url> [--runs=20] [--cold=5] [--weak-runs=3]
//                  [--submit=after-staging|immediate] [--data-dir=<target's DATA_DIR>] [--formal]
//
// Each run is one picking in Playwright Chromium at 375 × 812: three AI-generated demo photos
// (assets/demo-photos, TP29: never evidence) padded to the 4 MB placeholder size, the phone's GPS mocked
// inside a seeded plot, Chromium CDP network emulation at the EV9 placeholder profile (10/5 Mbit/s, 80 ms).
// HR3 was waived (TP29), so the photo size and the network profile are ASSUMPTIONS, and the result says so.
// t0 = the Send tap (`udgam:t0-submit`, marked in its click handler), t1 = the verdict card visible
// (`udgam:t1-verdict`, marked once the verdict screen's heading has mounted). Gate (EVAL-070): every one of
// 20 runs reaches the verdict card in ≤ 30 s, at least 5 of them with a cold harvest-window cache.
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
// photo digests. See phaseSplit. Weak-network runs (1.5 Mbit/s up, 300 ms) are reported without a gate.
//
// Output: evals/results/local/perf-s3-<sha>.json (git-ignored, replaced on a re-run). --formal writes
// evals/results/baseline-perf-v1-s3-<sha>.json, once, only from a clean tree against an HTTPS production
// host; never in CI.

/** EVAL-070 expected.max_latency_ms (evaluation-plan §4.3): every run at most 30 s. */
export const S3_THRESHOLD_MS = 30_000;
/** Automated runs in the gate and how many of them must have a cold harvest-window cache (§4.3). */
export const S3_RUNS = 20;
export const S3_MIN_COLD = 5;
/** HR3 waived (TP29): the placeholder photo size, an assumption, not a measurement. */
export const S3_PHOTO_BYTES = 4 * 1024 * 1024;
/** Weak network (§4.3), reported without a gate. The plan names upload and RTT only; download stays EV9's. */
export const WEAK_NETWORK = { downloadMbps: EV9_NETWORK.downloadMbps, uploadMbps: 1.5, latencyMs: 300 } as const;
/**
 * Runs per seeded agent at most: 3 stage uploads a run against the 60-per-10-min stage limit (TSK-30.2) and
 * one capture against the 30-per-10-min phone limit (TSK-19.3), with room to spare.
 */
export const MAX_RUNS_PER_WORLD = 10;

const SLOTS = [
  { label: 'The branch', file: 'branch-01.jpg' },
  { label: 'Basket on the scale', file: 'scale-01.jpg' },
  { label: "The day's pile", file: 'pile-01.jpg' },
] as const;
const KG = '42.5';
const PRE_INSTALLED = '/opt/pw-browsers/chromium';
const T0_MARK = 'udgam:t0-submit';
const T1_MARK = 'udgam:t1-verdict';
const VERDICT_IN_MARK = 'udgam:verdict-in';

export type Network = { downloadMbps: number; uploadMbps: number; latencyMs: number };
export type CacheState = 'cold' | 'warm' | 'unknown';
export type Outcome = 'verdict' | 'timeout' | 'error';
export type SubmitMode = 'after-staging' | 'immediate';

// ---------------------------------------------------------------------------------------------------
// Scorer

export type ScoredRun = { ms: number | null; outcome: Outcome; cache: CacheState };
export type S3Summary = {
  n: number;
  /** Runs that reached the verdict card. */
  verdicts: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
  thresholdMs: number;
  coldRuns: number;
  warmRuns: number;
  unknownCacheRuns: number;
  /** Every run reached the verdict card in at most the threshold. */
  allWithinThreshold: boolean;
  /** The S3 gate: allWithinThreshold, over at least 20 runs, at least 5 of them cold. */
  pass: boolean;
  /** Why the gate did not pass (empty when it did). */
  reasons: string[];
};

const r2 = (x: number) => Math.round(x * 100) / 100;

/** p50, p95 and max of `samples` (R-7, as the S4 scorer), or nulls when there are none. */
export function latencyStats(samples: number[]): { n: number; p50: number | null; p95: number | null; max: number | null } {
  if (samples.length === 0) return { n: 0, p50: null, p95: null, max: null };
  const sorted = [...samples].sort((a, b) => a - b);
  return { n: sorted.length, p50: r2(percentile(sorted, 0.5)), p95: r2(percentile(sorted, 0.95)), max: sorted.at(-1)! };
}

/**
 * The S3 gate over the automated runs (EVAL-070): every run reached the verdict card in ≤ 30 s, there are
 * at least 20 runs and at least 5 had a cold harvest-window cache. S3 names no percentile, so the gate is
 * on the maximum; p50 and p95 are reported beside it.
 */
export function scoreS3(runs: ScoredRun[]): S3Summary {
  const times = runs.filter((r) => r.outcome === 'verdict' && r.ms !== null).map((r) => r.ms!);
  const stats = latencyStats(times);
  const count = (c: CacheState) => runs.filter((r) => r.cache === c).length;
  const reasons: string[] = [];
  runs.forEach((r, i) => {
    if (r.outcome !== 'verdict' || r.ms === null) reasons.push(`run ${i + 1}: no verdict card (${r.outcome})`);
    else if (r.ms > S3_THRESHOLD_MS) reasons.push(`run ${i + 1}: ${r.ms} ms > ${S3_THRESHOLD_MS} ms`);
  });
  const allWithinThreshold = runs.length > 0 && reasons.length === 0;
  if (runs.length < S3_RUNS) reasons.push(`${runs.length} runs < ${S3_RUNS}: not a gate run`);
  if (count('cold') < S3_MIN_COLD) reasons.push(`${count('cold')} cold-cache runs < ${S3_MIN_COLD}`);
  return {
    n: runs.length,
    verdicts: times.length,
    p50: stats.p50,
    p95: stats.p95,
    max: stats.max,
    thresholdMs: S3_THRESHOLD_MS,
    coldRuns: count('cold'),
    warmRuns: count('warm'),
    unknownCacheRuns: count('unknown'),
    allWithinThreshold,
    pass: reasons.length === 0,
    reasons,
  };
}

// ---------------------------------------------------------------------------------------------------
// Arguments

export class UsageError extends Error {}

const argOf = (argv: string[], name: string): string | undefined => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  return hit === undefined ? undefined : hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '';
};

/** The perf suite: --suite (the plan's name) or --only (TKT-21's), S4 when neither is given. */
export function suiteOf(argv: string[]): string {
  const suite = argOf(argv, 'suite');
  const only = argOf(argv, 'only');
  if (suite !== undefined && only !== undefined && suite !== only) throw new UsageError(`--suite=${suite} and --only=${only} disagree`);
  return suite ?? only ?? 's4';
}

export type S3Args = { target: string; runs: number; cold: number; weakRuns: number; submit: SubmitMode; dataDir: string; formal: boolean };

const S3_FLAGS = new Set(['suite', 'only', 'target', 'runs', 'cold', 'weak-runs', 'submit', 'data-dir', 'formal']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);

/** Whether `target` is this machine (a local production build, never the reference host). */
export const isLocalTarget = (target: string): boolean => {
  const host = new URL(target).hostname;
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost') || host.startsWith('127.');
};

const int = (raw: string | undefined, fallback: number): number => (raw === undefined ? fallback : /^-?\d+$/.test(raw) ? Number(raw) : NaN);

export function parseS3Args(argv: string[], env: { DATA_DIR?: string }): S3Args {
  for (const a of argv) {
    const name = a.replace(/^--/, '').split('=')[0]!;
    if (!a.startsWith('--') || !S3_FLAGS.has(name)) {
      if (name === 'out') throw new UsageError("--out is S4's; S3 writes evals/results/local/ or, with --formal, the baseline");
      throw new UsageError(`unknown flag ${a.split('=')[0]}`);
    }
  }
  const target = argOf(argv, 'target');
  if (!target || !/^https?:\/\/[^/]/.test(target)) throw new UsageError('--target=<http(s) url> is required');
  const runs = int(argOf(argv, 'runs'), S3_RUNS);
  if (!Number.isInteger(runs) || runs < 1) throw new UsageError('--runs must be a positive integer');
  const cold = int(argOf(argv, 'cold'), Math.min(S3_MIN_COLD, runs));
  if (!Number.isInteger(cold) || cold < 1 || cold > runs) throw new UsageError('--cold must be an integer from 1 to --runs');
  if (runs > cold * MAX_RUNS_PER_WORLD) throw new UsageError(`at most ${MAX_RUNS_PER_WORLD} runs per seeded agent: raise --cold to at least ${Math.ceil(runs / MAX_RUNS_PER_WORLD)}`);
  const weakRuns = int(argOf(argv, 'weak-runs'), 3);
  if (!Number.isInteger(weakRuns) || weakRuns < 0) throw new UsageError('--weak-runs must be a non-negative integer');
  const submit = argOf(argv, 'submit') ?? 'after-staging';
  if (submit !== 'after-staging' && submit !== 'immediate') throw new UsageError('--submit must be after-staging or immediate');
  const formal = argOf(argv, 'formal') !== undefined;
  if (formal && (!target.startsWith('https://') || isLocalTarget(target))) throw new UsageError('--formal needs an https production target (the baseline is never a local run)');
  if (formal && (runs < S3_RUNS || cold < S3_MIN_COLD || submit !== 'after-staging')) throw new UsageError(`--formal is the gate run: ${S3_RUNS} runs, at least ${S3_MIN_COLD} cold, --submit=after-staging`);
  const dataDir = argOf(argv, 'data-dir') || env.DATA_DIR || './data';
  return { target, runs, cold, weakRuns, submit, dataDir, formal };
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
export function chooseWorld(intent: 'cold' | 'warm', worlds: WorldSlot[], cached: ReadonlySet<string>): WorldSlot | null {
  if (intent === 'cold') return worlds.find((w) => w.runs === 0 && !cached.has(w.plotId)) ?? null;
  const warm = worlds.filter((w) => cached.has(w.plotId) && w.runs < MAX_RUNS_PER_WORLD);
  return warm.reduce<WorldSlot | null>((best, w) => (best === null || w.runs < best.runs ? w : best), null);
}

/** The harvest-window cache's month bucket: the IST month of the receipt date (ndvi_harvest_window). */
export const monthBucket = (now: Date): string => istDate(now.toISOString()).slice(0, 7);

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
 * the split (photoHashMs), as is the background staging upload (stagingMs).
 */
export function phaseSplit(raw: RawTiming): { totalMs: number | null; phases: Phases; detail: PhaseDetail } {
  const { t0, t1, verdictIn } = raw;
  const totalMs = t0 !== null && t1 !== null ? rnd(t1 - t0) : null;
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
  return { totalMs, phases, detail };
}

// ---------------------------------------------------------------------------------------------------
// The browser runs

export type S3Run = {
  run: number;
  profile: 'reference' | 'weak';
  world: number;
  plotId: string;
  /** The cache this run was planned for, and what the target's cache table held just before Send. */
  intended: 'cold' | 'warm';
  cache: CacheState;
  /** t1 − t0, ms; null when the verdict card never showed. */
  ms: number | null;
  outcome: Outcome;
  /** The verdict card's heading (Verified, Needs a check, Not accepted, …). */
  verdict: string | null;
  phases: Phases;
  detail: PhaseDetail;
  /** Photos staged (201) before Send, and the capture request bodies' sizes. */
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

const bps = (mbps: number) => (mbps * 1_000_000) / 8;

async function applyNetwork(cdp: CDPSession, net: Network): Promise<void> {
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: net.latencyMs, downloadThroughput: bps(net.downloadMbps), uploadThroughput: bps(net.uploadMbps) });
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
  const out = execFileSync(join(REPO_ROOT, 'node_modules/.bin/tsx'), ['e2e/helpers/seed-capture.ts', '--plots', 'P01'], { cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
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
  const bodies: (number | null)[] = [];
  page.on('response', (r) => {
    if (!sending && new URL(r.url()).pathname === '/api/capture/stage' && r.status() === 201) staged++;
  });
  page.on('request', (r) => {
    // Playwright keeps a body it can read in full (the staged, photo-free picking); a body with photo bytes reads as null.
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/capture') bodies.push(r.postDataBuffer()?.length ?? null);
  });
  const cdp = await world.context.newCDPSession(page);
  const captureIds: string[] = [];
  const sendMs = new Map<string, number | null>();
  cdp.on('Network.requestWillBeSent', (e) => {
    if (e.request.method === 'POST' && new URL(e.request.url).pathname === '/api/capture') captureIds.push(e.requestId);
  });
  cdp.on('Network.responseReceived', (e) => {
    const t = e.response.timing;
    if (captureIds.includes(e.requestId)) sendMs.set(e.requestId, t && t.sendEnd >= 0 && t.sendStart >= 0 ? t.sendEnd - t.sendStart : null);
  });
  let cache: CacheState = 'unknown';
  try {
    await applyNetwork(cdp, o.net);
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
      await page.waitForFunction(() => [0, 1, 2].every((i) => performance.getEntriesByName(`udgam:stage-end:${i}`).length === 1), undefined, { timeout: 300_000, polling: 250 });
    }
    for (const k of KG) await page.locator(`#keypad [data-k="${k}"]`).click();
    // Playwright's emulated position reports once; a phone's watch reports about once a second. Set it again
    // so the fix the flow holds is fresh at Send, as on a phone (TP13), and Send does not wait 10 s for one.
    await world.context.setGeolocation({ latitude: world.seed.plots[0]!.inside.lat, longitude: world.seed.plots[0]!.inside.lng, accuracy: 8 });
    const cached = await cachedPlots(o.dataDir, [world.plotId]);
    cache = cached === null ? 'unknown' : cached.has(world.plotId) ? 'warm' : 'cold';
    sending = true;
    await page.locator('#send-btn').click();
    let outcome: Outcome = 'verdict';
    try {
      await page.locator('#verdict-h').waitFor({ state: 'visible', timeout: o.timeoutMs });
      await page.waitForFunction((m) => performance.getEntriesByName(m).length > 0, T1_MARK, { timeout: 10_000 });
      // Resource Timing records the fetch once its stream has ended (just after the verdict line).
      await page.waitForFunction((n) => performance.getEntriesByType('resource').filter((e) => new URL(e.name).pathname === '/api/capture').length >= n, captureIds.length, { timeout: 10_000 });
    } catch {
      outcome = 'timeout';
    }
    // No named helpers inside evaluated code: tsx's keepNames wraps them in __name(), which the page lacks.
    const t = await page.evaluate(
      ({ t0, t1, vin }) => {
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
            start: performance.getEntriesByType('mark').filter((m) => m.name.startsWith('udgam:stage-start:')).map((m) => m.startTime),
            end: performance.getEntriesByType('mark').filter((m) => m.name.startsWith('udgam:stage-end:')).map((m) => m.startTime),
          },
          res,
          heading: document.querySelector('#verdict-h')?.textContent?.trim() ?? null,
        };
      },
      { t0: T0_MARK, t1: T1_MARK, vin: VERDICT_IN_MARK },
    );
    const sends = captureIds.map((id) => sendMs.get(id) ?? null);
    const raw: RawTiming = { ...t, captures: t.res.map((c, i) => ({ ...c, sendMs: t.res.length === sends.length ? sends[i]! : null })) };
    const split = phaseSplit(raw);
    if (outcome === 'timeout') errors.push(`no verdict card within ${o.timeoutMs} ms`);
    return {
      world: world.index,
      plotId: world.plotId,
      cache,
      ms: outcome === 'verdict' ? split.totalMs : null,
      outcome: outcome === 'verdict' && split.totalMs === null ? 'error' : outcome,
      verdict: outcome === 'verdict' ? t.heading : null,
      phases: split.phases,
      detail: split.detail,
      stagedBeforeSend: staged,
      captureBodyBytes: bodies,
      errors: errors.slice(0, 10),
    };
  } catch (err) {
    errors.push(`run failed: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
    const none = phaseSplit({ t0: null, t1: null, verdictIn: null, signs: [], digests: [], stage: { start: [], end: [] }, captures: [] });
    return { world: world.index, plotId: world.plotId, cache, ms: null, outcome: 'error', verdict: null, phases: none.phases, detail: none.detail, stagedBeforeSend: staged, captureBodyBytes: bodies, errors: errors.slice(0, 10) };
  } finally {
    await page.close();
  }
}

export type S3Result = {
  gate: 'S3';
  case: 'EVAL-070';
  target: string;
  targetKind: 'local' | 'production';
  /** /api/health's provider block: `fixture` is not the live providers §4.3 asks for. */
  providers: Record<string, string> | 'unknown';
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
  phases: Record<keyof Phases, ReturnType<typeof latencyStats>>;
  weak: { gated: false; runs: S3Run[]; summary: ReturnType<typeof latencyStats> };
  pass: boolean;
};

export type RunS3Options = Omit<S3Args, 'formal'> & { timeoutMs?: number; log?: (line: string) => void };

async function providerHealth(target: string): Promise<S3Result['providers']> {
  try {
    const r = await fetch(new URL('/api/health', target), { signal: AbortSignal.timeout(10_000) });
    const body = (await r.json()) as { providers?: Record<string, string> };
    return body.providers ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function runS3(o: RunS3Options): Promise<S3Result> {
  const log = o.log ?? (() => undefined);
  const timeoutMs = o.timeoutMs ?? 120_000;
  const providers = await providerHealth(o.target);
  const { chromium } = await import('@playwright/test');
  const { injectDevice } = await import('../../e2e/helpers/capture');
  const executablePath = process.env.PW_CHROMIUM_PATH ?? (!process.env.CI && existsSync(PRE_INSTALLED) ? PRE_INSTALLED : undefined);
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const open = async (index: number): Promise<World> => {
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
    return { index, plotId: seed.plots[0]!.id, runs: 0, seed, context };
  };

  const series = async (profile: 'reference' | 'weak', plan: ('cold' | 'warm')[], worlds: World[], net: Network): Promise<S3Run[]> => {
    const out: S3Run[] = [];
    for (const [i, intended] of plan.entries()) {
      const cached = (await cachedPlots(o.dataDir, worlds.map((w) => w.plotId))) ?? new Set<string>();
      const slot = chooseWorld(intended, worlds, cached) ?? worlds.reduce((a, b) => (b.runs < a.runs ? b : a));
      const world = worlds.find((w) => w.index === slot.index)!;
      world.runs++;
      const m = await measure(world, { target: o.target, net, submit: o.submit, dataDir: o.dataDir, timeoutMs: profile === 'weak' ? timeoutMs * 2 : timeoutMs });
      const r: S3Run = { run: i + 1, profile, intended, ...m };
      log(`  ${profile} run ${r.run}/${plan.length} (${r.cache}): ${r.ms === null ? r.outcome : `${r.ms} ms, ${r.verdict}`}`);
      out.push(r);
    }
    return out;
  };

  try {
    const worlds: World[] = [];
    for (let i = 0; i < o.cold; i++) worlds.push(await open(i));
    log(`seeded ${worlds.length} capture worlds into ${o.dataDir}`);
    const runs = await series('reference', planRuns(o.runs, o.cold), worlds, EV9_NETWORK);
    const weakWorlds: World[] = [];
    for (let i = 0; i < Math.ceil(o.weakRuns / MAX_RUNS_PER_WORLD); i++) weakWorlds.push(await open(o.cold + i));
    const weakRuns = o.weakRuns > 0 ? await series('weak', planRuns(o.weakRuns, weakWorlds.length), weakWorlds, WEAK_NETWORK) : [];
    for (const w of [...worlds, ...weakWorlds]) await w.context.close();

    const summary = scoreS3(runs);
    const ok = runs.filter((r) => r.outcome === 'verdict');
    const phaseKeys: (keyof Phases)[] = ['gpsMs', 'hashSignMs', 'resendMs', 'uploadMs', 'verifyMs', 'responseMs'];
    const phases = Object.fromEntries(phaseKeys.map((k) => [k, latencyStats(ok.map((r) => r.phases[k]).filter((x): x is number => x !== null))])) as S3Result['phases'];
    const local = isLocalTarget(o.target);
    const live = providers !== 'unknown' && Object.values(providers).every((v) => v === 'ok');
    return {
      gate: 'S3',
      case: 'EVAL-070',
      target: o.target,
      targetKind: local ? 'local' : 'production',
      providers,
      assumptions: [
        'HR3 waived (TP29): the 10/5 Mbit/s, 80 ms network profile is the EV9 placeholder, not a field measurement.',
        'HR3 waived (TP29): photos are AI-generated demo photos padded to the 4 MB placeholder size, not the demo phone’s real size.',
        'Chromium CDP network emulation on this host, not a phone on a rural link; no CPU throttling.',
        ...(live ? [] : ['Remote sensing is not the live providers (see `providers`): the provider wait is not representative of §4.3.']),
        ...(local ? ['Local production build on this host, not the production (Oracle A1) host.'] : []),
        o.submit === 'after-staging'
          ? 'Send is tapped once the three photos are staged (TSK-30.5): their upload is outside t0→t1 and reported as detail.stagingMs.'
          : 'Send is tapped right after typing the weight: staging still running is aborted and the photos go with the picking.',
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
      weak: { gated: false, runs: weakRuns, summary: latencyStats(weakRuns.filter((r) => r.outcome === 'verdict' && r.ms !== null).map((r) => r.ms!)) },
      pass: summary.pass,
    };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------------------------------
// CLI (called by evals/perf/run.ts for --suite=s3)

/** Run the S3 suite from the command line; returns the exit code (0 = the gate passed). */
export async function s3Cli(argv: string[], env: { DATA_DIR?: string } = { DATA_DIR: process.env.DATA_DIR }): Promise<number> {
  let args: S3Args;
  try {
    args = parseS3Args(argv, env);
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(`eval:perf: ${err.message}\nusage: pnpm eval:perf --suite=s3 --target=<url> [--runs=20] [--cold=5] [--weak-runs=3] [--submit=after-staging|immediate] [--data-dir=<dir>] [--formal]`);
    return 2;
  }
  const started = Date.now();
  // Refused before seeding or measuring: a formal file is never rewritten and comes only from a clean tree.
  const before = treeState();
  const formalFile = join(RESULTS_DIR, `baseline-perf-v1-s3-${before.shortSha}.json`);
  if (args.formal && existsSync(formalFile)) {
    console.error(`eval:perf: refusing to overwrite ${formalFile}: perf results are never rewritten`);
    return 2;
  }
  if (args.formal && before.dirty) {
    console.error(`eval:perf: --formal needs a clean tree at one commit (${before.changes.length} change(s))`);
    return 2;
  }
  console.log(`S3 (EVAL-070) against ${args.target}: ${args.runs} runs (${args.cold} cold), ${args.weakRuns} weak-network runs, submit ${args.submit}`);
  const result = await runS3({ ...args, log: (l) => console.log(l) });
  const git = treeState();
  const out = {
    ...result,
    provenance: {
      harness: { name: 'udgam-eval-perf', version: '0.1.0' },
      appVersion: appVersion(),
      git,
      environment: process.env.CI ? 'ci' : 'local',
      formal: args.formal,
      node: process.version,
      os: { platform: platform(), arch: arch() },
      hardware: hostHardware(),
      timestampUtc: new Date().toISOString(),
      durationMs: Date.now() - started,
    },
  };
  const file = args.formal ? writePerfResult(formalFile, out) : writePerfResult(join(RESULTS_DIR, 'local', `perf-s3-${git.shortSha}.json`), out, { overwrite: true });
  const s = result.summary;
  const p = result.phases;
  const fmt = (x: number | null) => (x === null ? '—' : `${Math.round(x)}`);
  console.log(
    `S3 ${s.pass ? 'PASS' : 'FAIL'} (${result.targetKind}): ${s.n} runs, ${s.verdicts} verdicts, ${s.coldRuns} cold / ${s.warmRuns} warm / ${s.unknownCacheRuns} unknown; ` +
      `p50 ${fmt(s.p50)} ms, p95 ${fmt(s.p95)} ms, max ${fmt(s.max)} ms (every run ≤ ${s.thresholdMs} ms: ${s.allWithinThreshold ? 'yes' : 'no'})` +
      (s.reasons.length > 0 ? `\n  not a pass: ${s.reasons.join('; ')}` : '') +
      `\n  phases p50 (ms): GPS ${fmt(p.gpsMs.p50)}, hash+sign ${fmt(p.hashSignMs.p50)}, upload ${fmt(p.uploadMs.p50)}, verify ${fmt(p.verifyMs.p50)}, response ${fmt(p.responseMs.p50)}` +
      (result.weak.runs.length > 0 ? `\n  weak network (no gate): ${result.weak.summary.n} verdicts of ${result.weak.runs.length}, p50 ${fmt(result.weak.summary.p50)} ms, max ${fmt(result.weak.summary.max)} ms` : '') +
      `\n  providers: ${typeof result.providers === 'string' ? result.providers : JSON.stringify(result.providers)}` +
      `\nwrote ${file}`,
  );
  return s.pass ? 0 : 1;
}
