import { and, eq } from 'drizzle-orm';
import { env } from '../config/env';
import { jcs, sha256Hex } from '../crypto';
import { writeTx, type Db } from '../db/client';
import { farmers, plots } from '../db/schema';
import type { PlotPolygon } from '../geo/types';
import { append } from '../ledger/hashchain';
import { appRemoteSensing, plotGeom } from '../remote-sensing';
import { ProviderError, type RemoteSensingProvider } from '../remote-sensing/types';
import { forestLossOutcome, gfwDown } from '../verification/checks/deforestation_overlap';
import { ndviHistoryDown, ndviHistoryOutcome } from '../verification/checks/ndvi_cultivation';
import { CONFIG } from '../verification/config';
import { evidence, istMonth, providerReason } from '../verification/evidence';
import type { CheckOutcome } from '../verification/registry';
import type { CheckStatus } from '../verification/types';

// Registration checks (technical-plan F2, TSK-07.6, TC-034, TC-028 cache half, EVAL-044). When a plot's
// geometry is saved (registered or edited), the forest-loss query and the 12-month NDVI history run for
// that geometry. The provider calls run outside any write transaction (TP12) through the cache, so the
// capture checks later read the same answers (same geometry hash). Only the result write and its anchor
// are transactional: `registration_checks` is stored, `registration_stale` cleared, and the results'
// hash anchored in the same transaction.
//
// The anchor is a `plot_edited` entry that carries the plot's CURRENT geometry fields (producerId, crop,
// areaHa, geometryHash, polygon — unchanged) plus `registrationChecksHash`. The certificate and the EUDR
// export read each plot's polygon from its latest plot_registered/plot_edited entry, so every such entry
// must carry the polygon (carry-forward from TKT-06); the proof closure already includes plot_edited.
// A provider failure never blocks the plot: the check is stored as unavailable and the admin can re-run.
// Any other error (e.g. a fixture provider with no profile for the plot and no fallback, EXE12) is
// stored as unavailable too ("Check could not run: <ErrorClass>"), naming the provider so a re-run is
// offered. A re-run ("Check again") whose results equal the stored ones apart from `ranAt` writes and
// anchors nothing: the stored text stays the one whose hash is anchored.

export class RegistrationError extends Error {
  constructor(readonly code: 'plot_not_found') {
    super(code);
    this.name = 'RegistrationError';
  }
}

export type RegistrationCheck = {
  id: 'deforestation_overlap' | 'ndvi_cultivation';
  status: CheckStatus;
  hardFail: boolean;
  evidence: string;
  /** Present when the provider failed (a re-run asks it again). */
  provider?: 'gfw' | 'sentinel-hub';
};

export type ForestLossSummary = RegistrationCheck & {
  id: 'deforestation_overlap';
  lossPct: number | null;
  lossHa: number | null;
  yearsFrom: number | null;
  dataYear: number | null;
  datasetVersion: string | null;
};

export type NdviHistorySummary = RegistrationCheck & {
  id: 'ndvi_cultivation';
  /** The month the history ends at: the capture checks ask for the same one (cache bucket). */
  endMonth: string;
  min: number | null;
  max: number | null;
  clearMonths: number | null;
};

export type RegistrationChecks = {
  v: 1;
  geometryHash: string;
  ranAt: string;
  source: RemoteSensingProvider['name'];
  forestLoss: ForestLossSummary;
  ndviHistory: NdviHistorySummary;
};

export type RegistrationDeps = { remoteSensing?: RemoteSensingProvider; now?: () => Date };

const pick = (o: CheckOutcome): RegistrationCheck => ({
  id: o.id as RegistrationCheck['id'],
  status: o.status,
  hardFail: o.hardFail,
  evidence: o.evidence,
  ...(o.provider ? { provider: o.provider } : {}),
});

async function forestLoss(rs: RemoteSensingProvider, geom: Awaited<ReturnType<typeof plotGeom>>): Promise<ForestLossSummary> {
  try {
    const r = await rs.forestLoss(geom);
    return {
      ...pick(forestLossOutcome(r, CONFIG)),
      id: 'deforestation_overlap',
      lossPct: r.lossPct,
      lossHa: r.lossHa,
      yearsFrom: r.yearsFrom,
      dataYear: r.dataYear,
      datasetVersion: r.datasetVersion ?? null,
    };
  } catch (err) {
    const down = err instanceof ProviderError ? gfwDown(providerReason(err)) : couldNotRun('deforestation_overlap', 'gfw', err);
    return { ...pick(down), id: 'deforestation_overlap', lossPct: null, lossHa: null, yearsFrom: null, dataYear: null, datasetVersion: null };
  }
}

/** A check that threw something other than a ProviderError: unavailable, as runCheck records it (§7 rule 4). */
function couldNotRun(id: RegistrationCheck['id'], provider: 'gfw' | 'sentinel-hub', err: unknown): CheckOutcome {
  return { id, status: 'unavailable', hardFail: false, evidence: evidence.threw(err instanceof Error ? err.constructor.name : 'unknown'), provider };
}

async function ndviHistory(rs: RemoteSensingProvider, geom: Awaited<ReturnType<typeof plotGeom>>, endMonth: string): Promise<NdviHistorySummary> {
  try {
    const h = await rs.ndviHistory(geom, endMonth);
    const clear = h.months.flatMap((m) => (m.mean === null ? [] : [m.mean]));
    return {
      ...pick(ndviHistoryOutcome(h, CONFIG)),
      id: 'ndvi_cultivation',
      endMonth,
      min: clear.length > 0 ? Math.min(...clear) : null,
      max: clear.length > 0 ? Math.max(...clear) : null,
      clearMonths: clear.length,
    };
  } catch (err) {
    const down = err instanceof ProviderError ? ndviHistoryDown(providerReason(err)) : couldNotRun('ndvi_cultivation', 'sentinel-hub', err);
    return { ...pick(down), id: 'ndvi_cultivation', endMonth, min: null, max: null, clearMonths: null };
  }
}

async function orgPlot(db: Db, orgId: string, plotId: string) {
  const [row] = await db
    .select({ plot: plots, producerId: farmers.producerId })
    .from(plots)
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(and(eq(plots.id, plotId), eq(farmers.orgId, orgId)))
    .limit(1);
  return row;
}

/** The checks without their run time: two runs with equal results compare equal. */
const results = (c: RegistrationChecks): string => jcs({ ...c, ranAt: '' });

/**
 * Run the registration checks for the plot's current geometry, store them and anchor their hash.
 * Returns null (and writes nothing) when the geometry changed while the providers answered: the
 * newer save runs its own checks. When the results equal the stored, fresh ones apart from `ranAt`,
 * nothing is written or anchored (`anchored: false`, `anchorSeq` the plot's current anchor).
 */
export async function runRegistrationChecks(
  db: Db,
  orgId: string,
  plotId: string,
  deps: RegistrationDeps = {},
): Promise<{ forestLoss: ForestLossSummary; ndviHistory: NdviHistorySummary; anchorSeq: number; anchored: boolean } | null> {
  const now = deps.now ?? (() => new Date());
  const row = await orgPlot(db, orgId, plotId);
  if (!row) throw new RegistrationError('plot_not_found');
  const polygon = JSON.parse(row.plot.geojson) as PlotPolygon;
  const geom = await plotGeom({ id: plotId, polygon, areaHa: row.plot.areaHa });
  const rs = deps.remoteSensing ?? appRemoteSensing(db, env, { now });
  const endMonth = istMonth(now().toISOString());

  // Outside any transaction: no provider call ever holds the SQLite write lock (TP12).
  const [loss, history] = await Promise.all([forestLoss(rs, geom), ndviHistory(rs, geom, endMonth)]);
  const checks: RegistrationChecks = { v: 1, geometryHash: geom.geometryHash, ranAt: now().toISOString(), source: rs.name, forestLoss: loss, ndviHistory: history };
  const text = jcs(checks);
  const registrationChecksHash = await sha256Hex(text);

  const written = await writeTx(db, async (tx) => {
    const [current] = await tx
      .select({ geojson: plots.geojson, areaHa: plots.areaHa, crop: plots.crop, registrationChecks: plots.registrationChecks, registrationStale: plots.registrationStale, anchorSeq: plots.anchorSeq })
      .from(plots)
      .where(eq(plots.id, plotId))
      .limit(1);
    if (!current || current.geojson !== row.plot.geojson) return null; // edited meanwhile
    const stored = current.registrationStale === 0 ? parseRegistrationChecks(current.registrationChecks) : null;
    if (stored !== null && results(stored) === results(checks)) return { anchorSeq: current.anchorSeq, anchored: false }; // nothing changed
    const anchor = await append(tx, 'plot_edited', {
      plotId,
      producerId: row.producerId,
      crop: current.crop,
      areaHa: current.areaHa,
      geometryHash: geom.geometryHash,
      polygon,
      registrationChecksHash,
    });
    await tx.update(plots).set({ registrationChecks: text, registrationStale: 0, anchorSeq: anchor.seq }).where(eq(plots.id, plotId));
    return { anchorSeq: anchor.seq, anchored: true };
  });
  if (written === null) return null;
  return { forestLoss: loss, ndviHistory: history, ...written };
}

/** Stored registration checks (already parsed JSON, e.g. PlotDetail.registrationChecks), or null. */
export function toRegistrationChecks(v: unknown): RegistrationChecks | null {
  return typeof v === 'object' && v !== null && (v as { v?: unknown }).v === 1 ? (v as RegistrationChecks) : null;
}

/** The stored registration checks of a plot row (`registration_checks` JSON text), or null. */
export function parseRegistrationChecks(text: string | null): RegistrationChecks | null {
  if (text === null) return null;
  try {
    return toRegistrationChecks(JSON.parse(text));
  } catch {
    return null;
  }
}

/** True when a registration check could not run (the plot page offers "Check again"). */
export const needsRerun = (c: RegistrationChecks | null): boolean =>
  c !== null && (c.forestLoss.status === 'unavailable' || c.ndviHistory.status === 'unavailable');
