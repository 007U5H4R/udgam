import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FeedEntry, ProofFeedV1 } from '../ledger/proof';
import { buildCertificateView } from './view-model';

// TSK-16.1 · TC-068 (unit half): the certificate's view model is one pure function of the proof feed
// (TP16). Every expected value below is a literal read off evals/fixtures/feeds/batch-3-events.json
// (made by __fixtures__/make-feed.ts through the real writers), never recomputed by the code under test.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FEED = JSON.parse(readFileSync(join(ROOT, 'evals/fixtures/feeds/batch-3-events.json'), 'utf8')) as ProofFeedV1;
const copy = (): ProofFeedV1 => structuredClone(FEED);

const DEMO = ' (demo data)';

describe('buildCertificateView (TSK-16.1)', () => {
  it('headline: quantity is the sum of the member pickings, crop from batch_created, farms and district from the plots', () => {
    const v = buildCertificateView(FEED);
    expect(v.batchId).toBe('B-CR3G933K');
    expect(v.shortHash).toBe('05d36abc389a');
    expect(v.entryCount).toBe(16);
    expect(v.headline).toEqual({ quantityKg: 124.5, crop: 'Arabica', farmCount: 3, district: 'Kodagu', region: 'Kodagu, Karnataka, India' });
    expect(v.harvestWindow).toEqual({ from: '2026-09-02T04:30:00.000Z', to: '2026-09-06T04:30:00.000Z' });
  });

  it('the quantity follows the harvest_event payloads, not the batch statement', () => {
    const f = copy();
    const h = f.entries.find((e) => e.kind === 'harvest_event')!;
    (h.payload.capture as { cherryKg: number }).cherryKg = 48; // was 38
    expect(buildCertificateView(f).headline.quantityKg).toBe(134.5);
  });

  it('plots come from the latest plot_registered / plot_edited payload of each plot', () => {
    const v = buildCertificateView(FEED);
    expect(v.plots.map((p) => [p.plotId, p.producerId])).toEqual([
      ['PL-QZE72CD2', 'PR-0PDMRFJ3'],
      ['PL-ZCPHYB19', 'PR-VVEWARBA'],
      ['PL-G7JGKSD0', 'PR-YQZGQHEX'],
    ]);
    expect(v.plots[0]!.areaHa).toBe(1.9999188690047616);
    expect(v.plots[0]!.polygon.type).toBe('Polygon');
    expect(v.plots[0]!.polygon.coordinates[0]![0]).toEqual([75.739986, 12.4213057]);

    // a later plot_edited replaces the polygon and area shown; members it leaves out are kept
    const f = copy();
    const moved = { type: 'Polygon', coordinates: [[[75.8, 12.5], [75.801, 12.5], [75.801, 12.501], [75.8, 12.5]]] };
    const last = f.entries.at(-1)!;
    f.entries.push({ ...last, seq: last.seq + 1, kind: 'plot_edited', payload: { plotId: 'PL-QZE72CD2', areaHa: 0.5, polygon: moved } });
    const edited = buildCertificateView(f).plots[0]!;
    expect(edited).toMatchObject({ plotId: 'PL-QZE72CD2', producerId: 'PR-0PDMRFJ3', areaHa: 0.5, polygon: moved });
  });

  it('each plot carries its latest forest-loss result verbatim, demo-data label included (EXE12, CF-11)', () => {
    const v = buildCertificateView(FEED);
    for (const p of v.plots) {
      expect(p.forestLoss).toEqual({ pct: 0, evidence: `0.0% of plot area lost since 2021 (hard fail at 10.0%)${DEMO}` });
    }
  });

  it('origin rows: kilograms and pickings per plot and producer', () => {
    expect(buildCertificateView(FEED).origin).toEqual([
      { plotId: 'PL-QZE72CD2', producerId: 'PR-0PDMRFJ3', areaHa: 1.9999188690047616, kg: 38, pickings: 1 },
      { plotId: 'PL-ZCPHYB19', producerId: 'PR-VVEWARBA', areaHa: 1.999911949698463, kg: 41.5, pickings: 1 },
      { plotId: 'PL-G7JGKSD0', producerId: 'PR-YQZGQHEX', areaHa: 1.9999050298803192, kg: 45, pickings: 1 },
    ]);
  });

  it('entries: in capture order, with kg, verdict of the last run and its evidence (demo data kept)', () => {
    const v = buildCertificateView(FEED);
    expect(v.entries.map((e) => [e.n, e.eventId, e.capturedAt, e.kg, e.verdict, e.producerId])).toEqual([
      [1, 'HE-ZHCT0K3KHGNV', '2026-09-02T04:30:00.000Z', 38, 'Verified', 'PR-0PDMRFJ3'],
      [2, 'HE-S1WRFD1JDDER', '2026-09-04T04:30:00.000Z', 41.5, 'Verified', 'PR-VVEWARBA'],
      [3, 'HE-MNF7W6ZYKA30', '2026-09-06T04:30:00.000Z', 45, 'Verified', 'PR-YQZGQHEX'],
    ]);
    const first = v.entries[0]!;
    expect(first.evidence).toHaveLength(12);
    expect(first.evidence[0]).toBe('Signed by enrolled phone DV-4CWDNJ0N');
    expect(first.evidence).toContain(`0.0% of plot area lost since 2021 (hard fail at 10.0%)${DEMO}`);
    expect(first.evidence).toContain(`Living canopy around the picking date: NDVI 0.71 (needs ≥ 0.45)${DEMO}`);
    expect(first.override).toBeUndefined();
    // the ledger records that belong to the picking: its harvest_event and its run
    expect(first.seqs).toEqual([8, 9]);
  });

  it("the verdict is the override's when one exists, else the last run's", () => {
    const f = copy();
    const [h] = f.entries.filter((e) => e.kind === 'harvest_event');
    const eventId = h!.payload.eventId as string;
    const run = f.entries.find((e) => e.kind === 'verification_run' && e.payload.eventId === eventId)!;
    run.payload.verdict = 'Needs Review';
    const last = f.entries.at(-1)!;
    const rerun: FeedEntry = { ...run, seq: last.seq + 1, payload: { ...run.payload, runNo: 2, verdict: 'Rejected' } };
    f.entries.push(rerun);
    expect(buildCertificateView(f).entries[0]).toMatchObject({ verdict: 'Rejected', seqs: [8, 9, last.seq + 1] });

    f.entries.push({ ...last, seq: last.seq + 2, kind: 'admin_override', payload: { v: 1, runId: 'VR-X', eventId, newVerdict: 'Verified', reason: 'Scale photo checked by the office', adminId: 'USR-X' } });
    expect(buildCertificateView(f).entries[0]).toMatchObject({
      verdict: 'Verified',
      override: { verdict: 'Verified', reason: 'Scale photo checked by the office' },
      seqs: [8, 9, last.seq + 1, last.seq + 2],
    });
  });

  it('journey: harvested, checked, batched by the FPO, handed to the buyer', () => {
    expect(buildCertificateView(FEED).journey).toEqual([
      { kind: 'harvested', from: '2026-09-02T04:30:00.000Z', to: '2026-09-06T04:30:00.000Z', farmCount: 3 },
      { kind: 'checked', pickings: 3 },
      { kind: 'batched', at: '2026-09-29T18:56:32.317Z', org: 'ORG-0H3TE0Z3' },
      { kind: 'transferred', at: '2026-09-29T18:56:32.325Z', from: 'ORG-0H3TE0Z3', org: 'ORG-1H3Q2PVQ' },
    ]);
  });

  it('the organic line appears only when an attestation payload exists', () => {
    expect(buildCertificateView(FEED).organic).toEqual({ issuer: 'INDOCERT', validFrom: '2026-01-01', validTo: '2027-12-31', plotIds: ['PL-QZE72CD2'], allPlots: false });
    const f = copy();
    f.entries = f.entries.filter((e) => e.kind !== 'attestation');
    expect(buildCertificateView(f).organic).toBeNull();
  });

  it('unknown kinds are ignored and counted, never thrown', () => {
    const f = copy();
    const last = f.entries.at(-1)!;
    f.entries.push({ ...last, seq: last.seq + 1, kind: 'kind_from_a_later_milestone', payload: { batchId: f.batchId } });
    const v = buildCertificateView(f);
    expect(v.unknownKinds).toBe(1);
    // M-002 (TKT-25): a batch's grade and settlement entries are known kinds; the page states neither (Design.md §28.4)
    const m2 = copy();
    m2.entries.push({ ...last, seq: last.seq + 1, kind: 'quality_attestation', payload: { batchId: m2.batchId } });
    m2.entries.push({ ...last, seq: last.seq + 2, kind: 'settlement', payload: { batchId: m2.batchId } });
    expect(buildCertificateView(m2).unknownKinds).toBe(0);
    expect(buildCertificateView(FEED).unknownKinds).toBe(0);
  });

  it('malformed payloads do not throw (the verifier, not the view, judges a feed)', () => {
    const f = copy();
    for (const e of f.entries) e.payload = {};
    expect(() => buildCertificateView(f)).not.toThrow();
  });

  it('is pure: the feed is not modified and repeated calls agree', () => {
    const f = copy();
    const a = buildCertificateView(f);
    expect(f).toEqual(FEED);
    expect(buildCertificateView(f)).toEqual(a);
  });

  it('imports nothing from lib/db, node: built-ins or env, at any depth of its module graph', () => {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s+'([^']+)'/g)) {
        const spec = m[1]!;
        expect(spec, file).not.toMatch(/^node:|\/db(\/|$)|config\/env|^next|^react/);
        if (!spec.startsWith('.')) continue;
        const base = resolve(dirname(file), spec);
        visit(existsSync(`${base}.ts`) ? `${base}.ts` : join(base, 'index.ts'));
      }
    };
    visit(join(ROOT, 'src/lib/certificate/view-model.ts'));
    expect(seen.size).toBeGreaterThan(1);
  });
});
