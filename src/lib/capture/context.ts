import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { env } from '../config/env';
import type { Db } from '../db/client';
import { harvestEvents, media, type plots } from '../db/schema';
import type { PlotPolygon } from '../geo/types';
import { appRemoteSensing } from '../remote-sensing';
import type { RemoteSensingProvider } from '../remote-sensing/types';
import type { CapturePayloadV1, VerifyContext } from '../verification/types';
import type { BoundaryDevice } from './boundary';

// Builds the VerifyContext for a submission that passed the boundary (technical-plan §3.1 step 5).
// Reads only: it runs before the write transaction opens.

export type PlotRow = typeof plots.$inferSelect;


/**
 * Placeholder until TKT-09 seeds `crop_yield_reference` (technical-plan §6.6: Coffee Board of India
 * July 2024 district maxima; 6:1 cherry-to-clean, unverified). No yield check runs yet.
 */
const YIELD_PLACEHOLDER = {
  arabica: { maxKgHa: 783, cherryToCleanRatio: 1 / 6, source: 'placeholder until TKT-09' },
  robusta: { maxKgHa: 1494, cherryToCleanRatio: 1 / 6, source: 'placeholder until TKT-09' },
} as const;

export async function buildContext(
  db: Db,
  { payload, device, plot }: { payload: CapturePayloadV1; device: BoundaryDevice; plot: PlotRow },
  deps: { remoteSensing?: RemoteSensingProvider } = {},
): Promise<VerifyContext> {
  const hashes = [...new Set(payload.media.map((m) => m.sha256))];

  const [seenRows, [prior], [previous]] = await Promise.all([
    db
      .selectDistinct({ sha256: media.sha256 })
      .from(media)
      .innerJoin(harvestEvents, eq(harvestEvents.id, media.eventId))
      .where(and(inArray(media.sha256, hashes), eq(harvestEvents.boundaryStatus, 'accepted'))),
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
    seenMediaHashes: new Set(seenRows.map((r) => r.sha256)),
    seasonCherryKgBefore: 0, // TP6 season window arrives with TKT-09
    yieldReference: YIELD_PLACEHOLDER[plot.crop],
    // The provider REMOTE_SENSING_PROVIDER names, with 8 s timeouts and the per-plot cache (§7, TKT-07).
    remoteSensing: deps.remoteSensing ?? appRemoteSensing(db, env),
  };
}
