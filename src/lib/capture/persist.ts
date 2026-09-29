import { eq } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { devices, harvestEvents, media, verificationRuns } from '../db/schema';
import { newId } from '../ids';
import { append as ledgerAppend } from '../ledger/hashchain';
import type { ExifFacts } from '../media/exif';
import type { CapturePayloadV1, VerifyResult } from '../verification/types';
import type { BoundaryDevice } from './boundary';

// Capture writes (technical-plan §3.1 step 7, N7, TP14). Every function takes a transaction handle:
// the provenance rows and their ledger entries commit together or not at all. Ledger payloads are
// public-safe (EV16): IDs, hashes, numbers and the signed capture, never a farmer's name.

export type AppendFn = typeof ledgerAppend;

export type StoredMedia = { sha256: string; size: number; mime: string; path: string; exif: ExifFacts };

export type AcceptedCapture = {
  payload: CapturePayloadV1;
  payloadString: string;
  payloadHash: string;
  signature: string;
  serverReceivedAt: string;
  device: BoundaryDevice;
  media: StoredMedia[];
  result: VerifyResult;
};

/** Write an accepted capture: harvest_event entry + row, media rows, verification_run entry + row. */
export async function persistAccepted(tx: Tx, c: AcceptedCapture, append: AppendFn = ledgerAppend): Promise<{ eventId: string; runId: string }> {
  const eventId = newId('HE-', 12);
  const runId = newId('VR-', 12);
  const { payload } = c;

  const eventAnchor = await append(tx, 'harvest_event', {
    eventId,
    plotId: payload.plotId,
    deviceId: c.device.id,
    seq: payload.seq,
    payloadHash: c.payloadHash,
    capture: payload, // canonicalises to exactly the signed string, so the device signature is checkable from the ledger
    signature: c.signature,
    boundaryStatus: 'accepted',
    serverReceivedAt: c.serverReceivedAt,
  });
  await tx.insert(harvestEvents).values({
    id: eventId,
    plotId: payload.plotId,
    deviceId: c.device.id,
    agentId: c.device.agentId,
    seq: payload.seq,
    clientCapturedAt: payload.capturedAt,
    serverReceivedAt: c.serverReceivedAt,
    lat: payload.gps.lat,
    lng: payload.gps.lng,
    accuracyM: payload.gps.accuracyM,
    cherryKg: payload.cherryKg,
    prevEventHash: payload.prevEventHash,
    payload: c.payloadString,
    payloadHash: c.payloadHash,
    signature: c.signature,
    boundaryStatus: 'accepted',
    anchorSeq: eventAnchor.seq,
  });
  for (const m of c.media) {
    // thumb_path arrives with TKT-10
    await tx.insert(media).values({ id: newId('ME-', 12), eventId, path: m.path, sha256: m.sha256, size: m.size, mime: m.mime, exif: JSON.stringify(m.exif) });
  }

  const r = c.result;
  const createdAt = c.serverReceivedAt;
  const runAnchor = await append(tx, 'verification_run', {
    runId,
    eventId,
    runNo: 1,
    verdict: r.verdict,
    score: r.score,
    checks: r.checks.map(({ id, status, hardFail, evidence, provider }) => ({ id, status, hardFail, evidence, ...(provider ? { provider } : {}) })),
    capReasons: r.capReasons,
    unavailableProviders: r.unavailableProviders,
    config: r.config,
    createdAt,
  });
  await tx.insert(verificationRuns).values({
    id: runId,
    eventId,
    runNo: 1,
    verdict: r.verdict,
    score: r.score,
    checks: JSON.stringify(r.checks),
    unavailableProviders: JSON.stringify(r.unavailableProviders),
    configVersion: r.config.version,
    configHash: r.config.hash,
    createdAt,
    anchorSeq: runAnchor.seq,
  });

  // The device's chain head moves forward only (chain_continuity, TKT-09, reads it).
  const [d] = await tx.select({ lastSeq: devices.lastSeq }).from(devices).where(eq(devices.id, c.device.id));
  if (d && payload.seq > d.lastSeq) {
    await tx.update(devices).set({ lastSeq: payload.seq, lastEventHash: c.payloadHash }).where(eq(devices.id, c.device.id));
  }
  return { eventId, runId };
}

export type RejectedCapture = {
  payloadString: string;
  payloadHash: string;
  signature: string;
  serverReceivedAt: string;
  reason: string;
  /** The schema-valid payload, when there is one. */
  payload: CapturePayloadV1 | null;
  /** Set only when the device's key verified the signature, so the rejection is attributable. */
  device: BoundaryDevice | null;
};

/**
 * Anchor a boundary rejection as a rejected harvest_event (§3.1 step 2). A payload already on record
 * (same payload_hash) is not written twice. Returns the event id, or null when it already existed.
 */
export async function persistRejected(tx: Tx, c: RejectedCapture, append: AppendFn = ledgerAppend): Promise<string | null> {
  const [existing] = await tx.select({ id: harvestEvents.id }).from(harvestEvents).where(eq(harvestEvents.payloadHash, c.payloadHash));
  if (existing) return null;
  const eventId = newId('HE-', 12);
  const p = c.payload;
  const anchor = await append(tx, 'harvest_event', {
    eventId,
    plotId: p?.plotId ?? null,
    deviceId: c.device?.id ?? null,
    payloadHash: c.payloadHash,
    boundaryStatus: 'rejected',
    boundaryReason: c.reason,
    serverReceivedAt: c.serverReceivedAt,
  });
  await tx.insert(harvestEvents).values({
    id: eventId,
    plotId: p?.plotId ?? null,
    deviceId: c.device?.id ?? null,
    agentId: c.device?.agentId ?? null,
    seq: p?.seq ?? null,
    clientCapturedAt: p?.capturedAt ?? null,
    serverReceivedAt: c.serverReceivedAt,
    lat: p?.gps.lat ?? null,
    lng: p?.gps.lng ?? null,
    accuracyM: p?.gps.accuracyM ?? null,
    cherryKg: p?.cherryKg ?? null,
    prevEventHash: p?.prevEventHash ?? null,
    payload: c.payloadString,
    payloadHash: c.payloadHash,
    signature: c.signature,
    boundaryStatus: 'rejected',
    boundaryReason: c.reason,
    anchorSeq: anchor.seq,
  });
  return eventId;
}
