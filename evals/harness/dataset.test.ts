import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DATASET_PATH, DatasetError, loadDataset } from './dataset';

// TC-017: the dataset loads and validates against its JSON Schema (2020-12); an unknown mutation op
// or a duplicate ID fails naming the offending path.

type Raw = { cases: { id: string; input: { mutations?: { op: string }[] } }[] };

function tempCopy(mutate: (raw: Raw) => void): string {
  const raw = JSON.parse(readFileSync(DATASET_PATH, 'utf8')) as Raw;
  mutate(raw);
  const dir = mkdtempSync(join(tmpdir(), 'udgam-dataset-'));
  // The schema is referenced relatively; loadDataset always validates against the committed schema.
  const path = join(dir, 'eval-dataset.json');
  writeFileSync(path, JSON.stringify(raw, null, 2));
  return path;
}

describe('loadDataset (TC-017)', () => {
  it('loads the committed dataset with its version and SHA-256', () => {
    const ds = loadDataset();
    expect(ds.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(ds.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(ds.cases.length).toBeGreaterThanOrEqual(105);
    expect(ds.cases.find((c) => c.id === 'EVAL-001')?.suite).toBe('harness-verifier');
  });

  it('rejects an unknown mutation op, naming /cases/…/mutations/…/op', () => {
    const path = tempCopy((raw) => {
      const c = raw.cases.find((x) => x.id === 'EVAL-022')!;
      c.input.mutations![0]!.op = 'teleport';
    });
    let err: unknown;
    try {
      loadDataset(path);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DatasetError);
    expect((err as DatasetError).message).toMatch(/\/cases\/\d+\/input\/mutations\/0\/op/);
  });

  it('rejects a duplicate EVAL-001', () => {
    const path = tempCopy((raw) => {
      const dup = JSON.parse(JSON.stringify(raw.cases[0])) as Raw['cases'][number];
      raw.cases.push(dup);
    });
    expect(() => loadDataset(path)).toThrow(/duplicate case id EVAL-001 at \/cases\/\d+\/id/);
  });

  it('scenario 1 (GPS spoofing) has at least ten active S1 attack cases (TKT-08, TSK-08.6)', () => {
    const s1 = loadDataset().cases.filter((c) => c.scenario === 1 && c.case_class === 'attack' && c.status === 'active' && c.gates.includes('S1'));
    expect(s1.length).toBeGreaterThanOrEqual(10);
  });

  it('rejects a base_case that does not exist', () => {
    const path = tempCopy((raw) => {
      (raw.cases.find((x) => x.id === 'EVAL-002')!.input as { base_case?: string }).base_case = 'EVAL-999';
    });
    expect(() => loadDataset(path)).toThrow(/EVAL-999/);
  });

  it('rejects a harness-verifier case with neither verdict nor acceptable_verdicts (it would assert nothing)', () => {
    const path = tempCopy((raw) => {
      const c = raw.cases.find((x) => x.id === 'EVAL-022') as unknown as { expected: Record<string, unknown> };
      delete c.expected.verdict;
      delete c.expected.acceptable_verdicts;
    });
    expect(() => loadDataset(path)).toThrow(/\/cases\/\d+\/expected needs verdict or acceptable_verdicts \(EVAL-022, harness-verifier\)/);
  });

  it('every harness-verifier case in the committed dataset names a verdict or acceptable verdicts', () => {
    const ds = loadDataset();
    const hv = ds.cases.filter((c) => c.suite === 'harness-verifier');
    expect(hv.filter((c) => !c.expected.verdict && !c.expected.acceptable_verdicts).map((c) => c.id)).toEqual([]);
  });
});
