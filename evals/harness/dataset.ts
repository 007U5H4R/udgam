import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import type { CheckId, CheckStatus, Verdict } from '../../src/lib/verification/types';

// Dataset loader and validator (technical-plan §22 TSK-03.1, TC-017). The dataset is validated
// against evals/eval-dataset.schema.json (JSON Schema 2020-12) with ajv, then for the rules a schema
// cannot express: unique case IDs and references (base_case, reuse_media.from_case,
// context.seen_media_from) that point at existing cases.

const HERE = dirname(fileURLToPath(import.meta.url));
export const EVALS_DIR = resolve(HERE, '..');
export const DATASET_PATH = join(EVALS_DIR, 'eval-dataset.json');
export const SCHEMA_PATH = join(EVALS_DIR, 'eval-dataset.schema.json');

export type Suite = 'harness-verifier' | 'harness-proof' | 'integration' | 'e2e' | 'perf' | 'ci' | 'manual';
export type CaseClass = 'legitimate' | 'legitimate_edge' | 'attack' | 'known_limitation';
export type CaseStatus = 'active' | 'stretch' | 'pending_decision' | 'retired';

export type Mutation = { op: string; [param: string]: unknown };

export type EvalCase = {
  id: string;
  title: string;
  feature: string;
  category: string;
  suite: Suite;
  case_class?: CaseClass | null;
  scenario?: number | null;
  gates: string[];
  critical_conditions?: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  automated: boolean;
  milestone: string;
  status: CaseStatus;
  depends_on?: string[];
  input: {
    plot?: string;
    device?: string;
    base_case?: string;
    mutations?: Mutation[];
    context?: { seen_media_from?: string[]; [k: string]: unknown };
    description?: string;
  };
  expected: {
    verdict?: Verdict;
    acceptable_verdicts?: Verdict[];
    catching_checks?: CheckId[];
    hard_fail_checks?: CheckId[];
    check_status?: Partial<Record<CheckId, CheckStatus>>;
    evidence_substrings?: Partial<Record<CheckId, string[]>>;
    http_status?: number;
    max_latency_ms?: number;
    behavior?: string;
  };
  failure_conditions: string[];
  pair?: string;
  tags?: string[];
  notes?: string;
};

export type PlotSpec = {
  id: string;
  role: 'legitimate' | 'legitimate_edge' | 'adversarial';
  area_ha: number;
  shape: 'convex' | 'irregular' | 'concave_L';
  remote_sensing: {
    deforestation_loss_pct_inside: number;
    loss_adjacent_outside?: boolean;
    ndvi_history: 'perennial_canopy' | 'annual_crop' | 'cleared_then_planted';
    ndvi_harvest_window: 'living_canopy' | 'bare' | 'cloud_blocked';
  };
  notes?: string;
};

export type DeviceSpec = { id: string; agent: string | null; state: 'enrolled' | 'revoked' | 'never_enrolled'; notes?: string };

export type Dataset = {
  path: string;
  version: string;
  sha256: string;
  fixtures: { yield_reference: { unit: 'U'; note: string }; plots: PlotSpec[]; devices: DeviceSpec[] };
  cases: EvalCase[];
};

export class DatasetError extends Error {
  constructor(
    message: string,
    readonly problems: string[],
  ) {
    super(message);
    this.name = 'DatasetError';
  }
}

type AjvError = { instancePath: string; message?: string; params?: Record<string, unknown> };

function schemaProblems(data: unknown): string[] {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (validate(data)) return [];
  const errors = (validate.errors ?? []) as AjvError[];
  // allErrors also reports the failed `if` branch of each allOf; keep the errors that name a field.
  const out = errors
    .filter((e) => e.message !== 'must match "then" schema')
    .map((e) => {
      const allowed = e.params && 'allowedValues' in e.params ? ` (allowed: ${(e.params.allowedValues as unknown[]).join(', ')})` : '';
      return `${e.instancePath || '/'} ${e.message ?? 'is invalid'}${allowed}`;
    });
  return [...new Set(out)];
}

function referenceProblems(cases: EvalCase[]): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  cases.forEach((c, i) => {
    if (seen.has(c.id)) problems.push(`duplicate case id ${c.id} at /cases/${i}/id (first at /cases/${seen.get(c.id)}/id)`);
    else seen.set(c.id, i);
  });
  cases.forEach((c, i) => {
    const ref = (id: unknown, path: string) => {
      if (typeof id === 'string' && !seen.has(id)) problems.push(`${path} refers to ${id}, which is not in the dataset`);
    };
    ref(c.input?.base_case, `/cases/${i}/input/base_case`);
    (c.input?.mutations ?? []).forEach((m, j) => {
      if (m.op === 'reuse_media') ref(m.from_case, `/cases/${i}/input/mutations/${j}/from_case`);
    });
    (c.input?.context?.seen_media_from ?? []).forEach((id, j) => ref(id, `/cases/${i}/input/context/seen_media_from/${j}`));
  });
  // A base_case cycle would make case construction recurse forever.
  const byId = new Map(cases.map((c) => [c.id, c]));
  for (const c of cases) {
    const chain = new Set<string>([c.id]);
    let next = c.input?.base_case;
    while (next && byId.has(next)) {
      if (chain.has(next)) {
        problems.push(`base_case cycle through ${[...chain, next].join(' → ')}`);
        break;
      }
      chain.add(next);
      next = byId.get(next)!.input?.base_case;
    }
  }
  return problems;
}

/** Load and validate the dataset (default: the committed evals/eval-dataset.json). Throws DatasetError. */
export function loadDataset(path: string = DATASET_PATH): Dataset {
  const bytes = readFileSync(path);
  let data: unknown;
  try {
    data = JSON.parse(bytes.toString('utf8'));
  } catch (e) {
    throw new DatasetError(`${path}: not JSON (${(e as Error).message})`, ['/ not JSON']);
  }
  const problems = schemaProblems(data);
  const raw = data as { dataset_version: string; fixtures: Dataset['fixtures']; cases: EvalCase[] };
  if (problems.length === 0) problems.push(...referenceProblems(raw.cases));
  if (problems.length > 0) {
    throw new DatasetError(`${path} is invalid:\n  ${problems.join('\n  ')}`, problems);
  }
  return {
    path,
    version: raw.dataset_version,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    fixtures: raw.fixtures,
    cases: raw.cases,
  };
}

function main(argv: string[]): number {
  const fileArg = argv.find((a) => !a.startsWith('--'));
  try {
    const ds = loadDataset(fileArg ? resolve(fileArg) : DATASET_PATH);
    console.log(`dataset ${ds.version} valid: ${ds.cases.length} cases, sha256 ${ds.sha256}`);
    return 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
