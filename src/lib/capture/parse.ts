import { mimeMatches, SNIFF_BYTES, sniffImage, type SniffedImage } from '../media/sniff';
import type { CapturePayloadV1 } from '../verification/types';
import { MAX_BODY_BYTES, MAX_PHOTO_BYTES, MAX_PHOTOS } from './limits';
import { capturePayloadV1 } from './payload';

// The multipart capture body (technical-plan §5.2): `payload` (the JCS string), `signature`, and
// `photo0..photo2` in upload order. TSK-19.2 (TC-074, EVAL-081): cheapest check first, all before
// verify() runs — Content-Length (checkContentLength, before the body is read) → photo count → photo
// sizes → magic bytes → payload schema. Canonical form and the signature follow in the boundary.
// A refusal carries the payload and signature strings when the form had them, so the pipeline can
// anchor it once the signature verifies (Solution-PRD §7 rule 2).
//
// Staged photos (TSK-30.3, TP28): the form may carry `staged`, a JSON array of the sha256 of photos the
// phone uploaded earlier (/api/capture/stage), in place of their file parts. The payload's media list
// says where each goes: a photo whose hash is staged takes its staged bytes, every other photo the next
// file part. Staged bytes pass the same size and type checks (after the schema, since the payload orders
// them) and the boundary's hash check, so nothing about what is signed or verified changes. A staged photo
// that is not there for this agent and phone (missing, expired, another's) is `media_not_staged` (409,
// never anchored: nothing was refused, the phone resends the bytes).

export { MAX_PHOTOS } from './limits';

export type FormReason = 'length_required' | 'body_too_large' | 'bad_form' | 'media_count' | 'media_too_large' | 'media_type' | 'bad_schema' | 'media_not_staged';

export type FormRefusal = {
  ok: false;
  status: 400 | 409 | 411 | 413 | 415;
  reason: FormReason;
  /** The payload field a schema refusal names (a zod path such as `gps.lat`). */
  field?: string;
  payloadString?: string;
  signature?: string;
  /** media_not_staged: the staged hashes that were not there. */
  missing?: string[];
};

/** `files` holds every photo in payload order, staged ones included; `staged` lists the staged hashes used. */
export type CaptureForm = { payloadString: string; signature: string; files: File[]; payload: CapturePayloadV1; staged: string[] };

/**
 * The staged bytes of `sha256s` for the signed-in agent and the phone the payload names, as found (a
 * missing hash is simply absent). Bound by the pipeline to the agent and the clock (staging.ts readStaged).
 */
export type LoadStaged = (sha256s: string[], deviceId: string) => Promise<Map<string, Uint8Array>>;
export type ParseOptions = { loadStaged?: LoadStaged };

export type ParseResult = { ok: true; form: CaptureForm } | FormRefusal;

const refuse = (status: FormRefusal['status'], reason: FormReason, extra: Partial<FormRefusal> = {}): FormRefusal => ({ ok: false, status, reason, ...extra });

/** 411 without a usable Content-Length, 413 above MAX_BODY_BYTES; null when the body may be read. */
export function checkContentLength(headers: Headers): FormRefusal | null {
  const raw = headers.get('content-length');
  if (raw === null || !/^\d{1,15}$/.test(raw.trim())) return refuse(411, 'length_required');
  if (Number(raw.trim()) > MAX_BODY_BYTES) return refuse(413, 'body_too_large');
  return null;
}

const PHOTO = /^photo(0|[1-9]\d?)$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** The `staged` field: 1..MAX_PHOTOS distinct lowercase sha256 strings, else null. */
function stagedList(value: FormDataEntryValue | null): string[] | null {
  if (typeof value !== 'string') return null;
  let list: unknown;
  try {
    list = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_PHOTOS) return null;
  if (!list.every((h) => typeof h === 'string' && SHA256.test(h)) || new Set(list).size !== list.length) return null;
  return list as string[];
}

/** Read the capture form with the ordered TSK-19.2 checks. Never throws on client input. */
export async function parseCaptureForm(form: FormData, opts: ParseOptions = {}): Promise<ParseResult> {
  // Structure: known field names, each once.
  const seen = new Set<string>();
  const photos = new Map<number, FormDataEntryValue>();
  for (const [name, value] of form.entries()) {
    if (seen.has(name)) return refuse(400, 'bad_form');
    seen.add(name);
    const m = PHOTO.exec(name);
    if (m) photos.set(Number(m[1]), value);
    else if (name !== 'payload' && name !== 'signature' && name !== 'staged') return refuse(400, 'bad_form');
  }
  const payloadString = form.get('payload');
  const signature = form.get('signature');
  if (typeof payloadString !== 'string' || typeof signature !== 'string') return refuse(400, 'bad_form');
  const strings = { payloadString, signature };
  const staged = form.has('staged') ? stagedList(form.get('staged')) : [];
  if (staged === null) return refuse(400, 'bad_form', strings);

  // Count: 1..3 photos (uploaded and staged), the uploaded ones in slots photo0..photo{n-1}, each a file.
  const total = photos.size + staged.length;
  if (total === 0 || total > MAX_PHOTOS) return refuse(400, 'media_count', strings);
  const files: File[] = [];
  for (let i = 0; i < photos.size; i++) {
    const f = photos.get(i);
    if (f === undefined || typeof f === 'string') return refuse(400, 'bad_form', strings);
    files.push(f);
  }

  // Sizes, then magic bytes (JPEG or HEIC/HEIF only; the declared file type is never trusted).
  if (files.some((f) => f.size > MAX_PHOTO_BYTES)) return refuse(413, 'media_too_large', strings);
  const sniffed: SniffedImage[] = [];
  for (const f of files) {
    const type = sniffImage(new Uint8Array(await f.slice(0, SNIFF_BYTES).arrayBuffer()));
    if (type === null) return refuse(415, 'media_type', strings);
    sniffed.push(type);
  }

  // Schema, naming the first failing field.
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadString);
  } catch {
    return refuse(400, 'bad_schema', { ...strings, field: 'payload' });
  }
  const schema = capturePayloadV1.safeParse(parsed);
  if (!schema.success) {
    const path = schema.error.issues[0]?.path.map(String).join('.') ?? '';
    return refuse(400, 'bad_schema', { ...strings, field: path === '' ? 'payload' : path });
  }
  const payload = schema.data;
  if (staged.length === 0) {
    // The signed type must be what the bytes are (it names the stored file); a missing entry is the
    // boundary's media-count/hash check.
    for (const [i, type] of sniffed.entries()) {
      const m = payload.media[i];
      if (m && !mimeMatches(type, m.mime)) return refuse(415, 'media_type', strings);
    }
    return { ok: true, form: { payloadString, signature, files, payload, staged: [] } };
  }
  return withStaged({ payloadString, signature, payload, files, sniffed, staged }, opts);
}

/**
 * Put the staged photos in their places (TSK-30.3): each payload photo whose hash is staged takes the
 * staged bytes, every other one the next uploaded file; uploaded files left over go last (the boundary
 * then refuses the count as media_hash_mismatch). Staged bytes get the upload's size and type checks.
 */
async function withStaged(
  f: { payloadString: string; signature: string; payload: CapturePayloadV1; files: File[]; sniffed: SniffedImage[]; staged: string[] },
  opts: ParseOptions,
): Promise<ParseResult> {
  const strings = { payloadString: f.payloadString, signature: f.signature };
  const listed = new Set(f.payload.media.map((m) => m.sha256));
  if (f.staged.some((h) => !listed.has(h))) return refuse(400, 'bad_form', strings);

  const found = opts.loadStaged ? await opts.loadStaged(f.staged, f.payload.deviceId) : new Map<string, Uint8Array>();
  const missing = f.staged.filter((h) => !found.has(h));
  if (missing.length > 0) return refuse(409, 'media_not_staged', { ...strings, missing });
  const stagedSet = new Set(f.staged);

  const files: File[] = [];
  const types: SniffedImage[] = [];
  let next = 0;
  for (const m of f.payload.media) {
    const bytes = stagedSet.has(m.sha256) ? found.get(m.sha256)! : undefined;
    if (bytes) {
      if (bytes.length > MAX_PHOTO_BYTES) return refuse(413, 'media_too_large', strings);
      const type = sniffImage(bytes.subarray(0, SNIFF_BYTES));
      if (type === null) return refuse(415, 'media_type', strings);
      files.push(new File([bytes as Uint8Array<ArrayBuffer>], `staged-${m.sha256.slice(0, 12)}`));
      types.push(type);
    } else if (next < f.files.length) {
      files.push(f.files[next]!);
      types.push(f.sniffed[next]!);
      next++;
    }
  }
  for (; next < f.files.length; next++) {
    files.push(f.files[next]!);
    types.push(f.sniffed[next]!);
  }
  for (const [i, type] of types.entries()) {
    const m = f.payload.media[i];
    if (m && !mimeMatches(type, m.mime)) return refuse(415, 'media_type', strings);
  }
  return { ok: true, form: { payloadString: f.payloadString, signature: f.signature, files, payload: f.payload, staged: f.staged } };
}

/** The deviceId a payload claims, before anything about it is verified (rate limiting, TSK-19.3). */
export function claimedDeviceId(payloadString: FormDataEntryValue | null): string | null {
  if (typeof payloadString !== 'string') return null;
  try {
    const id = (JSON.parse(payloadString) as { deviceId?: unknown } | null)?.deviceId;
    return typeof id === 'string' && /^DV-[0-9A-HJKMNP-TV-Z]{8}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
