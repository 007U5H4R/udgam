import { describe, expect, it } from 'vitest';
import { assertCase, normaliseEvidence } from './case-assertions';
import { check, evalCase, verifyResult } from './testing';

// case-assertions (evaluation-plan §8): verdict ∈ acceptable (or == verdict), check_status, hardFail on
// hard_fail_checks, attribution for attacks (EV4), evidence_substrings (lowercase, whitespace stripped).

const attack = evalCase({
  id: 'EVAL-022',
  case_class: 'attack',
  scenario: 1,
  expected: {
    acceptable_verdicts: ['Needs Review', 'Rejected'],
    catching_checks: ['geofence'],
    check_status: { geofence: 'fail' },
    evidence_substrings: { geofence: ['2400 m'] },
  },
});

describe('assertCase', () => {
  it('passes a detected attack with the evidence the dataset names', () => {
    const r = verifyResult('Needs Review', [check('geofence', 'fail', { evidence: '2400 m outside the plot edge (allowance 8 m)' })]);
    const a = assertCase(attack, r);
    expect(a.pass).toBe(true);
    expect(a.detected).toBe(true);
    expect(a.assertions.map((x) => x.name)).toEqual(['verdict', 'check_status.geofence', 'attribution', 'evidence.geofence: "2400 m"']);
  });

  it('matches evidence case-insensitively with all whitespace stripped', () => {
    expect(normaliseEvidence(' 2400  M\tOutside ')).toBe('2400moutside');
    const r = verifyResult('Rejected', [check('geofence', 'fail', { evidence: '2400m OUTSIDE' })]);
    expect(assertCase(attack, r).pass).toBe(true);
  });

  it('a Verified attack is not detected and fails the verdict assertion', () => {
    const r = verifyResult('Verified', [check('geofence', 'fail', { evidence: '2400 m' })]);
    const a = assertCase(attack, r);
    expect(a.pass).toBe(false);
    expect(a.detected).toBe(false);
    expect(a.assertions.find((x) => x.name === 'verdict')).toMatchObject({ pass: false, detail: expect.stringContaining('Verified') });
  });

  it('an attack in Needs Review only because a check was unavailable is NOT detected (EV4 attribution)', () => {
    const lucky = evalCase({
      id: 'EVAL-040',
      case_class: 'attack',
      scenario: 3,
      expected: { acceptable_verdicts: ['Needs Review', 'Rejected'], catching_checks: ['deforestation_overlap'] },
    });
    const r = verifyResult('Needs Review', [check('deforestation_overlap', 'unavailable'), check('geofence', 'ok')], {
      unavailableProviders: ['gfw'],
      capReasons: ['anyUnavailable'],
    });
    const a = assertCase(lucky, r);
    expect(a.detected).toBe(false);
    expect(a.pass).toBe(false);
    expect(a.assertions.find((x) => x.name === 'attribution')).toMatchObject({ pass: false });
  });

  it('a detected attack whose evidence is generic still fails the case (functional gate), but counts as detected', () => {
    const r = verifyResult('Needs Review', [check('geofence', 'fail', { evidence: 'location suspicious' })]);
    const a = assertCase(attack, r);
    expect(a.detected).toBe(true);
    expect(a.pass).toBe(false);
  });

  it('hard_fail_checks need hardFail: true on each named check, plus the exact verdict', () => {
    const hard = evalCase({
      id: 'EVAL-030',
      case_class: 'attack',
      scenario: 2,
      expected: { verdict: 'Rejected', catching_checks: ['photo_uniqueness'], hard_fail_checks: ['photo_uniqueness'] },
    });
    const soft = verifyResult('Rejected', [check('photo_uniqueness', 'fail')]);
    expect(assertCase(hard, soft).assertions.find((x) => x.name === 'hard_fail.photo_uniqueness')?.pass).toBe(false);
    const ok = verifyResult('Rejected', [check('photo_uniqueness', 'fail', { hardFail: true })]);
    expect(assertCase(hard, ok)).toMatchObject({ pass: true, detected: true });
    expect(assertCase(hard, verifyResult('Needs Review', [check('photo_uniqueness', 'fail', { hardFail: true })])).pass).toBe(false);
  });

  it('a check the result does not contain fails its assertion with a clear detail', () => {
    const legit = evalCase({ id: 'EVAL-010', expected: { verdict: 'Verified', check_status: { gps_accuracy: 'ok' } } });
    const a = assertCase(legit, verifyResult('Verified', [check('signature_valid', 'ok')]));
    expect(a.pass).toBe(false);
    expect(a.assertions[1]).toMatchObject({ name: 'check_status.gps_accuracy', pass: false, detail: expect.stringContaining('not in the result') });
    expect(a.detected).toBeUndefined();
  });

  it('a known limitation with every verdict acceptable passes whatever the verdict', () => {
    const kl = evalCase({ id: 'EVAL-029', case_class: 'known_limitation', scenario: 1, expected: { acceptable_verdicts: ['Verified', 'Needs Review', 'Rejected'] } });
    expect(assertCase(kl, verifyResult('Verified', [])).pass).toBe(true);
  });

  it('a case with no expectations fails with a "no expectations" assertion, never a silent pass', () => {
    const empty = evalCase({ id: 'EVAL-901', expected: {} });
    const a = assertCase(empty, verifyResult('Verified', [check('signature_valid', 'ok')]));
    expect(a.pass).toBe(false);
    expect(a.assertions).toEqual([{ name: 'no expectations', pass: false, detail: 'the case asserts nothing: no verdict, acceptable_verdicts, check_status, hard_fail_checks or evidence_substrings' }]);
  });
});
