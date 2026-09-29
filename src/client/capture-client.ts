import type { CaptureEvent } from '../lib/capture/pipeline';
import { sha256Hex } from '../lib/crypto';
import type { CheckId, CheckStatus } from '../lib/verification/types';
import { advanceDevice, countAttempt, deleteOutbox, loadSigner, putOutbox } from './capture-store';
import type { GpsWatch } from './gps';
import { signCapture } from './sign';

// Sending a capture (technical-plan §3.1, §9, TSK-10.9). The phone builds the payload from the photos'
// hashes (taken when each photo was accepted), canonicalises and signs it, writes it to the outbox
// BEFORE the upload, then POSTs multipart and reads the NDJSON stream line by line. Every send ends in
// exactly one outcome: a verdict, a boundary refusal (retrying cannot help), or retryable.

/** The server's verdict line as the phone keeps it (NDJSON `{t:"verdict"}` without `t`). */
export type VerdictView = Omit<Extract<CaptureEvent, { t: 'verdict' }>, 't'>;

export type SendResult =
  | { kind: 'verdict'; verdict: VerdictView; idempotent: boolean }
  | { kind: 'rejected'; reason: string; field?: string }
  | { kind: 'retryable'; cause: 'offline' | 'server'; retryAfterSec?: number };

export type SignedCapture = { payload: string; signature: string; files: Blob[] };

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type SendOptions = { onCheck?: (id: CheckId, status: CheckStatus) => void; signal?: AbortSignal; fetchImpl?: FetchLike };

export function captureForm({ payload, signature, files }: SignedCapture): FormData {
  const fd = new FormData();
  fd.set('payload', payload);
  fd.set('signature', signature);
  files.forEach((f, i) => fd.set(`photo${i}`, f));
  return fd;
}

/** A refusal line, with the extras TKT-19's boundary adds (`field` on schema errors, `retryAfterSec` on 429). */
type RejectedLine = Extract<CaptureEvent, { t: 'rejected' }> & { field?: string; retryAfterSec?: number };
type Line = Exclude<CaptureEvent, { t: 'rejected' }> | RejectedLine | { error?: unknown };

function parseLine(raw: string): Line | null {
  if (raw.trim() === '') return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' ? (v as Line) : null;
  } catch {
    return null; // not a JSON line (for example a proxy's HTML error page)
  }
}

/** A terminal line's outcome, or null for a check line / anything else. */
function outcome(line: Line): SendResult | null {
  if (!('t' in line)) return typeof line.error === 'string' ? { kind: 'rejected', reason: line.error } : null;
  switch (line.t) {
    case 'verdict': {
      const { t: _t, idempotent, ...rest } = line;
      void _t;
      return { kind: 'verdict', verdict: rest, idempotent: idempotent === true };
    }
    case 'rejected':
      if (line.reason === 'rate_limited') return { kind: 'retryable', cause: 'server', ...(line.retryAfterSec !== undefined ? { retryAfterSec: line.retryAfterSec } : {}) };
      return { kind: 'rejected', reason: line.reason, ...(line.field !== undefined ? { field: line.field } : {}) };
    case 'error':
      return { kind: 'retryable', cause: 'server' };
    default:
      return null;
  }
}

/** The longest a phone waits on a server's Retry-After before it sends an outbox copy again (N6). */
export const MAX_RETRY_WAIT_SEC = 60;

/** A Retry-After header in whole seconds (the delay form), or undefined when absent or not positive. */
function retryAfter(res: Response): number | undefined {
  const after = Number(res.headers.get('Retry-After'));
  return Number.isFinite(after) && after > 0 ? after : undefined;
}

/** POST one signed capture and follow its NDJSON stream (TP12). Never throws. */
export async function sendCapture(capture: SignedCapture, opts: SendOptions = {}): Promise<SendResult> {
  const fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  let res: Response;
  try {
    res = await fetchImpl('/api/capture', { method: 'POST', body: captureForm(capture), signal: opts.signal, credentials: 'same-origin' });
  } catch {
    return { kind: 'retryable', cause: 'offline' };
  }
  if (res.status >= 500) {
    // The busy answer (TASK-20 fix round 2, N6) says when to come back; sendOutboxItem waits that long.
    const after = res.status === 503 ? retryAfter(res) : undefined;
    return { kind: 'retryable', cause: 'server', ...(after !== undefined ? { retryAfterSec: Math.min(after, MAX_RETRY_WAIT_SEC) } : {}) };
  }
  if (!res.body) return res.ok ? { kind: 'retryable', cause: 'server' } : { kind: 'rejected', reason: 'other' };

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  const handle = (raw: string): SendResult | null => {
    const line = parseLine(raw);
    if (!line) return null;
    if ('t' in line && line.t === 'check') {
      try {
        opts.onCheck?.(line.id, line.status);
      } catch {
        // a screen update must never lose the answer
      }
      return null;
    }
    return outcome(line);
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const r = handle(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (r) {
          void reader.cancel().catch(() => undefined);
          return r;
        }
      }
    }
  } catch {
    return { kind: 'retryable', cause: 'offline' }; // the connection broke mid-stream: the copy is on the phone
  }
  const last = handle(buffer);
  if (last) return last;
  if (res.status === 429) {
    const after = retryAfter(res);
    return { kind: 'retryable', cause: 'server', ...(after !== undefined ? { retryAfterSec: after } : {}) };
  }
  return res.ok ? { kind: 'retryable', cause: 'server' } : { kind: 'rejected', reason: 'other' };
}

export type Photo = { file: Blob; sha256: string; size: number; mime: string };

export type SubmitResult = SendResult | { kind: 'not_ready'; reason: 'no_device' | 'no_fix' };

/** A signed capture as kept in the outbox, with what re-sending it needs. */
export type OutboxSend = { id: string; payload: string; signature: string; files: Blob[]; deviceId: string; seq: number };

/**
 * Build, sign, keep and send one picking. The GPS fix is the one the watch already holds (TP13); only
 * when it is older than 10 s does Submit wait (up to 10 s) for a fresh one. The outbox copy is written
 * before the upload and deleted only on a verdict or on a refusal retrying cannot fix; the device's
 * chain head moves on only when the server has the event (a verdict).
 */
export async function submitCapture(
  draft: { plotId: string; cherryKg: number; photos: Photo[]; gps: GpsWatch | null },
  opts: SendOptions & { keepOnRefusal?: (reason: string) => boolean; now?: () => Date } = {},
): Promise<SubmitResult & { item?: OutboxSend }> {
  const signer = await loadSigner();
  if (!signer) return { kind: 'not_ready', reason: 'no_device' };
  const held = draft.gps?.best();
  const fix = held && Date.now() - held.at <= 10_000 ? held : ((await draft.gps?.waitForFresh(10_000)) ?? null);
  if (!fix) return { kind: 'not_ready', reason: 'no_fix' };

  const { payloadString, signature } = await signCapture(
    {
      plotId: draft.plotId,
      deviceId: signer.deviceId,
      seq: signer.nextSeq,
      prevEventHash: signer.lastEventHash,
      gps: { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM },
      cherryKg: draft.cherryKg,
      media: draft.photos.map(({ sha256, size, mime }) => ({ sha256, size, mime })),
    },
    signer.privateKey,
    opts.now,
  );
  const files = draft.photos.map((p) => p.file);
  const id = await putOutbox({ payload: payloadString, signature, files, plotId: draft.plotId, cherryKg: draft.cherryKg });
  const item: OutboxSend = { id, payload: payloadString, signature, files, deviceId: signer.deviceId, seq: signer.nextSeq };
  const r = await sendOutboxItem(item, opts);
  return { ...r, item };
}

/** When each outbox copy may be sent again (epoch ms), after an answer that carried Retry-After. */
const notBefore = new Map<string, number>();

/** Wait `ms`, or until `signal` aborts; true when the wait ran out. */
function pause(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Send a stored capture as it is — the identical payload string and blobs, never re-signed (TP7). When
 * the last send of this copy was answered with Retry-After (the busy 503, or 429), this one first waits
 * out what is left of it, at most MAX_RETRY_WAIT_SEC (TASK-20 fix round 2, N6).
 */
export async function sendOutboxItem(
  item: OutboxSend,
  opts: SendOptions & { keepOnRefusal?: (reason: string) => boolean } = {},
): Promise<SendResult> {
  const wait = (notBefore.get(item.id) ?? 0) - Date.now();
  if (wait > 0 && !(await pause(wait, opts.signal))) return { kind: 'retryable', cause: 'offline' };
  notBefore.delete(item.id);
  await countAttempt(item.id).catch(() => undefined);
  const r = await sendCapture({ payload: item.payload, signature: item.signature, files: item.files }, opts);
  if (r.kind === 'retryable' && r.retryAfterSec !== undefined) notBefore.set(item.id, Date.now() + Math.min(r.retryAfterSec, MAX_RETRY_WAIT_SEC) * 1000);
  if (r.kind === 'verdict') {
    await advanceDevice(item.deviceId, item.seq, await sha256Hex(item.payload));
    await deleteOutbox(item.id);
  } else if (r.kind === 'rejected' && !(opts.keepOnRefusal?.(r.reason) ?? false)) {
    await deleteOutbox(item.id);
  }
  return r;
}
