import { desc, eq } from 'drizzle-orm';
import { sha256Hex } from '../crypto';
import { writeTx, type Db, type Tx } from '../db/client';
import { devices, harvestEvents, media, plots, verificationRuns } from '../db/schema';
import { isPlotAssigned } from '../enrolment/assign';
import { log as defaultLog } from '../log';
import { extractExif } from '../media/exif';
import type { MediaStore } from '../media/store';
import { photoUniqueness } from '../verification/checks/photo-uniqueness';
import { CONFIG } from '../verification/config';
import { score } from '../verification/score';
import { runCheck, verify } from '../verification/verify';
import type { CapturePayloadV1, CheckId, CheckResult, CheckStatus, Submission, Verdict, VerifyContext, VerifyResult } from '../verification/types';
import { authenticate, checkBoundary, STATUS, type BoundaryDevice, type BoundaryReason } from './boundary';
import { buildContext, seenMediaHashes } from './context';
import { claimedDeviceId, parseCaptureForm, type FormReason } from './parse';
import { persistAccepted, persistRejected, type AppendFn, type StoredMedia } from './persist';
import { consume, DEVICE_LIMIT, deviceKey } from './rate-limit';

// The capture pipeline (technical-plan §3.1). Emits NDJSON-able events: a `check` line as each check
// finishes, then exactly one terminal line — `verdict` (only after COMMIT), `rejected` (boundary 4xx,
// anchored), or `error` (retryable; nothing persisted, new media files removed).

export type CaptureEvent =
  | { t: 'check'; id: CheckId; status: CheckStatus }
  | {
      t: 'verdict';
      eventId: string;
      verdict: Verdict;
      score: number;
      checks: { id: CheckId; status: CheckStatus; evidence: string }[];
      idempotent?: boolean;
    }
  | {
      t: 'rejected';
      reason: string;
      status: number;
      /** The payload field a schema refusal names (TSK-19.2). */
      field?: string;
      /** Seconds until a rate-limited phone may try again (429, TSK-19.3). */
      retryAfterSec?: number;
    }
  | { t: 'error'; retryable: boolean };

export type CaptureDeps = {
  db: Db;
  media: MediaStore;
  /**
   * The signed-in agent, from the session (never from the payload). The signing device must be enrolled
   * to this agent (technical-plan §10); checked before the idempotent replay, so another account's resend
   * of someone's payload learns nothing.
   */
  agentId: string;
  now?: () => Date;
  /** Ledger append; injectable so tests can fail it inside the transaction (TC-010, EVAL-067). */
  append?: AppendFn;
  log?: Pick<typeof defaultLog, 'error' | 'info' | 'warn'>;
};

async function findDevice(db: Db, id: string): Promise<BoundaryDevice | null> {
  const [d] = await db.select().from(devices).where(eq(devices.id, id));
  if (!d) return null;
  return {
    id: d.id,
    agentId: d.agentId,
    publicJwk: JSON.parse(d.publicKeyJwk) as JsonWebKey,
    revokedAt: d.revokedAt,
    lastSeq: d.lastSeq,
    lastEventHash: d.lastEventHash,
  };
}

function verdictLine(eventId: string, run: { verdict: Verdict; score: number; checks: CheckResult[] }) {
  return {
    t: 'verdict' as const,
    eventId,
    verdict: run.verdict,
    score: run.score,
    checks: run.checks.map(({ id, status, evidence }) => ({ id, status, evidence })),
  };
}

/** Status for a recorded refusal (the boundary reasons, plot assignment §6.4 among them). */
function statusFor(reason: string): number {
  return Object.hasOwn(STATUS, reason) ? STATUS[reason as BoundaryReason] : 400;
}

/**
 * Idempotency (EV15, TP7): a payload already on record gets its original answer and nothing is
 * written — the verdict of an accepted one, or the refusal of one rejected at the boundary (one
 * signed payload has one row: payload_hash is unique).
 */
async function previousAnswer(db: Db, payloadHash: string): Promise<CaptureEvent | null> {
  const [ev] = await db
    .select({ id: harvestEvents.id, boundaryStatus: harvestEvents.boundaryStatus, boundaryReason: harvestEvents.boundaryReason })
    .from(harvestEvents)
    .where(eq(harvestEvents.payloadHash, payloadHash));
  if (!ev) return null;
  if (ev.boundaryStatus === 'rejected') {
    const reason = ev.boundaryReason ?? 'rejected';
    return { t: 'rejected', reason, status: statusFor(reason) };
  }
  const [run] = await db
    .select()
    .from(verificationRuns)
    .where(eq(verificationRuns.eventId, ev.id))
    .orderBy(desc(verificationRuns.runNo))
    .limit(1);
  if (!run) return null;
  return {
    ...verdictLine(ev.id, { verdict: run.verdict, score: run.score, checks: JSON.parse(run.checks) as CheckResult[] }),
    idempotent: true,
  };
}

const errClass = (err: unknown) => (err instanceof Error ? err.constructor.name : typeof err);

/** Is a stored file referenced by a committed media row? */
async function isReferenced(db: Db, path: string): Promise<boolean> {
  const [row] = await db.select({ id: media.id }).from(media).where(eq(media.path, path)).limit(1);
  return row !== undefined;
}

/**
 * Run one capture. `emit` receives each `check` line and then exactly one terminal line. The listener
 * may throw (a client that has gone away): that is logged as a delivery failure and never changes or
 * re-reports what was committed. Resolves; never rejects.
 */
export async function runCapture(form: FormData, deps: CaptureDeps, emit: (line: CaptureEvent) => void): Promise<void> {
  const log = deps.log ?? defaultLog;
  const send = (line: CaptureEvent) => {
    try {
      emit(line);
    } catch (err) {
      log.warn({ errClass: errClass(err), line: line.t }, 'capture.emit_failed');
    }
  };
  const held: string[] = []; // media paths this request holds until it commits or fails
  const releaseHolds = () => {
    for (const path of held.splice(0)) deps.media.release(path);
  };
  // No media row of this request was committed: drop its holds, then delete each photo only if no other
  // request holds it and no committed row references it (content-addressed files are shared).
  const dropStored = async () => {
    const paths = [...new Set(held)];
    releaseHolds();
    for (const path of paths) {
      try {
        await deps.media.removeIfUnused(path, () => isReferenced(deps.db, path));
      } catch (cleanupErr) {
        log.error({ errClass: errClass(cleanupErr) }, 'capture.media_cleanup_failed');
      }
    }
  };

  let terminal: CaptureEvent;
  try {
    terminal = await capture(form, deps, send, held);
  } catch (err) {
    await dropStored(); // nothing was committed
    log.error({ errClass: errClass(err) }, 'capture.failed');
    send({ t: 'error', retryable: true });
    return;
  }
  // A refusal stores no media row (a late one, at step 7, may already have stored the photos).
  if (terminal.t === 'rejected') await dropStored();
  else releaseHolds(); // committed (or nothing stored): the rows now own the files
  send(terminal);
}

/**
 * photo_uniqueness under the write lock (TKT-19): the context read the seen photo hashes before media
 * storage and verification, so two captures carrying the same new photo could both pass. Re-read them
 * inside the write transaction; if a photo has been accepted since, re-run that (local, pure) check and
 * re-score. Returns the result to commit.
 */
async function recheckPhotoUniqueness(tx: Tx, sub: Submission, ctx: VerifyContext, result: VerifyResult): Promise<VerifyResult> {
  const i = result.checks.findIndex((c) => c.id === photoUniqueness.id);
  if (i < 0) return result;
  const seen = await seenMediaHashes(
    tx,
    sub.media.map((m) => m.sha256),
  );
  if ([...seen].every((h) => ctx.seenMediaHashes.has(h))) return result;
  const check = await runCheck(photoUniqueness, sub, { ...ctx, seenMediaHashes: seen }, CONFIG);
  const checks = result.checks.map((c, j) => (j === i ? check : c));
  const s = score(checks, CONFIG);
  return { ...result, checks, verdict: s.verdict, score: s.score, capReasons: s.capReasons };
}

/** Upload refusals from parse.ts that a valid signature makes attributable (anchored, TSK-19.4). */
const MEDIA_REASONS = new Set<FormReason>(['media_count', 'media_too_large', 'media_type']);
/** Signature refusals of a well-formed payload that are anchored without naming a device (EVAL-051/053). */
const UNVERIFIED_ANCHORED = new Set<BoundaryReason>(['unknown_device', 'bad_signature']);

/**
 * Step 7's re-check, under the write lock (BEGIN IMMEDIATE): the boundary read the device and the plot
 * assignment before media storage and verification, and a revocation or un-assignment may have
 * committed since (TOCTOU). Returns the refusal that now applies, or null.
 */
async function lateRefusal(tx: Tx, device: BoundaryDevice, plotId: string): Promise<'device_revoked' | 'plot_not_assigned' | null> {
  const [d] = await tx.select({ revokedAt: devices.revokedAt }).from(devices).where(eq(devices.id, device.id));
  if (!d || d.revokedAt !== null) return 'device_revoked';
  if (!(await isPlotAssigned(tx, device.agentId, plotId))) return 'plot_not_assigned';
  return null;
}

/** The capture steps (technical-plan §3.1). Returns the terminal line; throws when nothing was committed. */
async function capture(form: FormData, deps: CaptureDeps, send: (line: CaptureEvent) => void, held: string[]): Promise<CaptureEvent> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

  const log = deps.log ?? defaultLog;

  /** A refusal that is only logged: nothing about the request is attributable to an enrolled phone. */
  const refuse = (line: Omit<Extract<CaptureEvent, { t: 'rejected' }>, 't'>): CaptureEvent => {
    log.info({ reason: line.reason, status: line.status, anchored: false }, 'capture.refused');
    return { t: 'rejected', ...line };
  };
  /**
   * A refusal of a well-formed signed payload: anchored as a rejected harvest_event (§7 rule 2; TP7: once
   * per payload). `device` is set only when its key verified the signature.
   */
  const reject = async (
    input: { payloadString: string; signature: string },
    reason: string,
    status: number,
    device: BoundaryDevice | null,
    payload: CapturePayloadV1,
    serverReceivedAt: string,
  ): Promise<CaptureEvent> => {
    const payloadHash = await sha256Hex(input.payloadString);
    await writeTx(db, (tx) => persistRejected(tx, { ...input, payloadHash, serverReceivedAt, reason, payload, device }, deps.append));
    log.info({ reason, status, anchored: true }, 'capture.refused');
    return { t: 'rejected', reason, status };
  };
  // Another agent's phone: an authorisation refusal, not a verdict on the payload. Not anchored, so it can
  // neither answer with the owner's recorded result nor block the owner's own upload of the same payload.
  const notOwned = (): CaptureEvent => refuse({ reason: 'device_not_owned', status: 403 });

  // Rate limit on the phone the payload claims, before anything about it is verified (TSK-19.3).
  const claimed = claimedDeviceId(form.get('payload'));
  if (claimed) {
    const rl = await consume(db, deviceKey(claimed), DEVICE_LIMIT.limit, DEVICE_LIMIT.windowSec, now());
    if (!rl.ok) return refuse({ reason: 'rate_limited', status: 429, retryAfterSec: rl.retryAfterSec });
  }

  // 1. the form, cheapest check first: count → sizes → magic bytes → schema (TSK-19.2)
  const parsed = await parseCaptureForm(form);
  const serverReceivedAt = now().toISOString();
  if (!parsed.ok) {
    const { payloadString, signature } = parsed;
    if (MEDIA_REASONS.has(parsed.reason) && payloadString !== undefined && signature !== undefined) {
      const auth = await authenticate({ payloadString, signature }, { findDevice: (id) => findDevice(db, id) });
      if (auth.ok) {
        if (auth.device.agentId !== deps.agentId) return notOwned();
        return reject({ payloadString, signature }, parsed.reason, parsed.status, auth.device, auth.payload, serverReceivedAt);
      }
    }
    return refuse({ reason: parsed.reason, status: parsed.status, ...(parsed.field ? { field: parsed.field } : {}) });
  }
  const form_ = parsed.form;

  // 2. boundary (canonical bytes, schema, device, signature, revocation, plot assignment, media sizes and hashes)
  const b = await checkBoundary(form_, { findDevice: (id) => findDevice(db, id), isPlotAssigned: (agentId, plotId) => isPlotAssigned(db, agentId, plotId) });
  if (b.device && b.device.agentId !== deps.agentId) return notOwned();
  if (!b.ok) {
    if (b.signedByKnownDevice && b.device) return reject(form_, b.reason, b.status, b.device, form_.payload, serverReceivedAt);
    // A canonical, schema-valid payload whose signature no enrolled key verifies (EVAL-051, EVAL-053):
    // anchored, unattributed. Only a garbled payload (non_canonical) is merely logged.
    if (UNVERIFIED_ANCHORED.has(b.reason)) return reject(form_, b.reason, b.status, null, form_.payload, serverReceivedAt);
    return refuse({ reason: b.reason, status: b.status });
  }
  const { payload, payloadHash, device } = b;

  // 3. idempotency
  const previous = await previousAnswer(db, payloadHash);
  if (previous) return previous;

  // the plot exists: the boundary found a live agent_plots assignment for it (§6.4, foreign key)
  const [plot] = await db.select().from(plots).where(eq(plots.id, payload.plotId));
  if (!plot) return reject(form_, 'plot_not_assigned', STATUS.plot_not_assigned, device, payload, serverReceivedAt);

  // 4. media (content-addressed and shared; each put holds its path until this request ends) and
  // the EXIF read from each stored photo's bytes (TKT-08; never throws, absent → nulls)
  const stored: StoredMedia[] = [];
  for (const [i, file] of form_.files.entries()) {
    const m = payload.media[i]!;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const put = await deps.media.put(bytes, m.sha256, m.mime);
    held.push(put.path);
    stored.push({ sha256: m.sha256, size: m.size, mime: m.mime, path: put.path, exif: await extractExif(bytes) });
  }

  // 5–6. context (reads only) and verification, streaming each finished check
  const ctx = await buildContext(db, { payload, device, plot, serverReceivedAt });
  const sub: Submission = {
    payload,
    payloadHash,
    signature: form_.signature,
    media: stored.map((m) => ({ sha256: m.sha256, exif: m.exif })),
    serverReceivedAt,
  };
  const result = await verify(sub, ctx, { onCheck: (r) => send({ t: 'check', id: r.id, status: r.status }) });

  // 7. one transaction: re-check revocation and assignment, then event, media, run and both ledger
  // entries — or, if either changed meanwhile, the anchored refusal instead. photo_uniqueness is
  // re-read under the lock too, so the verdict streamed after COMMIT is the one committed.
  let final = result;
  const committed = await writeTx(db, async (tx) => {
    const late = await lateRefusal(tx, device, payload.plotId);
    if (late) {
      await persistRejected(
        tx,
        { payloadString: form_.payloadString, payloadHash, signature: form_.signature, serverReceivedAt, reason: late, payload, device },
        deps.append,
      );
      return { refused: late } as const;
    }
    final = await recheckPhotoUniqueness(tx, sub, ctx, result);
    return persistAccepted(
      tx,
      { payload, payloadString: form_.payloadString, payloadHash, signature: form_.signature, serverReceivedAt, device, media: stored, result: final },
      deps.append,
    );
  });
  if ('refused' in committed) return { t: 'rejected', reason: committed.refused, status: STATUS[committed.refused] };

  // 8. the verdict line; runCapture sends it only now, after COMMIT
  return verdictLine(committed.eventId, final);
}
