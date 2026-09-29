import { beforeAll, describe, expect, it } from 'vitest';
import { makeContext, makeDevice, makeSubmission, type TestDevice } from '../../../../tests/helpers/verify';
import { CONFIG } from '../config';
import { REGISTRY, type Check } from '../registry';
import type { VerifyContext } from '../types';
import { runCheck, verify } from '../verify';

// TC-038 (threshold part), TSK-09.3, §6.3 and TP6: s = ((seasonCherryKgBefore + cherryKg) × ratio ÷ areaHa)
// ÷ maxKgHa, compared unrounded against cfg-1.yield (flag above 1.5×U, hard fail above 2×U). The reference
// here (1000 kg/ha clean, ratio 0.25, 1 ha) makes U = 4000 kg of cherry, so every boundary is exact in
// binary floating point; the capture itself is 50 kg.

let dev: TestDevice;
beforeAll(async () => {
  dev = await makeDevice();
});

const yieldCheck = (): Check => {
  const c = REGISTRY.find((x) => x.id === 'yield_plausibility');
  if (!c) throw new Error('yield_plausibility is not in the registry');
  return c;
};

const U_KG = 4000;
const KG = 50;
const REF = { maxKgHa: 1000, cherryToCleanRatio: 0.25, source: 'test reference' };
const plot = (over: Partial<VerifyContext['plot']> = {}): VerifyContext['plot'] => ({ ...makeContext(dev).plot, areaHa: 1, ...over });

/** The check at season ratio `s` after this capture (before = s·U − 50 kg). */
async function at(s: number, over: Partial<VerifyContext> = {}) {
  const sub = await makeSubmission({ device: dev, cherryKg: KG });
  const ctx = makeContext(dev, { plot: plot(), yieldReference: REF, seasonCherryKgBefore: s * U_KG - KG, ...over });
  return runCheck(yieldCheck(), sub, ctx, CONFIG);
}

describe('yield_plausibility thresholds (TC-038)', () => {
  it.each([
    [1.45, 'ok', false, '1.45x'],
    [1.5, 'ok', false, '1.50x'],
    [1.51, 'flag', false, '1.51x'],
    [1.6, 'flag', false, '1.60x'],
    [1.95, 'flag', false, '1.95x'],
    [2.0, 'flag', false, '2.00x'],
    [2.05, 'fail', true, '2.05x'],
    [2.5, 'fail', true, '2.50x'],
    [3.0, 'fail', true, '3.00x'],
  ] as const)('season %f×U → %s (hardFail %s), evidence names %s', async (s, status, hardFail, shown) => {
    const r = await at(s);
    expect(r).toMatchObject({ id: 'yield_plausibility', status, hardFail });
    expect(r.evidence).toBe(`Season total ${shown} the reference upper bound (flag above 1.50x, hard fail above 2.00x)`);
  });

  it('compares the unrounded ratio: 1.504×U shows "1.50x" but flags; 2.004×U shows "2.00x" but hard-fails', async () => {
    expect(await at(1.504)).toMatchObject({ status: 'flag', evidence: expect.stringContaining('1.50x') });
    expect(await at(2.004)).toMatchObject({ status: 'fail', hardFail: true, evidence: expect.stringContaining('2.00x') });
  });

  it('evidence template (§6.5) for 2.05×U', async () => {
    expect((await at(2.05)).evidence).toBe('Season total 2.05x the reference upper bound (flag above 1.50x, hard fail above 2.00x)');
  });

  it('EVAL-049 salami: 1.8×U before and 2.1×U after → hard fail, though the capture alone is only 0.3×U', async () => {
    const sub = await makeSubmission({ device: dev, cherryKg: 0.3 * U_KG });
    const ctx = makeContext(dev, { plot: plot(), yieldReference: REF, seasonCherryKgBefore: 1.8 * U_KG });
    expect(await runCheck(yieldCheck(), sub, ctx, CONFIG)).toMatchObject({ status: 'fail', hardFail: true, evidence: expect.stringContaining('2.10x') });
    // …and the same kg on a fresh season is fine: it is the season total that is judged
    expect(await runCheck(yieldCheck(), sub, { ...ctx, seasonCherryKgBefore: 0 }, CONFIG)).toMatchObject({ status: 'ok' });
  });

  it('converts cherry to clean once and normalises per hectare: the same kg on a 0.4 ha plot is 2.5× the ratio', async () => {
    const sub = await makeSubmission({ device: dev, cherryKg: 500 });
    const ctx = makeContext(dev, { plot: plot({ areaHa: 0.4 }), yieldReference: REF, seasonCherryKgBefore: 1500 });
    // (1500 + 500) × 0.25 ÷ 0.4 ÷ 1000 = 1.25
    expect(await runCheck(yieldCheck(), sub, ctx, CONFIG)).toMatchObject({ status: 'ok', evidence: expect.stringContaining('1.25x') });
  });

  it('no reference row for the crop → unavailable "No yield reference for <crop>"', async () => {
    const r = await at(1, { yieldReference: null, plot: plot({ crop: 'robusta' }) });
    expect(r).toMatchObject({ status: 'unavailable', hardFail: false, evidence: 'No yield reference for robusta' });
  });

  it('a hard fail rejects the capture; a flag caps it at Needs Review (cfg-1 flagCaps)', async () => {
    const sub = await makeSubmission({ device: dev, cherryKg: KG });
    const ctx = (s: number) => makeContext(dev, { plot: plot(), yieldReference: REF, seasonCherryKgBefore: s * U_KG - KG });
    const only = { enabled: ['signature_valid', 'yield_plausibility'] as const };
    expect((await verify(sub, ctx(2.05), { enabled: [...only.enabled] })).verdict).toBe('Rejected');
    const flagged = await verify(sub, ctx(1.6), { enabled: [...only.enabled] });
    expect(flagged.verdict).toBe('Needs Review');
    expect(flagged.capReasons.join(' ')).toContain('yield_plausibility');
  });
});
