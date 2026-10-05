import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { relative, resolve } from 'node:path';
import { YIELD_REFERENCE_ROWS, YIELD_REFERENCE_VERSION } from '../../src/lib/yield/reference-data';
import { CONFIG, CONFIG_HASH } from '../../src/lib/verification/config';
import { MB_CONFIG, MB_CONFIG_HASH, PROCESSES, isPlaceholderBand } from '../../src/lib/processing/config';
import type { CheckId } from '../../src/lib/verification/types';
import { PLACEHOLDER_YIELD_REFERENCE } from './context';
import { EVALS_DIR, type Dataset, type Suite } from './dataset';

// Run provenance (evaluation-plan §12, technical-plan §13): everything needed to reproduce a result
// or to tell two results apart. Model, prompt and retrieval fields do not apply (no AI category).

export const HARNESS_VERSION = '0.1.0';
export const REPO_ROOT = resolve(EVALS_DIR, '..');
/** The fixture generator's output format; bump when evals/harness/fixtures.ts changes what it writes. */
export const FIXTURE_SET_VERSION = 'generated-v1';

export type Provenance = {
  harness: { name: string; version: string };
  appVersion: string;
  git: { commit: string; shortSha: string; branch: string; dirty: boolean };
  environment: 'local' | 'ci';
  dataset: { path: string; version: string; sha256: string };
  fixtures: { version: string; sha256: string; files: number };
  config: { version: string; hash: string; mode: 'full' | 'ledger-only'; enabledChecks: CheckId[]; object: typeof CONFIG };
  registry: { checks: CheckId[]; missing: CheckId[] };
  /** The processor mass-balance bands (TSK-26.1, M-002), with the processes whose band is a placeholder. Absent in older results. */
  massBalance?: { version: string; hash: string; placeholderBands: string[] };
  provider: 'fixture' | 'live';
  yieldReference: {
    version: string;
    source: 'placeholder' | 'Coffee-Board-verified';
    placeholder: boolean;
    row: { maxKgHa: number; cherryToCleanRatio: number };
    /** What the app itself seeds (TKT-09, TC-039); the harness runs on the synthetic U above. Absent in older results. */
    app?: { version: string; yields: 'Coffee Board'; cherryRatio: 'industry estimate, unverified'; maxKgHa: { arabica: number; robusta: number } };
  };
  ledger: 'hashchain' | 'evm';
  node: string;
  os: { platform: string; arch: string };
  suites: Suite[];
  seed: number;
  timestampUtc: string;
  durationMs: number;
};

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function gitFacts(): Provenance['git'] {
  const commit = git(['rev-parse', 'HEAD']) ?? 'unknown';
  return {
    commit,
    shortSha: git(['rev-parse', '--short', 'HEAD']) ?? 'unknown',
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'unknown',
    dirty: (git(['status', '--porcelain']) ?? '') !== '',
  };
}

export function appVersion(): string {
  return (JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as { version: string }).version;
}

/** SHA-256 over every fixture file's repo-relative path and SHA-256, in path order. */
export function fixtureSetHash(files: string[]): string {
  const lines = [...files]
    .map((f) => `${relative(REPO_ROOT, f)} ${createHash('sha256').update(readFileSync(f)).digest('hex')}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(lines).digest('hex');
}

export type ProvenanceInput = {
  dataset: Dataset;
  fixtureFiles: string[];
  mode: 'full' | 'ledger-only';
  enabledChecks: CheckId[];
  registryChecks: CheckId[];
  provider: 'fixture' | 'live';
  suites: Suite[];
  seed: number;
  startedAt: Date;
  durationMs: number;
  environment?: 'local' | 'ci';
  /** The ledger adapter the harness-proof suite ran on (default hashchain; --ledger=evm, TSK-24.8). */
  ledger?: 'hashchain' | 'evm';
};

export function provenance(i: ProvenanceInput): Provenance {
  return {
    harness: { name: 'udgam-eval-harness', version: HARNESS_VERSION },
    appVersion: appVersion(),
    git: gitFacts(),
    // Read directly, not through src/lib/config/env.ts: eval tooling sits outside the app, and CI is a
    // non-secret flag set by the CI runner (it only labels the run, it changes no behaviour).
    environment: i.environment ?? (process.env.CI ? 'ci' : 'local'),
    dataset: { path: relative(REPO_ROOT, i.dataset.path), version: i.dataset.version, sha256: i.dataset.sha256 },
    fixtures: { version: FIXTURE_SET_VERSION, sha256: fixtureSetHash(i.fixtureFiles), files: i.fixtureFiles.length },
    config: { version: CONFIG.version, hash: CONFIG_HASH, mode: i.mode, enabledChecks: i.enabledChecks, object: CONFIG },
    registry: { checks: i.registryChecks, missing: i.enabledChecks.filter((id) => !i.registryChecks.includes(id)) },
    massBalance: { version: MB_CONFIG.version, hash: MB_CONFIG_HASH, placeholderBands: PROCESSES.filter(isPlaceholderBand) },
    provider: i.provider,
    yieldReference: {
      version: 'placeholder-U (technical-plan TSK-03.4)',
      source: 'placeholder',
      placeholder: true,
      row: { maxKgHa: PLACEHOLDER_YIELD_REFERENCE.maxKgHa, cherryToCleanRatio: PLACEHOLDER_YIELD_REFERENCE.cherryToCleanRatio },
      app: {
        version: YIELD_REFERENCE_VERSION,
        yields: 'Coffee Board',
        cherryRatio: 'industry estimate, unverified',
        maxKgHa: {
          arabica: YIELD_REFERENCE_ROWS.find((r) => r.crop === 'arabica')!.maxKgHa,
          robusta: YIELD_REFERENCE_ROWS.find((r) => r.crop === 'robusta')!.maxKgHa,
        },
      },
    },
    ledger: i.ledger ?? 'hashchain',
    node: process.version,
    os: { platform: platform(), arch: arch() },
    suites: i.suites,
    seed: i.seed,
    timestampUtc: i.startedAt.toISOString(),
    durationMs: i.durationMs,
  };
}
