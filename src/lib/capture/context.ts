import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { env } from '../config/env';
import type { Db, Tx } from '../db/client';
import { devices, harvestEvents, media, type plots } from '../db/schema';
import type { PlotPolygon } from '../geo/types';
import { parseRegistrationChecks } from '../plots/registration';
import { appRemoteSensing } from '../remote-sensing';
import type { RemoteSensingProvider } from '../remote-sensing/types';
import type { CapturePayloadV1, VerifyContext } from '../verification/types';
import { getYieldReference } from '../yield/reference';
import { coffeeSeasonOf, seasonCherryKgBefore } from '../yield/season';
import type { BoundaryDevice } from './boundary';

// Builds the VerifyContext for a submission that passed the boundary (technical-plan §3.1 step 5).
// Reads only: it runs before the write transaction opens; refreshUnderLock re-reads what a concurrent
// commit can change, inside it.

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

/** How many accepted events this agent has, on any phone (chain_continuity's re-enrolment rule). */
async function agentAcceptedEvents(handle: Db | Tx, agentId: string): Promise<number> {
  const [row] = await handle
    .select({ n: count() })
    .from(harvestEvents)
    .where(and(eq(harvestEvents.agentId, agentId), eq(harvestEvents.boundaryStatus, 'accepted')));
  return row?.n ?? 0;
}

/** The phone's latest accepted capture, where and when (movement_plausibility), or null. */
async function previousEventOf(handle: Db | Tx, deviceId: string): Promise<VerifyContext['previousEvent']> {
  const [previous] = await handle
    .select({ lat: harvestEvents.lat, lng: harvestEvents.lng, capturedAt: harvestEvents.clientCapturedAt })
    .from(harvestEvents)
    .where(and(eq(harvestEvents.deviceId, deviceId), eq(harvestEvents.boundaryStatus, 'accepted')))
    .orderBy(desc(harvestEvents.seq))
    .limit(1);
  return previous && previous.lat !== null && previous.lng !== null && previous.capturedAt !== null
    ? { lat: previous.lat, lng: previous.lng, capturedAt: previous.capturedAt }
    : null;
}

/**
 * The context fields a concurrent commit can change, re-read inside the write transaction (step 7, under
 * the lock): the seen photos (photo_uniqueness), the phone's chain head and the agent's accepted count
 * (chain_continuity), the phone's previous accepted capture (movement_plausibility) and the plot's
 * season kg (yield_plausibility). buildContext read them before media storage and verification, so
 * captures in flight at once all saw the same stale values.
 */
export async function refreshUnderLock(
  tx: Tx,
  ctx: VerifyContext,
  { payload, agentId, serverReceivedAt }: { payload: CapturePayloadV1; agentId: string; serverReceivedAt: string },
): Promise<VerifyContext> {
  const seen = await seenMediaHashes(
    tx,
    payload.media.map((m) => m.sha256),
  );
  const [head] = await tx.select({ lastSeq: devices.lastSeq, lastEventHash: devices.lastEventHash }).from(devices).where(eq(devices.id, ctx.device.id));
  const prior = await agentAcceptedEvents(tx, agentId);
  const previousEvent = await previousEventOf(tx, ctx.device.id);
  const seasonKg = await seasonCherryKgBefore(tx, ctx.plot.id, coffeeSeasonOf(serverReceivedAt));
  return {
    ...ctx,
    seenMediaHashes: seen,
    device: head ? { ...ctx.device, lastSeq: head.lastSeq, lastEventHash: head.lastEventHash } : ctx.device,
    agentPriorAcceptedEvents: prior,
    previousEvent,
    seasonCherryKgBefore: seasonKg,
  };
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
  const [seen, prior, previousEvent, seasonKg, reference] = await Promise.all([
    seenMediaHashes(
      db,
      payload.media.map((m) => m.sha256),
    ),
    agentAcceptedEvents(db, device.agentId),
    previousEventOf(db, device.id),
    seasonCherryKgBefore(db, plot.id, coffeeSeasonOf(serverReceivedAt)),
    getYieldReference(db, plot.crop),
  ]);

  return {
    device: { id: device.id, publicJwk: device.publicJwk, revokedAt: device.revokedAt, lastSeq: device.lastSeq, lastEventHash: device.lastEventHash },
    agentPriorAcceptedEvents: prior,
    previousEvent,
    plot: { id: plot.id, crop: plot.crop, polygon: JSON.parse(plot.geojson) as PlotPolygon, areaHa: plot.areaHa, ...historyEndMonth(plot) },
    seenMediaHashes: seen,
    // TP6: this plot's accepted, non-Rejected kg in the receipt season, and the crop's reference row
    seasonCherryKgBefore: seasonKg,
    yieldReference: reference ? { maxKgHa: reference.maxKgHa, cherryToCleanRatio: reference.cherryToCleanRatio, source: reference.source } : null,
    // The provider REMOTE_SENSING_PROVIDER names, with 8 s timeouts and the per-plot cache (§7, TKT-07).
    remoteSensing: withE2eDelay(deps.remoteSensing ?? appRemoteSensing(db, env)),
  };
}
