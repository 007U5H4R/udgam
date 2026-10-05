import { area } from '@turf/turf';
import { describe, expect, it } from 'vitest';
import { locate } from '../../src/lib/geo/geofence';
import { SEED, type SeedPlot } from './data';

// technical-plan TSK-20.1 (TC-077's data): the Hosahalli FPO demo data set. Expected values are literals
// from the plan and from the TP6 yield reference (Arabica 783 kg/ha clean, cherry-to-clean 1/6).

const KODAGU = { lat: [11.9, 12.8], lng: [75.4, 76.2] } as const;
const CHIKKAMAGALURU = { lat: [12.9, 13.6], lng: [75.3, 76.1] } as const;
const inBox = ([lng, lat]: readonly [number, number], box: typeof KODAGU | typeof CHIKKAMAGALURU) =>
  lat >= box.lat[0] && lat <= box.lat[1] && lng >= box.lng[0] && lng <= box.lng[1];

const byId = (id: string): SeedPlot => {
  const p = SEED.plots.find((x) => x.id === id);
  if (!p) throw new Error(`no plot ${id}`);
  return p;
};

describe('the Hosahalli FPO demo data set (TSK-20.1)', () => {
  it('names one FPO, one buyer, one admin, two agents and one buyer account with opaque fixed IDs (EXE13)', () => {
    expect(SEED.fpo.name).toBe('Hosahalli Coffee Growers FPO');
    expect(SEED.buyer.name).toBe('Western Ghats Green Coffee (demo buyer)');
    const roles = SEED.users.map((u) => u.role).sort();
    expect(roles).toEqual(['admin', 'agent', 'agent', 'buyer']);
    for (const u of SEED.users) {
      expect(u.id).toMatch(/^USR-[0-9A-HJKMNP-TV-Z]{8}$/);
      expect(u.email).toMatch(/@[a-z0-9.-]+\.udgam\.test$/);
    }
    expect(new Set(SEED.users.map((u) => u.id)).size).toBe(4);
  });

  it('has at least 10 plots, every centre inside the Kodagu or Chikkamagaluru box, both districts present', () => {
    expect(SEED.plots.length).toBeGreaterThanOrEqual(10);
    expect(SEED.plots).toHaveLength(12);
    for (const p of SEED.plots) {
      const box = p.district === 'Kodagu' ? KODAGU : CHIKKAMAGALURU;
      expect(inBox(p.centre, box), `${p.id} centre ${p.centre.join(',')} in ${p.district}`).toBe(true);
      expect(locate({ lng: p.centre[0], lat: p.centre[1] }, p.geometry).inside, `${p.id} centre inside its polygon`).toBe(true);
    }
    expect(new Set(SEED.plots.map((p) => p.district))).toEqual(new Set(['Kodagu', 'Chikkamagaluru']));
    expect(new Set(SEED.plots.map((p) => p.id)).size).toBe(12);
  });

  it('areas span 0.4–5.5 ha and match the polygons, with one concave plot and one of at least 4 ha', () => {
    for (const p of SEED.plots) {
      expect(p.areaHa).toBeGreaterThanOrEqual(0.4);
      expect(p.areaHa).toBeLessThanOrEqual(5.5);
      expect(area(p.geometry) / 10_000).toBeCloseTo(p.areaHa, 2);
    }
    expect(Math.min(...SEED.plots.map((p) => p.areaHa))).toBe(0.4);
    expect(Math.max(...SEED.plots.map((p) => p.areaHa))).toBe(5.5);
    expect(SEED.plots.some((p) => p.shape === 'concave_L')).toBe(true);
    expect(SEED.plots.some((p) => p.areaHa >= 4)).toBe(true);
  });

  it('grows both Arabica and Robusta', () => {
    expect(new Set(SEED.plots.map((p) => p.crop))).toEqual(new Set(['arabica', 'robusta']));
  });

  it('one plot uses the adversarial X01 profile (25 % loss), and the laundering attack targets it', () => {
    const x = SEED.plots.filter((p) => p.profile === 'X01');
    expect(x).toHaveLength(1);
    expect(x[0]!.lossPct).toBe(25);
    expect(SEED.attacks.find((a) => a.id === 'plot-laundering')!.plot).toBe(x[0]!.id);
    // the cloud-blocked plot is the one whose history waits for the office
    expect(SEED.plots.filter((p) => p.profile === 'P09').map((p) => p.id)).toEqual(['P09']);
  });

  it('stages four attacks, one per scenario, each with the verdict and the evidence that catches it', () => {
    expect(SEED.attacks.map((a) => [a.id, a.expected.verdict, a.expected.check, a.expected.evidence])).toEqual([
      ['gps-spoof', 'Needs Review', 'geofence', 'm outside the plot edge'],
      ['replay', 'Rejected', 'photo_uniqueness', 'photos seen before'],
      ['yield-inflation', 'Rejected', 'yield_plausibility', 'x the reference upper bound'],
      ['plot-laundering', 'Rejected', 'deforestation_overlap', '% of plot area lost since 2021'],
    ]);
    const attackAgent = SEED.users.find((u) => u.key === SEED.attackAgent)!;
    expect(attackAgent.role).toBe('agent');
    for (const a of SEED.attacks) expect(byId(a.plot).agents).toContain(SEED.attackAgent);
    expect(SEED.attacks.find((a) => a.id === 'gps-spoof')!.outsideM).toBe(320);
  });

  it('has about 30 legitimate pickings, each on a plot its agent is assigned to, kg in 0.5 steps up to 500', () => {
    expect(SEED.history.length).toBe(30);
    for (const h of SEED.history) {
      expect(byId(h.plot).agents).toContain(h.agent);
      expect(Number.isInteger(h.kg * 2)).toBe(true);
      expect(h.kg).toBeGreaterThanOrEqual(0.5);
      expect(h.kg).toBeLessThanOrEqual(500);
      expect([1, 2, 3]).toContain(h.photos);
    }
    expect(SEED.history.some((h) => h.plot === 'X01')).toBe(false); // the laundering plot has no honest history
    expect(SEED.history.filter((h) => h.plot === 'P09').every((h) => h.expect === 'Needs Review')).toBe(true);
  });

  it('the small plot Y01 runs the season close to the bound, so the staged 500 kg picking crosses 2.00x (TP6)', () => {
    const y = byId('Y01');
    expect(y.crop).toBe('arabica');
    expect(y.areaHa).toBe(0.4);
    const picks = SEED.history.filter((h) => h.plot === 'Y01');
    const ok = picks.filter((h) => h.expect === 'Verified' && !h.override).reduce((s, h) => s + h.kg, 0);
    const flagged = picks.filter((h) => h.override);
    expect(ok).toBe(2800);
    expect(flagged.map((h) => [h.kg, h.expect, h.override!.verdict])).toEqual([[500, 'Needs Review', 'Verified']]);
    expect(SEED.attacks.find((a) => a.id === 'yield-inflation')!.kg).toBe(500);
    // U for 0.4 ha of Arabica in cherry kg: 783 × 0.4 × 6 = 1879.2
    const u = 783 * 0.4 * 6;
    expect(ok / u).toBeLessThanOrEqual(1.5);
    expect((ok + 500) / u).toBeGreaterThan(1.5);
    expect((ok + 500 + 500) / u).toBeGreaterThan(2.0);
  });

  it('keeps farmer names out of everything that feeds a ledger payload (EV16: producerId only)', () => {
    const names = SEED.plots.map((p) => p.farmer.name);
    expect(new Set(names).size).toBe(names.length);
    const ledgerFacing = JSON.stringify({
      plots: SEED.plots.map((p) => ({ ...p, farmer: null })),
      history: SEED.history,
      attacks: SEED.attacks,
      users: SEED.users.map((u) => u.id),
    });
    for (const n of names) expect(ledgerFacing).not.toContain(n);
    for (const p of SEED.plots) if (p.farmer.identifier) expect(ledgerFacing).not.toContain(p.farmer.identifier);
  });
});
