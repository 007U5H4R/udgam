import { and, desc, eq } from 'drizzle-orm';
import { writeTx, type Db, type Tx } from '../db/client';
import { farmers, plots } from '../db/schema';
import { areaHa, geometryHash } from '../geo/area';
import type { PlotPolygon } from '../geo/types';
import { validatePolygon, type PlotGeomError } from '../geo/validate';
import { newId } from '../ids';
import { append } from '../ledger/hashchain';
import { log } from '../log';
import { createFarmer } from './farmers';
import { runRegistrationChecks } from './registration';

// Plot registration and edits (TSK-06.3, F1/F2, §8.1). Every save writes the plot row and its ledger
// entry in one write transaction: `plot_registered` on create, `plot_edited` on edit. An edit is a new
// anchored fact, never a mutation of the old entry, and marks the registration checks stale until they
// re-run for the new geometry right after the commit (TKT-07, EVAL-044). The area is always computed
// here from the geometry.
//
// Ledger payloads are public-safe (EV16): IDs, hashes, numbers, the polygon (the certificate and the
// EUDR export draw it from the feed, docs/proof-feed.md §9) and the producer ID, never the farmer's
// name or identifier.

export const CROPS = ['arabica', 'robusta'] as const;
export type Crop = (typeof CROPS)[number];

/** fresh: checks on record for this geometry · stale: geometry edited since · pending: never run. */
export type RegistrationStatus = 'fresh' | 'stale' | 'pending';

export type PlotsErrorCode = 'farmer_not_found' | 'plot_not_found' | 'invalid_geometry';

export class PlotsError extends Error {
  constructor(
    readonly code: PlotsErrorCode,
    readonly reason?: PlotGeomError,
  ) {
    super(reason ? `${code}: ${reason}` : code);
    this.name = 'PlotsError';
  }
}

type GeometryHook = (plotId: string, geometry: PlotPolygon, ctx: { db: Db; orgId: string }) => Promise<void>;

/**
 * The default hook (TKT-07, F2): run the registration checks — forest loss and the 12-month NDVI
 * history — for the saved geometry. They run after the commit and outside any write transaction, so
 * no provider call ever holds the SQLite write lock (TP12); their result and its anchor are written in
 * a transaction of their own (plots/registration.ts).
 */
const registrationChecksHook: GeometryHook = async (plotId, _geometry, { db, orgId }) => {
  await runRegistrationChecks(db, orgId, plotId);
};

let onGeometrySaved: GeometryHook = registrationChecksHook;

/** Replace the hook that runs after a plot's geometry is committed (register or edit); undefined restores the default. */
export function setOnPlotGeometrySaved(hook: GeometryHook | undefined): void {
  onGeometrySaved = hook ?? registrationChecksHook;
}

/** Run the geometry hook; the plot is already saved, so a failure is logged and the checks stay pending. */
export async function onPlotGeometrySaved(plotId: string, geometry: PlotPolygon, ctx: { db: Db; orgId: string }): Promise<void> {
  try {
    await onGeometrySaved(plotId, geometry, ctx);
  } catch (err) {
    log.warn({ plotId, errClass: err instanceof Error ? err.constructor.name : 'unknown' }, 'plots.geometry_hook_failed');
  }
}

function assertValid(geometry: PlotPolygon): void {
  const reason = validatePolygon(geometry);
  if (reason) throw new PlotsError('invalid_geometry', reason);
}

export type RegisterPlotInput = {
  crop: Crop;
  geometry: PlotPolygon;
} & ({ farmerId: string; newFarmer?: undefined } | { farmerId?: undefined; newFarmer: { name: string; identifier: string | null } });

async function farmerOfOrg(tx: Tx, orgId: string, farmerId: string) {
  const [row] = await tx
    .select({ id: farmers.id, producerId: farmers.producerId })
    .from(farmers)
    .where(and(eq(farmers.id, farmerId), eq(farmers.orgId, orgId)))
    .limit(1);
  return row;
}

/** Register a plot for one of the org's farmers (or a new farmer, in the same transaction). */
export async function registerPlot(
  db: Db,
  orgId: string,
  input: RegisterPlotInput,
  now: () => Date = () => new Date(),
): Promise<{ plotId: string; anchorSeq: number }> {
  assertValid(input.geometry);
  const geometry = input.geometry;
  const ha = areaHa(geometry);
  const hash = await geometryHash(geometry);
  const plotId = newId('PL-');
  const anchorSeq = await writeTx(db, async (tx) => {
    const farmer = input.newFarmer
      ? await createFarmer(tx, { orgId, name: input.newFarmer.name, identifier: input.newFarmer.identifier })
      : await farmerOfOrg(tx, orgId, input.farmerId);
    if (!farmer) throw new PlotsError('farmer_not_found');
    const anchor = await append(tx, 'plot_registered', {
      plotId,
      producerId: farmer.producerId,
      crop: input.crop,
      areaHa: ha,
      geometryHash: hash,
      polygon: geometry,
    });
    const ts = now().toISOString();
    await tx.insert(plots).values({
      id: plotId,
      farmerId: farmer.id,
      crop: input.crop,
      geojson: JSON.stringify(geometry),
      areaHa: ha,
      registrationChecks: null,
      registrationStale: 0,
      anchorSeq: anchor.seq,
      createdAt: ts,
      updatedAt: ts,
    });
    return anchor.seq;
  });
  await onPlotGeometrySaved(plotId, geometry, { db, orgId });
  return { plotId, anchorSeq };
}

/**
 * Replace a plot's polygon. Anchors `plot_edited` (with the previous and new geometry hashes) and sets
 * `registration_stale = 1` in the same transaction. An identical geometry anchors nothing.
 */
export async function editPlot(
  db: Db,
  orgId: string,
  plotId: string,
  geometry: PlotPolygon,
  now: () => Date = () => new Date(),
): Promise<{ anchorSeq: number; unchanged?: true }> {
  assertValid(geometry);
  const ha = areaHa(geometry);
  const hash = await geometryHash(geometry);
  const result = await writeTx(db, async (tx) => {
    const [row] = await tx
      .select({ plot: plots, producerId: farmers.producerId })
      .from(plots)
      .innerJoin(farmers, eq(farmers.id, plots.farmerId))
      .where(and(eq(plots.id, plotId), eq(farmers.orgId, orgId)))
      .limit(1);
    if (!row) throw new PlotsError('plot_not_found');
    const previousGeometryHash = await geometryHash(JSON.parse(row.plot.geojson) as PlotPolygon);
    if (previousGeometryHash === hash) return { anchorSeq: row.plot.anchorSeq, unchanged: true as const };
    const anchor = await append(tx, 'plot_edited', {
      plotId,
      producerId: row.producerId,
      crop: row.plot.crop,
      areaHa: ha,
      previousGeometryHash,
      geometryHash: hash,
      polygon: geometry,
    });
    await tx
      .update(plots)
      .set({ geojson: JSON.stringify(geometry), areaHa: ha, registrationStale: 1, anchorSeq: anchor.seq, updatedAt: now().toISOString() })
      .where(eq(plots.id, plotId));
    return { anchorSeq: anchor.seq };
  });
  if (!result.unchanged) await onPlotGeometrySaved(plotId, geometry, { db, orgId });
  return result;
}

export type PlotSummary = {
  id: string;
  farmerId: string;
  farmerName: string;
  producerId: string;
  crop: Crop;
  areaHa: number;
  status: RegistrationStatus;
  updatedAt: string;
};

export type PlotDetail = PlotSummary & {
  geometry: PlotPolygon;
  registrationChecks: unknown;
  registrationStale: boolean;
  anchorSeq: number;
  createdAt: string;
};

const statusOf = (p: { registrationStale: number; registrationChecks: string | null }): RegistrationStatus =>
  p.registrationStale === 1 ? 'stale' : p.registrationChecks === null ? 'pending' : 'fresh';

const summaryColumns = {
  plot: plots,
  farmerName: farmers.name,
  producerId: farmers.producerId,
};

function toSummary(r: { plot: typeof plots.$inferSelect; farmerName: string; producerId: string }): PlotSummary {
  return {
    id: r.plot.id,
    farmerId: r.plot.farmerId,
    farmerName: r.farmerName,
    producerId: r.producerId,
    crop: r.plot.crop,
    areaHa: r.plot.areaHa,
    status: statusOf(r.plot),
    updatedAt: r.plot.updatedAt,
  };
}

/** The org's plots, most recently changed first. */
export async function listPlots(db: Db, orgId: string): Promise<PlotSummary[]> {
  const rows = await db
    .select(summaryColumns)
    .from(plots)
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(eq(farmers.orgId, orgId))
    .orderBy(desc(plots.updatedAt), desc(plots.id));
  return rows.map(toSummary);
}

/** One of the org's plots, or null for an unknown ID or another org's (TC-019: indistinguishable). */
export async function getPlot(db: Db, orgId: string, plotId: string): Promise<PlotDetail | null> {
  const [r] = await db
    .select(summaryColumns)
    .from(plots)
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(and(eq(plots.id, plotId), eq(farmers.orgId, orgId)))
    .limit(1);
  if (!r) return null;
  return {
    ...toSummary(r),
    geometry: JSON.parse(r.plot.geojson) as PlotPolygon,
    registrationChecks: r.plot.registrationChecks === null ? null : (JSON.parse(r.plot.registrationChecks) as unknown),
    registrationStale: r.plot.registrationStale === 1,
    anchorSeq: r.plot.anchorSeq,
    createdAt: r.plot.createdAt,
  };
}
