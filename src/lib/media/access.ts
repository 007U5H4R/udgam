import { and, eq } from 'drizzle-orm';
import type { SessionUser } from '../auth/session';
import type { Db } from '../db/client';
import { farmers, harvestEvents, media, plots } from '../db/schema';

// Who may see a picking's photos (TSK-10.13): an agent sees the photos of their own pickings; an FPO
// admin sees those of pickings on their organisation's plots; a buyer never (the certificate shows no
// photos, EV16). Anything else is indistinguishable from an unknown photo (CF-10: 404, not 403).

export type ReadableMedia = { id: string; path: string; sha256: string; mime: string; thumbPath: string | null };

/** The photo when this session may read it, else null. */
export async function canReadMedia(db: Db, session: SessionUser, mediaId: string): Promise<ReadableMedia | null> {
  if (session.role === 'buyer') return null;
  const [row] = await db
    .select({ id: media.id, path: media.path, sha256: media.sha256, mime: media.mime, thumbPath: media.thumbPath, agentId: harvestEvents.agentId, orgId: farmers.orgId })
    .from(media)
    .innerJoin(harvestEvents, eq(harvestEvents.id, media.eventId))
    .innerJoin(plots, eq(plots.id, harvestEvents.plotId))
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(and(eq(media.id, mediaId), eq(harvestEvents.boundaryStatus, 'accepted')))
    .limit(1);
  if (!row) return null;
  const allowed = session.role === 'agent' ? row.agentId === session.userId && row.orgId === session.orgId : row.orgId === session.orgId;
  return allowed ? { id: row.id, path: row.path, sha256: row.sha256, mime: row.mime, thumbPath: row.thumbPath } : null;
}
