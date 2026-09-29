import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { devices, farmers, harvestEvents, plots, user, verificationRuns } from '../db/schema';

// Org-scoped lookups (technical-plan §10, TC-019, EVAL-080). Every one takes `orgId` from the caller's
// session and filters by it in SQL together with the ID, so another organisation's ID returns
// `undefined` exactly like an unknown one; the Next side turns that into a 404 with `scopedById`.
// Later tickets add their lookups here or follow the same shape.

/** A plot of the org (plot → farmer → org). */
export async function plotInOrg(db: Db, orgId: string, plotId: string) {
  const [row] = await db
    .select({ plot: plots })
    .from(plots)
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(and(eq(plots.id, plotId), eq(farmers.orgId, orgId)))
    .limit(1);
  return row?.plot;
}

/** A device enrolled to one of the org's agents (device → agent user → org). */
export async function deviceInOrg(db: Db, orgId: string, deviceId: string) {
  const [row] = await db
    .select({ device: devices })
    .from(devices)
    .innerJoin(user, eq(user.id, devices.agentId))
    .where(and(eq(devices.id, deviceId), eq(user.orgId, orgId)))
    .limit(1);
  return row?.device;
}

/** A verification run of an accepted event on one of the org's plots (run → event → plot → farmer → org). */
export async function runInOrg(db: Db, orgId: string, runId: string) {
  const [row] = await db
    .select({ run: verificationRuns })
    .from(verificationRuns)
    .innerJoin(harvestEvents, eq(harvestEvents.id, verificationRuns.eventId))
    .innerJoin(plots, eq(plots.id, harvestEvents.plotId))
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(and(eq(verificationRuns.id, runId), eq(farmers.orgId, orgId)))
    .limit(1);
  return row?.run;
}

/** The batches held by a buyer org: TKT-14's query (latest custody transfer to that org). */
export { listBuyerBatches } from '../batches/buyer';
