import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { writeTx, type Db, type Tx } from '../db/client';
import { agentPlots, farmers, plots, user } from '../db/schema';
import { NotFoundError } from './errors';

// Agent ↔ plot assignment (GAP-2, TP5, technical-plan §6.4). An agent's phone may capture only for a
// plot with a live assignment (`revoked_at IS NULL`); the capture boundary refuses anything else as
// `plot_not_assigned`. Admin writes are org-scoped: both the agent and the plot must belong to the
// admin's org, or NotFoundError (404, EVAL-080).

/** Does `agentId` hold a live assignment to `plotId`? (The capture boundary's rule.) */
export async function isPlotAssigned(db: Db | Tx, agentId: string, plotId: string): Promise<boolean> {
  const [row] = await db
    .select({ plotId: agentPlots.plotId })
    .from(agentPlots)
    .where(and(eq(agentPlots.agentId, agentId), eq(agentPlots.plotId, plotId), isNull(agentPlots.revokedAt)))
    .limit(1);
  return row !== undefined;
}

async function assertInOrg(tx: Tx, { agentId, plotId, orgId }: Scope): Promise<void> {
  const [agent] = await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, agentId), eq(user.orgId, orgId), eq(user.role, 'agent')))
    .limit(1);
  if (!agent) throw new NotFoundError('agent');
  const [plot] = await tx
    .select({ id: plots.id })
    .from(plots)
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(and(eq(plots.id, plotId), eq(farmers.orgId, orgId)))
    .limit(1);
  if (!plot) throw new NotFoundError('plot');
}

type Scope = { agentId: string; plotId: string; orgId: string };

/** Assign a plot to an agent (both of `orgId`). Re-assigning a removed assignment makes it live again. */
export async function assignPlot(db: Db, scope: Scope, now: Date = new Date()): Promise<void> {
  await writeTx(db, async (tx) => {
    await assertInOrg(tx, scope);
    const assignedAt = now.toISOString();
    await tx
      .insert(agentPlots)
      .values({ agentId: scope.agentId, plotId: scope.plotId, assignedAt })
      .onConflictDoUpdate({
        target: [agentPlots.agentId, agentPlots.plotId],
        set: { assignedAt, revokedAt: null },
        setWhere: isNotNull(agentPlots.revokedAt), // a live assignment keeps its date
      });
  });
}

/** Remove a live assignment (sets `revoked_at`). Removing one that is not live changes nothing. */
export async function unassignPlot(db: Db, scope: Scope, now: Date = new Date()): Promise<void> {
  await writeTx(db, async (tx) => {
    await assertInOrg(tx, scope);
    await tx
      .update(agentPlots)
      .set({ revokedAt: now.toISOString() })
      .where(and(eq(agentPlots.agentId, scope.agentId), eq(agentPlots.plotId, scope.plotId), isNull(agentPlots.revokedAt)));
  });
}
