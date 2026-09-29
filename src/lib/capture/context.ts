import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';
import { harvestEvents, media, type plots } from '../db/schema';
import type { PlotPolygon } from '../geo/types';
import type { RemoteSensingProvider } from '../remote-sensing/types';
import type { CapturePayloadV1, VerifyContext } from '../verification/types';
import type { BoundaryDevice } from './boundary';

// Builds the VerifyContext for a submission that passed the boundary (technical-plan §3.1 step 5).
// Reads only: it runs before the write transaction opens.

export type PlotRow = typeof plots.$inferSelect;

/** Until TKT-07 wires the cache-wrapped fixture/live providers, no remote check exists to call this. */
export const REMOTE_SENSING_STUB: RemoteSensingProvider = {
  name: 'fixture',
  forestLoss: () => Promise.reject(new Error('remote sensing arrives with TKT-07')),
  ndviHistory: () => Promise.reject(new Error('remote sensing arrives with TKT-07')),
  ndviWindow: () => Promise.reject(new Error('remote sensing arrives with TKT-07')),
};

/**
 * Placeholder until TKT-09 seeds `crop_yield_reference` (technical-plan §6.6: Coffee Board of India
 * July 2024 district maxima; 6:1 cherry-to-clean, unverified). No yield check runs yet.
 */
const YIELD_PLACEHOLDER = {
  arabica: { maxKgHa: 783, cherryToCleanRatio: 1 / 6, source: 'placeholder until TKT-09' },
  robusta: { maxKgHa: 1494, cherryToCleanRatio: 1 / 6, source: 'placeholder until TKT-09' },
} as const;

/**
 * Which of `hashes` a committed, accepted event already carries (photo_uniqueness). Pass the write
 * transaction to re-read it under the write lock (the capture's step 7, TKT-19).
 */
export async function seenMediaHashes(handle: Db | Tx, hashes: readonly string[]): Promise<Set<string>> {
  const unique = [...new Set(hashes)];
  if (unique.length === 0) return new Set();
  const rows = await handle
    .selectDistinct({ sha256: media.sha256 })
    .from(media)
    .innerJoin(harvestEvents, eq(harvestEvents.id, media.eventId))
    .where(and(inArray(media.sha256, unique), eq(harvestEvents.boundaryStatus, 'accepted')));
  return new Set(rows.map((r) => r.sha256));
}

export async function buildContext(
  db: Db,
  { payload, device, plot }: { payload: CapturePayloadV1; device: BoundaryDevice; plot: PlotRow },
): Promise<VerifyContext> {
  const [seen, [prior], [previous]] = await Promise.all([
    seenMediaHashes(
      db,
      payload.media.map((m) => m.sha256),
    ),
    db
      .select({ n: count() })
      .from(harvestEvents)
      .where(and(eq(harvestEvents.agentId, device.agentId), eq(harvestEvents.boundaryStatus, 'accepted'))),
    db
      .select({ lat: harvestEvents.lat, lng: harvestEvents.lng, capturedAt: harvestEvents.clientCapturedAt })
      .from(harvestEvents)
      .where(and(eq(harvestEvents.deviceId, device.id), eq(harvestEvents.boundaryStatus, 'accepted')))
      .orderBy(desc(harvestEvents.seq))
      .limit(1),
  ]);

  return {
    device: { id: device.id, publicJwk: device.publicJwk, revokedAt: device.revokedAt, lastSeq: device.lastSeq, lastEventHash: device.lastEventHash },
    agentPriorAcceptedEvents: prior?.n ?? 0,
    previousEvent:
      previous && previous.lat !== null && previous.lng !== null && previous.capturedAt !== null
        ? { lat: previous.lat, lng: previous.lng, capturedAt: previous.capturedAt }
        : null,
    plot: { id: plot.id, crop: plot.crop, polygon: JSON.parse(plot.geojson) as PlotPolygon, areaHa: plot.areaHa },
    seenMediaHashes: seen,
    seasonCherryKgBefore: 0, // TP6 season window arrives with TKT-09
    yieldReference: YIELD_PLACEHOLDER[plot.crop],
    remoteSensing: REMOTE_SENSING_STUB,
  };
}
