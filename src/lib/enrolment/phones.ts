import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { agentPlots, devices, farmers, harvestEvents, plots, user } from '../db/schema';

// The admin Phones view (TSK-05.7): the org's agents with their phones and live plot assignments, and
// the org's plots to assign. Every query filters by the admin's org (from the session, EVAL-080).

export type PhoneRow = { id: string; enrolledAt: string; revokedAt: string | null; lastCaptureAt: string | null };
export type PlotOption = { id: string; crop: string; areaHa: number; farmerName: string };
export type AgentRow = { id: string; name: string; email: string; devices: PhoneRow[]; plots: PlotOption[] };
export type PhonesView = { agents: AgentRow[]; plots: PlotOption[] };

export async function listPhones(db: Db, orgId: string): Promise<PhonesView> {
  const agents = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(and(eq(user.orgId, orgId), eq(user.role, 'agent')))
    .orderBy(asc(user.name), asc(user.id));

  const phoneRows = await db
    .select({
      id: devices.id,
      agentId: devices.agentId,
      enrolledAt: devices.enrolledAt,
      revokedAt: devices.revokedAt,
      lastCaptureAt: sql<string | null>`(SELECT MAX(${harvestEvents.serverReceivedAt}) FROM ${harvestEvents} WHERE ${harvestEvents.deviceId} = ${devices.id} AND ${harvestEvents.boundaryStatus} = 'accepted')`,
    })
    .from(devices)
    .innerJoin(user, eq(user.id, devices.agentId))
    .where(eq(user.orgId, orgId))
    .orderBy(asc(devices.enrolledAt), asc(devices.id));

  const orgPlots = await db
    .select({ id: plots.id, crop: plots.crop, areaHa: plots.areaHa, farmerName: farmers.name })
    .from(plots)
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(eq(farmers.orgId, orgId))
    .orderBy(asc(plots.id));

  const assigned = await db
    .select({ agentId: agentPlots.agentId, plotId: agentPlots.plotId })
    .from(agentPlots)
    .innerJoin(plots, eq(plots.id, agentPlots.plotId))
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(and(eq(farmers.orgId, orgId), isNull(agentPlots.revokedAt)))
    .orderBy(asc(agentPlots.plotId));

  const plotById = new Map(orgPlots.map((p) => [p.id, p]));
  return {
    agents: agents.map((a) => ({
      ...a,
      devices: phoneRows.filter((d) => d.agentId === a.id).map(({ id, enrolledAt, revokedAt, lastCaptureAt }) => ({ id, enrolledAt, revokedAt, lastCaptureAt })),
      plots: assigned.filter((x) => x.agentId === a.id).flatMap((x) => plotById.get(x.plotId) ?? []),
    })),
    plots: orgPlots,
  };
}

/** A user's display name (the signed-in admin on the rail), or null. */
export async function userName(db: Db, userId: string): Promise<string | null> {
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
  return row?.name ?? null;
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "15 Oct 2026, 01:45 IST": IST (UTC+05:30) by explicit offset arithmetic, never the host zone (§1). */
export function formatIst(iso: string): string {
  const d = new Date(Date.parse(iso) + IST_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} IST`;
}
