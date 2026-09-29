import { beforeAll, describe, expect, it } from 'vitest';
import { generateDeviceKeys, loadHarnessInputs, type DeviceKeys, type HarnessInputs } from './context';
import { loadDataset, type EvalCase } from './dataset';
import { buildCase, InvalidMutationParam } from './mutate';
import { knownLimitationRows } from './report';
import type { ResultsFile } from './run';

// TSK-09.7 (TKT-09): the replay (scenario 2) and yield (scenario 4) attack sets each hold at least ten
// active S1 cases, and the report's "Known limitations" section names EVAL-029, EVAL-036 and GAP-7 (the
// salami captures that are not re-scored, EVAL-049) with their verdicts.

describe('scenario 2 and 4 attack sets (TSK-09.7)', () => {
  const ds = loadDataset();
  const activeS1 = (scenario: number) =>
    ds.cases.filter((c) => c.scenario === scenario && c.status === 'active' && c.case_class === 'attack' && c.gates.includes('S1')).map((c) => c.id);

  it.each([2, 4])('scenario %i has at least ten active S1 attack cases', (scenario) => {
    expect(activeS1(scenario).length).toBeGreaterThanOrEqual(10);
  });

  it('the new cases EVAL-114 to EVAL-121 are there, scenario 2 then scenario 4', () => {
    expect(activeS1(2)).toEqual(expect.arrayContaining(['EVAL-114', 'EVAL-115', 'EVAL-116', 'EVAL-117']));
    expect(activeS1(4)).toEqual(expect.arrayContaining(['EVAL-118', 'EVAL-119', 'EVAL-120', 'EVAL-121']));
    expect(ds.version).toBe('0.5.0');
  });
});

describe('Known limitations rows (TSK-09.7)', () => {
  const caseOf = (id: string, scenario: number, verdict: string, caseClass: string, behavior?: string) =>
    ({ id, scenario, caseClass, outcome: 'passed', result: { verdict }, expected: behavior ? { behavior } : {} }) as unknown as ResultsFile['cases'][number];

  it('lists EVAL-029, EVAL-036 and GAP-7 (through EVAL-049) with their verdicts', () => {
    const rows = knownLimitationRows({
      knownLimitations: [
        { id: 'EVAL-029', scenario: 1, outcome: 'passed', verdict: 'Verified', behavior: 'Recorded, not scored.' },
        { id: 'EVAL-036', scenario: 2, outcome: 'passed', verdict: 'Needs Review', behavior: 'Recorded, not scored.' },
      ],
      cases: [caseOf('EVAL-049', 4, 'Rejected', 'attack')],
    } as unknown as ResultsFile);
    expect(rows.map((r) => r[0])).toEqual(['EVAL-029', 'EVAL-036', 'GAP-7 (EVAL-049)']);
    expect(rows[2]).toEqual(['GAP-7 (EVAL-049)', '4', 'Rejected', expect.stringMatching(/not re-scored/)]);
  });

  it('still names GAP-7 when EVAL-049 did not run', () => {
    const rows = knownLimitationRows({ knownLimitations: [], cases: [] } as unknown as ResultsFile);
    expect(rows).toEqual([['GAP-7 (EVAL-049)', '4', '—', expect.stringMatching(/not re-scored/)]]);
  });
});

describe('harness extensions the new cases use (TSK-09.7)', () => {
  const ds = loadDataset();
  const byId = new Map(ds.cases.map((c) => [c.id, c]));
  let inputs: HarnessInputs;
  let keys: DeviceKeys;
  beforeAll(async () => {
    inputs = loadHarnessInputs(ds);
    keys = await generateDeviceKeys(ds);
  });
  const build = (c: EvalCase) => buildCase(c, inputs, keys);

  it('reuse_media which: 2 reuses the first two of the source’s photos (EVAL-114 → "2 of 3")', async () => {
    const b = await build(byId.get('EVAL-114')!);
    const src = await build(byId.get('EVAL-004')!);
    const hashes = b.submission.payload.media.map((m) => m.sha256);
    expect(hashes.slice(0, 2)).toEqual(src.submission.payload.media.slice(0, 2).map((m) => m.sha256));
    expect(hashes[2]).not.toBe(src.submission.payload.media[2]!.sha256);
    expect(b.context.seenMediaHashes.size).toBe(2);
  });

  it('refuses a reuse count outside 1–3', async () => {
    const bad = { ...byId.get('EVAL-114')!, id: 'EVAL-901', input: { ...byId.get('EVAL-114')!.input, mutations: [{ op: 'reuse_media', from_case: 'EVAL-004', which: 4 }] } };
    await expect(build(bad)).rejects.toBeInstanceOf(InvalidMutationParam);
  });

  it('input.context.crop overrides the fixture crop (EVAL-121 is robusta on P08); other cases stay arabica', async () => {
    expect((await build(byId.get('EVAL-121')!)).context.plot).toMatchObject({ id: 'P08', crop: 'robusta' });
    expect((await build(byId.get('EVAL-046')!)).context.plot).toMatchObject({ id: 'P08', crop: 'arabica' });
    const bad = { ...byId.get('EVAL-121')!, id: 'EVAL-902', input: { ...byId.get('EVAL-121')!.input, context: { crop: 'liberica' } } };
    await expect(build(bad)).rejects.toThrow(/context.crop/);
  });

  it('notes a picking the capture schema would refuse (EVAL-049: 3000 kg), and none for EVAL-120 (400 kg)', async () => {
    const salami = await build(byId.get('EVAL-049')!);
    expect(salami.submission.payload.cherryKg).toBe(3000);
    expect(salami.notes).toEqual([expect.stringContaining('outside the capture schema')]);
    const small = await build(byId.get('EVAL-120')!);
    expect(small.submission.payload.cherryKg).toBe(400);
    expect(small.notes).toEqual([]);
  });
});
