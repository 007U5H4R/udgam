import { loadSigner } from './capture-store';

// Background photo staging (technical-plan §22 TSK-30.4, TP28). When the farmer taps "Use this photo",
// the photo is uploaded to /api/capture/stage so Submit only has to send the signed payload. It is
// invisible to the farmer (no UI change, Design.md §14) and best effort: at most two uploads at a time,
// no retry loop, and any failure simply leaves the photo to go with the capture as before. The phone
// remembers what is staged for this page's lifetime only; after a reload everything is sent as bytes,
// and the outbox keeps every photo's bytes until a verdict whatever is staged (TKT-11 unchanged).

/** At most this many stage uploads at once. */
export const MAX_STAGING_IN_FLIGHT = 2;
/**
 * How long the phone trusts a staged photo: under the server's hour (staging.ts STAGE_TTL_MS), so a
 * Submit seldom names one that has just expired; if it does, the server answers 409 and the bytes go.
 */
export const STAGED_TRUST_MS = 50 * 60 * 1000;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type StageOptions = { mime?: string; deviceId?: string; fetchImpl?: FetchLike; now?: () => number };

const trusted = new Map<string, number>(); // sha256 → staged-until (this phone's clock, ms)
const inFlight = new Map<string, Promise<'staged' | 'failed'>>();
let running = 0;
const queue: (() => void)[] = [];

async function take(): Promise<void> {
  if (running < MAX_STAGING_IN_FLIGHT) {
    running++;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
}
function give(): void {
  const next = queue.shift();
  if (next) next();
  else running--;
}

/**
 * Stage one accepted photo (its sha256 as hashed for the payload). Resolves 'staged' once the server
 * holds it, else 'failed'; never throws. A photo already staged, or being staged, is not sent twice.
 */
export function stagePhoto(file: Blob, sha256: string, opts: StageOptions = {}): Promise<'staged' | 'failed'> {
  const now = opts.now ?? Date.now;
  if ((trusted.get(sha256) ?? 0) > now()) return Promise.resolve('staged');
  const pending = inFlight.get(sha256);
  if (pending) return pending;
  const p = upload(file, sha256, opts, now).finally(() => inFlight.delete(sha256));
  inFlight.set(sha256, p);
  return p;
}

async function upload(file: Blob, sha256: string, opts: StageOptions, now: () => number): Promise<'staged' | 'failed'> {
  const fetchImpl = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  await take();
  try {
    const deviceId = opts.deviceId ?? (await loadSigner())?.deviceId;
    if (!deviceId) return 'failed';
    const res = await fetchImpl('/api/capture/stage', {
      method: 'POST',
      body: file,
      credentials: 'same-origin',
      headers: { 'Content-Type': opts.mime ?? (file.type || 'image/jpeg'), 'X-Udgam-Device': deviceId },
    });
    if (res.status !== 201) return 'failed';
    const body = (await res.json()) as { sha256?: unknown };
    if (body.sha256 !== sha256) return 'failed';
    trusted.set(sha256, now() + STAGED_TRUST_MS);
    return 'staged';
  } catch {
    return 'failed';
  } finally {
    give();
  }
}

/** The photos this phone may name as staged at Submit (staged and still trusted). */
export function stagedHashes(now: number = Date.now()): Set<string> {
  const out = new Set<string>();
  for (const [sha, until] of trusted) {
    if (until > now) out.add(sha);
    else trusted.delete(sha);
  }
  return out;
}

/** The server no longer has these (409 media_not_staged), or a capture has used them. */
export function forgetStaged(hashes: Iterable<string>): void {
  for (const h of hashes) trusted.delete(h);
}

/** Tests only: forget everything. */
export function resetStagingForTests(): void {
  trusted.clear();
  inFlight.clear();
  running = 0;
  queue.length = 0;
}
