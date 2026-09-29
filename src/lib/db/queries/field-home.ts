import { and, asc, desc, eq, inArray, isNull, max } from 'drizzle-orm';
import type { PlotPolygon } from '../../geo/types';
import type { Verdict } from '../../verification/types';
import type { Db } from '../client';
import { agentPlots, farmers, harvestEvents, plots } from '../schema';

// Reads for the capture Home (TSK-10.5) and the weight hint (TSK-10.8). The organisation always comes
// from the session (technical-plan §10); an agent sees only plots assigned to them and not revoked.

export type HomePlot = {
  id: string;
  /** The plot's place among its farmer's plots, oldest first: "Plot 2" (the schema holds no plot names). */
  ordinal: number;
  farmerName: string;
  areaHa: number;
  crop: 'arabica' | 'robusta';
  geojson: PlotPolygon;
  /** The latest accepted picking on the plot (client capture time), or null. */
  lastPickedAt: string | null;
};

export type HomePicking = { eventId: string; receivedAt: string; cherryKg: number; verdict: Verdict | null };

export type FieldHome = { plots: HomePlot[]; recent: HomePicking[] };

export async function getFieldHome(db: Db, agentId: string, orgId: string): Promise<FieldHome> {
  const assigned = await db
    .select({ plot: plots, farmerName: farmers.name })
    .from(agentPlots)
    .innerJoin(plots, eq(plots.id, agentPlots.plotId))
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(and(eq(agentPlots.agentId, agentId), isNull(agentPlots.revokedAt), eq(farmers.orgId, orgId)));

  const plotIds = assigned.map((a) => a.plot.id);
  const farmerIds = [...new Set(assigned.map((a) => a.plot.farmerId))];
  const [siblings, picked, recent] = await Promise.all([
    farmerIds.length === 0
      ? []
      : db
          .select({ id: plots.id, farmerId: plots.farmerId })
          .from(plots)
          .where(inArray(plots.farmerId, farmerIds))
          .orderBy(asc(plots.createdAt), asc(plots.id)),
    plotIds.length === 0
      ? []
      : db
          .select({ plotId: harvestEvents.plotId, lastAt: max(harvestEvents.clientCapturedAt), lastSeq: max(harvestEvents.anchorSeq) })
          .from(harvestEvents)
          .where(and(inArray(harvestEvents.plotId, plotIds), eq(harvestEvents.boundaryStatus, 'accepted')))
          .groupBy(harvestEvents.plotId),
    db
      .select({ eventId: harvestEvents.id, receivedAt: harvestEvents.serverReceivedAt, cherryKg: harvestEvents.cherryKg, verdict: harvestEvents.finalVerdict })
      .from(harvestEvents)
      .innerJoin(plots, eq(plots.id, harvestEvents.plotId))
      .innerJoin(farmers, eq(farmers.id, plots.farmerId))
      .where(and(eq(harvestEvents.agentId, agentId), eq(harvestEvents.boundaryStatus, 'accepted'), eq(farmers.orgId, orgId)))
      .orderBy(desc(harvestEvents.serverReceivedAt), desc(harvestEvents.anchorSeq))
      .limit(3),
  ]);

  const ordinal = new Map<string, number>();
  const count = new Map<string, number>();
  for (const s of siblings) {
    const n = (count.get(s.farmerId) ?? 0) + 1;
    count.set(s.farmerId, n);
    ordinal.set(s.id, n);
  }
  const last = new Map(picked.map((p) => [p.plotId, p]));
  const homePlots = assigned
    .map(({ plot, farmerName }) => ({
      id: plot.id,
      ordinal: ordinal.get(plot.id) ?? 1,
      farmerName,
      areaHa: plot.areaHa,
      crop: plot.crop,
      geojson: JSON.parse(plot.geojson) as PlotPolygon,
      lastPickedAt: last.get(plot.id)?.lastAt ?? null,
      seq: last.get(plot.id)?.lastSeq ?? -1,
      createdAt: plot.createdAt,
    }))
    // Most recently picked first (by ledger order, which never ties); never-picked plots by registration.
    .sort((a, b) => b.seq - a.seq || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((p) => ({ id: p.id, ordinal: p.ordinal, farmerName: p.farmerName, areaHa: p.areaHa, crop: p.crop, geojson: p.geojson, lastPickedAt: p.lastPickedAt }));

  return {
    plots: homePlots,
    recent: recent.map((r) => ({ eventId: r.eventId, receivedAt: r.receivedAt, cherryKg: r.cherryKg ?? 0, verdict: r.verdict })),
  };
}

/** The min and max kg of this agent's last 10 accepted pickings on the plot, or null when there are none (D6: the farmer's own range). */
export async function recentKgRange(db: Db, agentId: string, plotId: string): Promise<{ min: number; max: number } | null> {
  const rows = await db
    .select({ kg: harvestEvents.cherryKg })
    .from(harvestEvents)
    .where(and(eq(harvestEvents.agentId, agentId), eq(harvestEvents.plotId, plotId), eq(harvestEvents.boundaryStatus, 'accepted')))
    .orderBy(desc(harvestEvents.anchorSeq))
    .limit(10);
  const kgs = rows.map((r) => r.kg).filter((k): k is number => typeof k === 'number');
  if (kgs.length === 0) return null;
  return { min: Math.min(...kgs), max: Math.max(...kgs) };
}
