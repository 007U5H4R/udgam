import { and, count, desc, eq, gte, inArray, isNull, lt, ne, or, sum, type SQL } from 'drizzle-orm';
import { env } from '../config/env';
import type { Db, Tx } from '../db/client';
import { devices, harvestEvents, media, plots } from '../db/schema';
import type { ExifFacts } from '../media/exif';
import type { PlotPolygon } from '../geo/types';
import { parseRegistrationChecks } from '../plots/registration';
import { appRemoteSensing } from '../remote-sensing';
import type { RemoteSensingProvider } from '../remote-sensing/types';
import type { CapturePayloadV1, Submission, VerifyContext } from '../verification/types';
import { getYieldReference } from '../yield/reference';
import { coffeeSeasonOf, seasonCherryKgBefore } from '../yield/season';
import type { BoundaryDevice } from './boundary';

// Builds the VerifyContext for a submission that passed the boundary (technical-plan §3.1 step 5).
// Reads only: it runs before the write transaction opens; refreshUnderLock re-reads what a concurrent
// commit can change, inside it.

export type PlotRow = typeof plots.$inferSelect;

/**
 * "As of" a stored capture (TKT-12 re-run): only events anchored before it count. Its ledger seq orders
 * it against every other capture exactly as they committed, and excludes the capture itself.
 */
export type AsOf = { eventId: string; anchorSeq: number };
const before = (asOf: AsOf | undefined): SQL | undefined => (asOf ? lt(harvestEvents.anchorSeq, asOf.anchorSeq) : undefined);

/**
 * Test-only (technical-plan §1, TSK-10.10): with `E2E=1` and `E2E_FIXTURE_DELAY_MS=<ms>` (read through
 * env.ts), every NDVI call of the FIXTURE provider answers that much later, so the e2e can watch the
 * satellite groups tick after the local ones (TC-045). Without `E2E=1`, or for the live provider, the
 * provider is returned unchanged.
 */
export function withE2eDelay(
  provider: RemoteSensingProvider,
  vars: { E2E?: string; E2E_FIXTURE_DELAY_MS?: number } = { E2E: env.E2E, E2E_FIXTURE_DELAY_MS: env.E2E_FIXTURE_DELAY_MS },
): RemoteSensingProvider {
  const ms = vars.E2E_FIXTURE_DELAY_MS ?? 0;
  if (vars.E2E !== '1' || provider.name !== 'fixture' || ms <= 0) return provider;
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
export async function seenMediaHashes(handle: Db | Tx, hashes: readonly string[], asOf?: AsOf): Promise<Set<string>> {
  const unique = [...new Set(hashes)];
  if (unique.length === 0) return new Set();
  const rows = await handle
    .selectDistinct({ sha256: media.sha256 })
    .from(media)
    .innerJoin(harvestEvents, eq(harvestEvents.id, media.eventId))
    .where(and(inArray(media.sha256, unique), eq(harvestEvents.boundaryStatus, 'accepted'), before(asOf)));
  return new Set(rows.map((r) => r.sha256));
}

/** How many accepted events this agent has, on any phone (chain_continuity's re-enrolment rule). */
async function agentAcceptedEvents(handle: Db | Tx, agentId: string, asOf?: AsOf): Promise<number> {
  const [row] = await handle
    .select({ n: count() })
    .from(harvestEvents)
    .where(and(eq(harvestEvents.agentId, agentId), eq(harvestEvents.boundaryStatus, 'accepted'), before(asOf)));
  return row?.n ?? 0;
}

/** The phone's latest accepted capture, where and when (movement_plausibility), or null. */
async function previousEventOf(handle: Db | Tx, deviceId: string, asOf?: AsOf): Promise<VerifyContext['previousEvent']> {
  const [previous] = await handle
    .select({ lat: harvestEvents.lat, lng: harvestEvents.lng, capturedAt: harvestEvents.clientCapturedAt })
    .from(harvestEvents)
    .where(and(eq(harvestEvents.deviceId, deviceId), eq(harvestEvents.boundaryStatus, 'accepted'), before(asOf)))
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

/**
 * TP6's season total as of a stored capture: this plot's accepted, non-Rejected kg in the season,
 * anchored before it (so never its own kg, and never a later capture's).
 */
async function seasonKgAsOf(handle: Db | Tx, plotId: string, serverReceivedAt: string, asOf: AsOf): Promise<number> {
  const season = coffeeSeasonOf(serverReceivedAt);
  const [row] = await handle
    .select({ kg: sum(harvestEvents.cherryKg) })
    .from(harvestEvents)
    .where(
      and(
        eq(harvestEvents.plotId, plotId),
        eq(harvestEvents.boundaryStatus, 'accepted'),
        or(isNull(harvestEvents.finalVerdict), ne(harvestEvents.finalVerdict, 'Rejected')),
        gte(harvestEvents.serverReceivedAt, season.start),
        lt(harvestEvents.serverReceivedAt, season.end),
        before(asOf),
      ),
    );
  return Number(row?.kg ?? 0);
}

export async function buildContext(
  db: Db,
  {
    payload,
    device,
    plot,
    serverReceivedAt = new Date().toISOString(),
    asOf,
  }: {
    payload: CapturePayloadV1;
    device: BoundaryDevice;
    plot: PlotRow;
    /** The server's receipt time: it picks the coffee season (TP6). Defaults to now. */
    serverReceivedAt?: string;
    /** Rebuild the context of an already-stored capture as it was then (TKT-12 re-run; buildContextAsOf). */
    asOf?: AsOf;
  },
  deps: { remoteSensing?: RemoteSensingProvider } = {},
): Promise<VerifyContext> {
  const [seen, prior, previousEvent, seasonKg, reference] = await Promise.all([
    seenMediaHashes(
      db,
      payload.media.map((m) => m.sha256),
      asOf,
    ),
    agentAcceptedEvents(db, device.agentId, asOf),
    previousEventOf(db, device.id, asOf),
    asOf ? seasonKgAsOf(db, plot.id, serverReceivedAt, asOf) : seasonCherryKgBefore(db, plot.id, coffeeSeasonOf(serverReceivedAt)),
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

/**
 * A stored, accepted capture rebuilt for a re-run (technical-plan TSK-12.4): the Submission exactly as it
 * was verified (the signed payload string, its signature, each photo's stored EXIF in payload order, the
 * original server receipt time), and its context AS OF that capture — only events anchored before it
 * count, so its own photos are not "seen before" and its own kilograms are not in the season total; the
 * phone's chain head, previous capture and the agent's earlier captures are those before it; a phone
 * revoked since then reads as it was then. The plot is the current row (a later boundary edit is a new
 * anchored fact, TKT-06). Null when the event is unknown, rejected, or its device or plot is gone.
 */
export async function buildContextAsOf(
  db: Db,
  eventId: string,
  deps: { remoteSensing?: RemoteSensingProvider } = {},
): Promise<{ sub: Submission; ctx: VerifyContext } | null> {
  const [event] = await db.select().from(harvestEvents).where(eq(harvestEvents.id, eventId));
  if (!event || event.boundaryStatus !== 'accepted' || !event.deviceId || !event.plotId) return null;
  const asOf: AsOf = { eventId, anchorSeq: event.anchorSeq };
  const [[d], [plot], photos, [head]] = await Promise.all([
    db.select().from(devices).where(eq(devices.id, event.deviceId)),
    db.select().from(plots).where(eq(plots.id, event.plotId)),
    db.select({ sha256: media.sha256, exif: media.exif }).from(media).where(eq(media.eventId, eventId)),
    db
      .select({ seq: harvestEvents.seq, payloadHash: harvestEvents.payloadHash })
      .from(harvestEvents)
      .where(and(eq(harvestEvents.deviceId, event.deviceId), eq(harvestEvents.boundaryStatus, 'accepted'), before(asOf)))
      .orderBy(desc(harvestEvents.seq))
      .limit(1),
  ]);
  if (!d || !plot) return null;

  const payload = JSON.parse(event.payload) as CapturePayloadV1;
  const exifOf = new Map(photos.map((p) => [p.sha256, p.exif ? (JSON.parse(p.exif) as ExifFacts) : null]));
  const noExif: ExifFacts = { gps: null, takenAt: null, hadOffset: false };
  const sub: Submission = {
    payload,
    payloadHash: event.payloadHash,
    signature: event.signature,
    media: payload.media.map((m) => ({ sha256: m.sha256, exif: exifOf.get(m.sha256) ?? noExif })),
    serverReceivedAt: event.serverReceivedAt,
  };
  const device: BoundaryDevice = {
    id: d.id,
    agentId: d.agentId,
    publicJwk: JSON.parse(d.publicKeyJwk) as JsonWebKey,
    revokedAt: d.revokedAt !== null && d.revokedAt <= event.serverReceivedAt ? d.revokedAt : null,
    lastSeq: head?.seq ?? 0,
    lastEventHash: head?.payloadHash ?? null,
  };
  const ctx = await buildContext(db, { payload, device, plot, serverReceivedAt: event.serverReceivedAt, asOf }, deps);
  return { sub, ctx };
}
