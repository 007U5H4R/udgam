import type { PlotPolygon } from '../geo/types';
import type { FeedEntry, ProofFeedV1 } from '../ledger/proof';
import { districtOf, regionOf } from './district';

// The certificate's view model (technical-plan §8.4, TP16, TSK-16.1): every fact the public page shows —
// quantity, crop, plots and polygons, producer IDs, verdicts and evidence, the custody journey, the
// organic line — derived from the proof feed's payloads and nothing else. The visitor's browser hashes
// exactly these payloads, so nothing on the page is a server assertion. Pure and isomorphic: no
// database, no env, no clock; a reducer over the entries in seq order. Malformed payloads never throw
// (the verifier judges the feed, and the page says so); unknown kinds are counted and skipped.

export type EntryVerdict = 'Verified' | 'Needs Review' | 'Rejected';

export type CertPlot = {
  plotId: string;
  producerId: string;
  polygon: PlotPolygon;
  areaHa: number | null;
  /** The plot's latest forest-loss check, its evidence sentence verbatim (a "(demo data)" label included). */
  forestLoss: { pct: number | null; evidence: string } | null;
};

export type JourneyStep =
  | { kind: 'harvested'; from: string; to: string; farmCount: number }
  | { kind: 'checked'; pickings: number }
  | { kind: 'batched'; at: string; org: string }
  | { kind: 'transferred'; at: string; from: string; org: string };

export type OriginRow = { plotId: string; producerId: string; areaHa: number | null; kg: number; pickings: number };

export type CertEntry = {
  /** 1-based position in capture order. */
  n: number;
  eventId: string;
  plotId: string;
  producerId: string;
  capturedAt: string;
  kg: number;
  verdict: EntryVerdict;
  /** The deciding run's evidence sentences, in check order, verbatim. */
  evidence: string[];
  override?: { verdict: EntryVerdict; reason: string };
  /** Ledger seqs of this picking's records (harvest_event, runs, overrides), ascending. */
  seqs: number[];
};

export type OrganicLine = { issuer: string; validFrom: string; validTo: string; plotIds: string[]; allPlots: boolean };

export type CertificateView = {
  batchId: string;
  shortHash: string;
  /** Records in the feed (what the proof panel checks). */
  entryCount: number;
  headline: { quantityKg: number; crop: string; farmCount: number; district: string; region: string };
  /** First and last capture time of the member pickings. */
  harvestWindow: { from: string; to: string } | null;
  plots: CertPlot[];
  journey: JourneyStep[];
  origin: OriginRow[];
  entries: CertEntry[];
  organic: OrganicLine | null;
  /** Entries of kinds this page does not know (later milestones add kinds; format stays /1). */
  unknownKinds: number;
};

const KNOWN = new Set(['plot_registered', 'plot_edited', 'device_enrolled', 'device_revoked', 'harvest_event', 'verification_run', 'admin_override', 'attestation', 'batch_created', 'custody_transfer', 'quality_attestation', 'settlement']);
const VERDICTS: readonly string[] = ['Verified', 'Needs Review', 'Rejected'];
const CROPS: Record<string, string> = { arabica: 'Arabica', robusta: 'Robusta' };

type P = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const obj = (v: unknown): P | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as P) : undefined);
const verdictOf = (v: unknown): EntryVerdict | undefined => (typeof v === 'string' && VERDICTS.includes(v) ? (v as EntryVerdict) : undefined);

function isPolygon(v: unknown): v is PlotPolygon {
  const g = obj(v);
  return !!g && (g.type === 'Polygon' || g.type === 'MultiPolygon') && Array.isArray(g.coordinates);
}

export const cropLabel = (crop: string): string => CROPS[crop] ?? (crop ? crop[0]!.toUpperCase() + crop.slice(1) : '');

/** "0.0% of plot area lost …" → 0; null when the sentence has no leading percentage (e.g. unavailable). */
function leadingPct(evidence: string): number | null {
  const m = /^(\d+(?:\.\d+)?)%/.exec(evidence);
  return m ? Number(m[1]) : null;
}

type PlotAcc = { plotId: string; producerId?: string; polygon?: PlotPolygon; areaHa?: number };
type EventAcc = { eventId: string; plotId: string; capturedAt: string; kg: number; seqs: number[]; run?: { runNo: number; seq: number; payload: P }; override?: { seq: number; payload: P } };

/** Build the certificate's view model from a proof feed (verified or not: the page shows the verdict of the proof beside it). */
export function buildCertificateView(feed: ProofFeedV1): CertificateView {
  const entries = [...feed.entries].sort((a, b) => a.seq - b.seq);
  const plots = new Map<string, PlotAcc>();
  const events = new Map<string, EventAcc>();
  const runsByEvent = new Map<string, FeedEntry[]>();
  const overridesByEvent = new Map<string, FeedEntry[]>();
  const attestations: P[] = [];
  const custody: FeedEntry[] = [];
  let batch: FeedEntry | undefined;
  let unknownKinds = 0;

  for (const e of entries) {
    const p = e.payload;
    switch (e.kind) {
      case 'plot_registered':
      case 'plot_edited': {
        const plotId = str(p.plotId);
        if (!plotId) break;
        const acc = plots.get(plotId) ?? { plotId };
        // The latest payload wins, member by member (an edit that leaves a member out keeps the earlier one).
        acc.producerId = str(p.producerId) ?? acc.producerId;
        acc.polygon = isPolygon(p.polygon) ? p.polygon : acc.polygon;
        acc.areaHa = num(p.areaHa) ?? acc.areaHa;
        plots.set(plotId, acc);
        break;
      }
      case 'harvest_event': {
        const eventId = str(p.eventId);
        const capture = obj(p.capture);
        if (!eventId || p.boundaryStatus === 'rejected') break;
        events.set(eventId, {
          eventId,
          plotId: str(p.plotId) ?? str(capture?.plotId) ?? '',
          capturedAt: str(capture?.capturedAt) ?? '',
          kg: num(capture?.cherryKg) ?? 0,
          seqs: [e.seq],
        });
        break;
      }
      case 'verification_run': {
        const eventId = str(p.eventId);
        if (eventId) runsByEvent.set(eventId, [...(runsByEvent.get(eventId) ?? []), e]);
        break;
      }
      case 'admin_override': {
        const eventId = str(p.eventId);
        if (eventId) overridesByEvent.set(eventId, [...(overridesByEvent.get(eventId) ?? []), e]);
        break;
      }
      case 'attestation':
        attestations.push(p);
        break;
      case 'batch_created':
        if (!batch && p.batchId === feed.batchId) batch = e;
        break;
      case 'custody_transfer':
        if (p.batchId === feed.batchId) custody.push(e);
        break;
      default:
        if (!KNOWN.has(e.kind)) unknownKinds++;
    }
  }

  for (const [eventId, runs] of runsByEvent) {
    const ev = events.get(eventId);
    if (!ev) continue;
    for (const r of runs) {
      ev.seqs.push(r.seq);
      const runNo = num(r.payload.runNo) ?? 0;
      if (!ev.run || runNo > ev.run.runNo || (runNo === ev.run.runNo && r.seq > ev.run.seq)) ev.run = { runNo, seq: r.seq, payload: r.payload };
    }
  }
  for (const [eventId, overrides] of overridesByEvent) {
    const ev = events.get(eventId);
    if (!ev) continue;
    for (const o of overrides) {
      ev.seqs.push(o.seq);
      if (!ev.override || o.seq > ev.override.seq) ev.override = { seq: o.seq, payload: o.payload };
    }
  }

  // Members: the events batch_created lists (all harvested events in the feed if it lists none).
  const listed = Array.isArray(batch?.payload.events) ? (batch.payload.events as unknown[]).map((x) => str(obj(x)?.eventId)).filter((x): x is string => !!x) : [];
  const memberIds = listed.length > 0 ? listed : [...events.keys()];
  const members = [...new Set(memberIds)]
    .map((id) => events.get(id))
    .filter((x): x is EventAcc => !!x)
    .sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : a.capturedAt > b.capturedAt ? 1 : a.eventId < b.eventId ? -1 : 1));

  const producerOf = (plotId: string) => plots.get(plotId)?.producerId ?? '';

  const certEntries: CertEntry[] = members.map((m, i) => {
    const runVerdict = verdictOf(m.run?.payload.verdict);
    const ov = m.override ? { verdict: verdictOf(m.override.payload.newVerdict), reason: str(m.override.payload.reason) ?? '' } : undefined;
    const checks = Array.isArray(m.run?.payload.checks) ? (m.run.payload.checks as unknown[]) : [];
    const entry: CertEntry = {
      n: i + 1,
      eventId: m.eventId,
      plotId: m.plotId,
      producerId: producerOf(m.plotId),
      capturedAt: m.capturedAt,
      kg: m.kg,
      verdict: ov?.verdict ?? runVerdict ?? 'Needs Review',
      evidence: checks.map((c) => str(obj(c)?.evidence)).filter((x): x is string => !!x),
      seqs: [...m.seqs].sort((a, b) => a - b),
    };
    if (ov?.verdict) entry.override = { verdict: ov.verdict, reason: ov.reason };
    return entry;
  });

  // Plots of the member pickings, in order of first appearance in the ledger.
  const memberPlots = new Set(members.map((m) => m.plotId));
  const certPlots: CertPlot[] = [...plots.values()]
    .filter((p) => memberPlots.has(p.plotId) && p.polygon)
    .map((p) => {
      const latestRun = members
        .filter((m) => m.plotId === p.plotId && m.run)
        .map((m) => m.run!)
        .sort((a, b) => b.seq - a.seq)[0];
      const check = (Array.isArray(latestRun?.payload.checks) ? (latestRun.payload.checks as unknown[]) : []).map(obj).find((c) => c?.id === 'deforestation_overlap');
      const evidence = str(check?.evidence);
      return { plotId: p.plotId, producerId: p.producerId ?? '', polygon: p.polygon!, areaHa: p.areaHa ?? null, forestLoss: evidence ? { pct: leadingPct(evidence), evidence } : null };
    });

  const origin: OriginRow[] = certPlots.map((p) => {
    const mine = members.filter((m) => m.plotId === p.plotId);
    return { plotId: p.plotId, producerId: p.producerId, areaHa: p.areaHa, kg: mine.reduce((s, m) => s + m.kg, 0), pickings: mine.length };
  });

  const farmCount = new Set(certPlots.map((p) => p.producerId || p.plotId)).size;
  const district = districtOf(certPlots.map((p) => p.polygon));
  const times = members.map((m) => m.capturedAt).filter(Boolean).sort();
  const harvestWindow = times.length > 0 ? { from: times[0]!, to: times.at(-1)! } : null;

  const journey: JourneyStep[] = [];
  if (harvestWindow) journey.push({ kind: 'harvested', ...harvestWindow, farmCount });
  if (members.length > 0) journey.push({ kind: 'checked', pickings: members.filter((m) => m.run).length });
  if (batch) journey.push({ kind: 'batched', at: str(batch.payload.ts) ?? batch.ts, org: str(batch.payload.orgId) ?? '' });
  for (const c of custody) journey.push({ kind: 'transferred', at: str(c.payload.ts) ?? c.ts, from: str(c.payload.fromOrg) ?? '', org: str(c.payload.toOrg) ?? '' });

  // Organic: the latest organic attestation (in seq order), with every member plot any organic one covers.
  const organicAll = attestations.filter((a) => (a.type ?? 'organic') === 'organic' && str(a.issuer) && memberPlots.has(str(a.plotId) ?? ''));
  const latest = organicAll.at(-1);
  const covered = [...new Set(organicAll.map((a) => a.plotId as string))];
  const organic: OrganicLine | null = latest
    ? { issuer: latest.issuer as string, validFrom: str(latest.validFrom) ?? '', validTo: str(latest.validTo) ?? '', plotIds: covered, allPlots: certPlots.every((p) => covered.includes(p.plotId)) }
    : null;

  return {
    batchId: feed.batchId,
    shortHash: feed.shortHash,
    entryCount: feed.entries.length,
    headline: { quantityKg: members.reduce((s, m) => s + m.kg, 0), crop: cropLabel(str(batch?.payload.crop) ?? ''), farmCount, district, region: regionOf(district) },
    harvestWindow,
    plots: certPlots,
    journey,
    origin,
    entries: certEntries,
    organic,
    unknownKinds,
  };
}
