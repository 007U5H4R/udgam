import { describe, expect, it } from 'vitest';
import type { VerdictView } from '../../client/capture-client';
import { farmerLines } from '../../lib/i18n/farmer-evidence';
import { evidence } from '../../lib/verification/evidence';
import type { CheckId, CheckStatus } from '../../lib/verification/types';
import { streamedResult } from './verdict-result';

// Spec MAJOR 2 (TASK-11 fix round 1): "Not accepted" names the hard fail that decided it. The verdict
// line streams `hardFail` per check and `capReasons`; the screen ranks the hard fail first, whatever
// the registry order of the other fails.

const line = (id: CheckId, status: CheckStatus, ev: string, hardFail = false) => ({ id, status, evidence: ev, hardFail });
const ok = [
  line('signature_valid', 'ok', evidence.signature_valid.ok({ deviceId: 'DV-ABCDEFGH' })),
  line('photo_uniqueness', 'ok', evidence.photo_uniqueness.ok({ n: 1 })),
];
const view = (verdict: VerdictView['verdict'], checks: VerdictView['checks'], capReasons: string[] = ['anyFail']): VerdictView => ({
  eventId: 'HE-1',
  verdict,
  score: 40,
  checks,
  capReasons,
});

describe('streamedResult + farmerLines: which reason Not accepted names', () => {
  it("the reviewer's probe: a 30 m geofence fail plus an 18 % forest-loss hard fail → the forest line and \"talk to the office\"", () => {
    const v = view('Rejected', [
      ...ok,
      line('geofence', 'fail', evidence.geofence.fail({ distanceM: 30, bufferM: 8 })),
      line('deforestation_overlap', 'fail', evidence.deforestation_overlap.fail({ lossPct: 18 }), true),
    ]);
    expect(farmerLines(streamedResult(v), 'en', { plot: 'Plot 1' })).toEqual([
      { icon: 'tree', text: 'Forest map: 18.0% of the plot cleared since 2021.' },
      { icon: 'check', text: 'Talk to the office. They can look at it again.', next: true },
    ]);
  });

  it('a yield hard fail plus a GPS accuracy fail → the yield line and "talk to the office"', () => {
    const v = view('Rejected', [
      ...ok,
      line('gps_accuracy', 'fail', evidence.gps_accuracy.fail({ accuracyM: 150 })),
      line('yield_plausibility', 'fail', evidence.yield_plausibility.fail({ ratio: 2.5 }), true),
    ]);
    expect(farmerLines(streamedResult(v), 'en', { plot: 'Plot 1' })).toEqual([
      { icon: 'trend', text: "This season's total is 2.50x the usual harvest for this plot." },
      { icon: 'check', text: 'Talk to the office. They can look at it again.', next: true },
    ]);
  });

  it('two ordinary fails and no hard fail → the first by rank (stream order), with its own to-do', () => {
    const v = view('Rejected', [
      ...ok,
      line('geofence', 'fail', evidence.geofence.fail({ distanceM: 30, bufferM: 8 })),
      line('gps_accuracy', 'fail', evidence.gps_accuracy.fail({ accuracyM: 150 })),
    ]);
    expect(farmerLines(streamedResult(v), 'en', { plot: 'Plot 1' })).toEqual([
      { icon: 'location', text: 'Your phone was 30 m outside Plot 1.' },
      { icon: 'check', text: 'Stand inside Plot 1 and record the picking again. If you were inside, tell the office.', next: true },
    ]);
  });

  it('carries hardFail and capReasons through; a line from an older server (no fields) reads as false / none', () => {
    const r = streamedResult(view('Needs Review', [line('geofence', 'flag', 'x'), { id: 'gps_accuracy', status: 'ok', evidence: 'y' }], ['flag:geofence']));
    expect(r.checks.map((c) => [c.id, c.hardFail])).toEqual([
      ['geofence', false],
      ['gps_accuracy', false],
    ]);
    expect(r.capReasons).toEqual(['flag:geofence']);
    const old = streamedResult({ eventId: 'HE-2', verdict: 'Verified', score: 100, checks: [{ id: 'geofence', status: 'ok', evidence: 'z' }] });
    expect(old.capReasons).toEqual([]);
    expect(old.checks[0]!.hardFail).toBe(false);
  });
});
