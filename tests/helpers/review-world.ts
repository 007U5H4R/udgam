import { jcs, sha256Hex, sign } from '../../src/lib/crypto';
import { persistAccepted, type StoredMedia } from '../../src/lib/capture/persist';
import { writeTx, type Db } from '../../src/lib/db/client';
import { adminOverrides, verificationRuns } from '../../src/lib/db/schema';
import { newId } from '../../src/lib/ids';
import { append } from '../../src/lib/ledger/hashchain';
import { CONFIG, CONFIG_HASH } from '../../src/lib/verification/config';
import { score } from '../../src/lib/verification/score';
import { CHECK_IDS, type CapturePayloadV1, type CheckId, type CheckResult, type Verdict } from '../../src/lib/verification/types';
import { P01_INSIDE } from '../../scripts/tracer-plot';
import type { Crop, FpoWorld } from './batch-fixtures';

// Pickings with a chosen set of twelve check results for the admin review tests (TKT-12). Written by the
// real writer (persistAccepted: harvest_event + media + verification_run and both ledger entries), so
// the queue, the detail, re-run and override read what a capture really stores.

/** All twelve checks passing, with `over` replacing some (status, hardFail, evidence, provider). */
export function checksWith(over: Partial<Record<CheckId, Partial<CheckResult>>> = {}): CheckResult[] {
  return CHECK_IDS.map((id) => {
    const o = over[id] ?? {};
    const status = o.status ?? 'ok';
    return {
      id,
      status,
      score: status === 'unavailable' ? 0 : CONFIG.statusScore[status],
      weight: 1,
      hardFail: o.hardFail ?? false,
      evidence: o.evidence ?? `${id} evidence (${status})`,
      ...(o.provider ? { provider: o.provider } : {}),
    };
  });
}

export type ReviewCapture = { eventId: string; runId: string; payloadHash: string; serverReceivedAt: string; plotId: string; cherryKg: number };

/**
 * One accepted capture on the world's plot with `checks` as run 1 (verdict and score from score() unless
 * given). `media` are the photos' hashes (stored rows; the files need not exist).
 */
export async function seedReviewCapture(
  db: Db,
  w: FpoWorld,
  o: { checks: CheckResult[]; verdict?: Verdict; score?: number; kg?: number; crop?: Crop; receivedAt?: string; media?: { sha256: string; exif?: StoredMedia['exif'] }[] },
): Promise<ReviewCapture> {
  const crop = o.crop ?? 'arabica';
  const d = w.device;
  const media = o.media ?? [{ sha256: newId('', 64).toLowerCase().replace(/[^0-9a-f]/g, 'b') }];
  const serverReceivedAt = o.receivedAt ?? new Date().toISOString();
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: w.plots[crop].plotId,
    deviceId: d.id,
    seq: d.seq + 1,
    prevEventHash: d.last,
    capturedAt: serverReceivedAt,
    gps: { lat: P01_INSIDE.lat, lng: P01_INSIDE.lng, accuracyM: 8 },
    cherryKg: o.kg ?? 38.5,
    media: media.map((m) => ({ sha256: m.sha256, size: 1000, mime: 'image/jpeg' })),
  };
  const payloadString = jcs(payload);
  const payloadHash = await sha256Hex(payloadString);
  const signature = await sign(d.pair.privateKey, payloadString);
  const s = score(o.checks, CONFIG);
  const ids = await writeTx(db, (tx) =>
    persistAccepted(tx, {
      payload,
      payloadString,
      payloadHash,
      signature,
      serverReceivedAt,
      device: { id: d.id, agentId: w.agentId, publicJwk: d.publicJwk, revokedAt: null, lastSeq: d.seq, lastEventHash: d.last === 'genesis' ? null : d.last },
      media: media.map((m) => ({ sha256: m.sha256, size: 1000, mime: 'image/jpeg', path: `media/${m.sha256.slice(0, 2)}/${m.sha256}`, exif: m.exif ?? { gps: null, takenAt: null, hadOffset: false } })),
      result: {
        verdict: o.verdict ?? s.verdict,
        score: o.score ?? s.score,
        checks: o.checks,
        unavailableProviders: [...new Set(o.checks.filter((c) => c.status === 'unavailable' && c.provider).map((c) => c.provider!))],
        capReasons: s.capReasons,
        config: { version: CONFIG.version, hash: CONFIG_HASH },
      },
    }),
  );
  d.seq += 1;
  d.last = payloadHash;
  return { ...ids, payloadHash, serverReceivedAt, plotId: payload.plotId, cherryKg: payload.cherryKg };
}

/** A further verification run of `eventId` (anchored), as a re-run writes it. */
export async function addRun(db: Db, eventId: string, runNo: number, checks: CheckResult[], verdict?: Verdict): Promise<string> {
  const s = score(checks, CONFIG);
  const id = newId('VR-', 12);
  const createdAt = new Date().toISOString();
  await writeTx(db, async (tx) => {
    const a = await append(tx, 'verification_run', { runId: id, eventId, runNo, verdict: verdict ?? s.verdict, score: s.score, createdAt });
    await tx.insert(verificationRuns).values({
      id,
      eventId,
      runNo,
      verdict: verdict ?? s.verdict,
      score: s.score,
      checks: JSON.stringify(checks),
      unavailableProviders: '[]',
      configVersion: CONFIG.version,
      configHash: CONFIG_HASH,
      createdAt,
      anchorSeq: a.seq,
    });
  });
  return id;
}

/** An override row written directly (anchored, unsigned test statement): for queue tests only. */
export async function addOverride(db: Db, runId: string, adminId: string, newVerdict: 'Verified' | 'Rejected' = 'Verified'): Promise<void> {
  await writeTx(db, async (tx) => {
    const a = await append(tx, 'admin_override', { v: 1, runId, newVerdict });
    await tx.insert(adminOverrides).values({
      id: newId('AO-', 12),
      runId,
      adminId,
      newVerdict,
      reason: 'Checked by the office in person',
      signature: 'test',
      keyId: 'test',
      createdAt: new Date().toISOString(),
      anchorSeq: a.seq,
    });
  });
}
