import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { env } from '../config/env';
import type { Db, Tx } from '../db/client';
import { harvestEvents, media, type plots } from '../db/schema';
import type { PlotPolygon } from '../geo/types';
import { parseRegistrationChecks } from '../plots/registration';
import { appRemoteSensing } from '../remote-sensing';
import type { RemoteSensingProvider } from '../remote-sensing/types';
import type { CapturePayloadV1, VerifyContext } from '../verification/types';
import { getYieldReference } from '../yield/reference';
import { coffeeSeasonOf, seasonCherryKgBefore } from '../yield/season';
import type { BoundaryDevice } from './boundary';

// Builds the VerifyContext for a submission that passed the boundary (technical-plan §3.1 step 5).
// Reads only: it runs before the write transaction opens.

export type PlotRow = typeof plots.$inferSelect;

/**
 * Test-only (technical-plan §1, TSK-10.10): with `E2E=1` and `E2E_FIXTURE_DELAY_MS=<ms>`, every NDVI
 * call of `provider` answers that much later, so the e2e can watch the satellite groups tick after the
 * local ones (TC-045). Without `E2E=1` the variable is ignored and the provider is returned unchanged.
 */
export function withE2eDelay(provider: RemoteSensingProvider, vars: Record<string, string | undefined> = process.env): RemoteSensingProvider {
  if (vars.E2E !== '1') return provider;
  const ms = Number(vars.E2E_FIXTURE_DELAY_MS);
  if (!Number.isFinite(ms) || ms <= 0) return provider;
  const later = <T>(call: () => Promise<T>) => new Promise<void>((r) => setTimeout(r, ms)).then(call);
  return {
    name: provider.name,
    forestLoss: (plot, o) => provider.forestLoss(plot, o),
    ndviHistory: (plot, endMonth, o) => later(() => provider.ndviHistory(plot, endMonth, o)),
    ndviWindow: (plot, centreDate, days, o) => later(() => provider.ndviWindow(plot, centreDate, days, o)),
  };
}

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

/** The month the plot's registration read its NDVI history to (the cache bucket), if they are current. */
function historyEndMonth(plot: PlotRow): { historyEndMonth?: string } {
  const reg = plot.registrationStale === 0 ? parseRegistrationChecks(plot.registrationChecks) : null;
  return reg ? { historyEndMonth: reg.ndviHistory.endMonth } : {};
}

export async function buildContext(
  db: Db,
  {
    payload,
    device,
    plot,
    serverReceivedAt = new Date().toISOString(),
  }: {
    payload: CapturePayloadV1;
    device: BoundaryDevice;
    plot: PlotRow;
    /** The server's receipt time: it picks the coffee season (TP6). Defaults to now. */
    serverReceivedAt?: string;
  },
  deps: { remoteSensing?: RemoteSensingProvider } = {},
): Promise<VerifyContext> {
  const [seen, [prior], [previous], seasonKg, reference] = await Promise.all([
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
    seasonCherryKgBefore(db, plot.id, coffeeSeasonOf(serverReceivedAt)),
    getYieldReference(db, plot.crop),
  ]);

  return {
    device: { id: device.id, publicJwk: device.publicJwk, revokedAt: device.revokedAt, lastSeq: device.lastSeq, lastEventHash: device.lastEventHash },
    agentPriorAcceptedEvents: prior?.n ?? 0,
    previousEvent:
      previous && previous.lat !== null && previous.lng !== null && previous.capturedAt !== null
        ? { lat: previous.lat, lng: previous.lng, capturedAt: previous.capturedAt }
        : null,
    plot: { id: plot.id, crop: plot.crop, polygon: JSON.parse(plot.geojson) as PlotPolygon, areaHa: plot.areaHa, ...historyEndMonth(plot) },
    seenMediaHashes: seen,
    // TP6: this plot's accepted, non-Rejected kg in the receipt season, and the crop's reference row
    seasonCherryKgBefore: seasonKg,
    yieldReference: reference ? { maxKgHa: reference.maxKgHa, cherryToCleanRatio: reference.cherryToCleanRatio, source: reference.source } : null,
    // The provider REMOTE_SENSING_PROVIDER names, with 8 s timeouts and the per-plot cache (§7, TKT-07).
    remoteSensing: withE2eDelay(deps.remoteSensing ?? appRemoteSensing(db, env)),
  };
}
