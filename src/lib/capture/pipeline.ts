import { desc, eq } from 'drizzle-orm';
import { sha256Hex } from '../crypto';
import { writeTx, type Db } from '../db/client';
import { devices, harvestEvents, plots, verificationRuns } from '../db/schema';
import { log as defaultLog } from '../log';
import type { MediaStore } from '../media/store';
import { verify } from '../verification/verify';
import type { CapturePayloadV1, CheckId, CheckResult, CheckStatus, Submission, Verdict } from '../verification/types';
import { checkBoundary, STATUS, type BoundaryDevice, type BoundaryReason } from './boundary';
import { buildContext } from './context';
import { CaptureFormError, parseCaptureForm } from './parse';
import { capturePayloadV1 } from './payload';
import { persistAccepted, persistRejected, type AppendFn, type StoredMedia } from './persist';

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
  | { t: 'rejected'; reason: string; status: number }
  | { t: 'error'; retryable: boolean };

export type CaptureDeps = {
  db: Db;
  media: MediaStore;
  now?: () => Date;
  /** Ledger append; injectable so tests can fail it inside the transaction (TC-010, EVAL-067). */
  append?: AppendFn;
  log?: Pick<typeof defaultLog, 'error' | 'info'>;
};

/** EXIF is read from the stored photo from TKT-08 on (media/exif.ts); until then it is absent. */
const NO_EXIF = { gps: null, takenAt: null };

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

/** The schema-valid payload in a string, or null (for recording a rejection's fields). */
function tryPayload(payloadString: string): CapturePayloadV1 | null {
  try {
    const r = capturePayloadV1.safeParse(JSON.parse(payloadString));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
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

/** Status for a recorded refusal (boundary reasons, plus plot assignment §6.4). */
function statusFor(reason: string): number {
  return reason in STATUS ? STATUS[reason as BoundaryReason] : reason === 'plot_not_assigned' ? 403 : 400;
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

export async function runCapture(form: FormData, deps: CaptureDeps, emit: (line: CaptureEvent) => void): Promise<void> {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? defaultLog;
  const created: string[] = [];

  const reject = async (
    input: { payloadString: string; signature: string },
    reason: string,
    status: number,
    device: BoundaryDevice | null,
    serverReceivedAt: string,
  ) => {
    const payloadHash = await sha256Hex(input.payloadString);
    await writeTx(db, (tx) =>
      persistRejected(
        tx,
        { ...input, payloadHash, serverReceivedAt, reason, payload: tryPayload(input.payloadString), device },
        deps.append,
      ),
    );
    emit({ t: 'rejected', reason, status });
  };

  try {
    let form_;
    try {
      form_ = await parseCaptureForm(form);
    } catch (err) {
      if (err instanceof CaptureFormError) {
        emit({ t: 'rejected', reason: 'bad_form', status: 400 }); // no payload to anchor
        return;
      }
      throw err;
    }
    const serverReceivedAt = now().toISOString();

    // 2. boundary (canonical bytes, schema, device, signature, revocation, media hashes)
    const b = await checkBoundary(form_, { findDevice: (id) => findDevice(db, id) });
    if (!b.ok) {
      await reject(form_, b.reason, b.status, b.device ?? null, serverReceivedAt);
      return;
    }
    const { payload, payloadHash, device } = b;

    // 3. idempotency
    const previous = await previousAnswer(db, payloadHash);
    if (previous) {
      emit(previous);
      return;
    }

    // plot assignment is a boundary rule (§6.4); TKT-05 checks agent_plots, here the plot must exist
    const [plot] = await db.select().from(plots).where(eq(plots.id, payload.plotId));
    if (!plot) {
      await reject(form_, 'plot_not_assigned', 403, device, serverReceivedAt);
      return;
    }

    // 4. media (content-addressed; removed again below if the transaction fails)
    const stored: StoredMedia[] = [];
    for (const [i, file] of form_.files.entries()) {
      const m = payload.media[i]!;
      const put = await deps.media.put(new Uint8Array(await file.arrayBuffer()), m.sha256, m.mime);
      if (put.created) created.push(put.path);
      stored.push({ sha256: m.sha256, size: m.size, mime: m.mime, path: put.path });
    }

    // 5–6. context (reads only) and verification, streaming each finished check
    const ctx = await buildContext(db, { payload, device, plot });
    const sub: Submission = {
      payload,
      payloadHash,
      signature: form_.signature,
      media: payload.media.map((m) => ({ sha256: m.sha256, exif: NO_EXIF })),
      serverReceivedAt,
    };
    const result = await verify(sub, ctx, { onCheck: (r) => emit({ t: 'check', id: r.id, status: r.status }) });

    // 7. one transaction: event, media, run and both ledger entries
    const { eventId } = await writeTx(db, (tx) =>
      persistAccepted(
        tx,
        { payload, payloadString: form_.payloadString, payloadHash, signature: form_.signature, serverReceivedAt, device, media: stored, result },
        deps.append,
      ),
    );
    created.length = 0; // committed: the files now belong to rows

    // 8. verdict, only after COMMIT
    emit(verdictLine(eventId, result));
  } catch (err) {
    for (const path of created) {
      await deps.media.remove(path).catch(() => undefined);
    }
    log.error({ errClass: err instanceof Error ? err.constructor.name : typeof err }, 'capture.failed');
    emit({ t: 'error', retryable: true });
  }
}
