import { sniffImage } from '../media/sniff';
import type { CapturePayloadV1 } from '../verification/types';
import { MAX_BODY_BYTES, MAX_PHOTO_BYTES, MAX_PHOTOS } from './limits';
import { capturePayloadV1 } from './payload';

// The multipart capture body (technical-plan §5.2): `payload` (the JCS string), `signature`, and
// `photo0..photo2` in upload order. TSK-19.2 (TC-074, EVAL-081): cheapest check first, all before
// verify() runs — Content-Length (checkContentLength, before the body is read) → photo count → photo
// sizes → magic bytes → payload schema. Canonical form and the signature follow in the boundary.
// A refusal carries the payload and signature strings when the form had them, so the pipeline can
// anchor it once the signature verifies (Solution-PRD §7 rule 2).

export { MAX_PHOTOS } from './limits';

export type FormReason = 'length_required' | 'body_too_large' | 'bad_form' | 'media_count' | 'media_too_large' | 'media_type' | 'bad_schema';

export type FormRefusal = {
  ok: false;
  status: 400 | 411 | 413 | 415;
  reason: FormReason;
  /** The payload field a schema refusal names (a zod path such as `gps.lat`). */
  field?: string;
  payloadString?: string;
  signature?: string;
};

export type CaptureForm = { payloadString: string; signature: string; files: File[]; payload: CapturePayloadV1 };

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
const MAGIC_BYTES = 16;

/** Read the capture form with the ordered TSK-19.2 checks. Never throws on client input. */
export async function parseCaptureForm(form: FormData): Promise<ParseResult> {
  // Structure: known field names, each once.
  const seen = new Set<string>();
  const photos = new Map<number, FormDataEntryValue>();
  for (const [name, value] of form.entries()) {
    if (seen.has(name)) return refuse(400, 'bad_form');
    seen.add(name);
    const m = PHOTO.exec(name);
    if (m) photos.set(Number(m[1]), value);
    else if (name !== 'payload' && name !== 'signature') return refuse(400, 'bad_form');
  }
  const payloadString = form.get('payload');
  const signature = form.get('signature');
  if (typeof payloadString !== 'string' || typeof signature !== 'string') return refuse(400, 'bad_form');
  const strings = { payloadString, signature };

  // Count: 1..3 photos, in slots photo0..photo{n-1}, each a file.
  if (photos.size === 0 || photos.size > MAX_PHOTOS) return refuse(400, 'media_count', strings);
  const files: File[] = [];
  for (let i = 0; i < photos.size; i++) {
    const f = photos.get(i);
    if (f === undefined || typeof f === 'string') return refuse(400, 'bad_form', strings);
    files.push(f);
  }

  // Sizes, then magic bytes (JPEG or HEIC/HEIF only; the declared file type is never trusted).
  if (files.some((f) => f.size > MAX_PHOTO_BYTES)) return refuse(413, 'media_too_large', strings);
  for (const f of files) {
    if (sniffImage(new Uint8Array(await f.slice(0, MAGIC_BYTES).arrayBuffer())) === null) return refuse(415, 'media_type', strings);
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
  return { ok: true, form: { payloadString, signature, files, payload: schema.data } };
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
