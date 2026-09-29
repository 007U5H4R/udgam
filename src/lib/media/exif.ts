import exifr from 'exifr';
import type { LatLng } from '../geo/types';

// EXIF facts from a stored photo (technical-plan §22 TSK-08.1; TP25; review focus 7, 8). exifr would
// turn DateTimeOriginal into a JS Date in the *process* time zone, so values are read raw
// (reviveValues:false) and the zone is applied here by explicit arithmetic: OffsetTimeOriginal when the
// phone wrote one, else IST (+05:30). Never throws: a photo we cannot read has no facts, and the
// checks treat absent EXIF as a flag, never a failure.

/** What the server read from one photo. `verification/types` ExifFacts is the {gps, takenAt} subset. */
export type ExifFacts = {
  gps: LatLng | null;
  /** ISO-8601 UTC with milliseconds. */
  takenAt: string | null;
  /** True when takenAt used the photo's own OffsetTimeOriginal rather than the IST default. */
  hadOffset: boolean;
  make?: string;
  model?: string;
};

const NONE: ExifFacts = { gps: null, takenAt: null, hadOffset: false };
const IST_OFFSET_MIN = 5 * 60 + 30;
const PICK = ['DateTimeOriginal', 'OffsetTimeOriginal', 'Make', 'Model'];

/** "+05:30" / "-04:00" / "Z" → minutes east of UTC; anything else → null. */
function offsetMinutes(offset: string): number | null {
  if (offset.trim() === 'Z') return 0;
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset.trim());
  if (!m) return null;
  const h = Number(m[2]);
  const min = Number(m[3]);
  if (h > 14 || min > 59) return null;
  return (m[1] === '-' ? -1 : 1) * (h * 60 + min);
}

/**
 * An EXIF `YYYY:MM:DD HH:MM:SS` wall-clock time → ISO UTC. The offset applies when well-formed;
 * otherwise the time is read as IST (TP25). Impossible or placeholder times → null.
 */
export function exifTimeToIso(raw: string, offset?: string | null): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  if (y < 1970 || mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  if (new Date(wall).getUTCDate() !== d) return null; // e.g. 30 February
  const off = (offset ? offsetMinutes(offset) : null) ?? IST_OFFSET_MIN;
  return new Date(wall - off * 60_000).toISOString();
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

/** Camera make/model are free text from the file: at most this many characters are kept (TKT-19). */
export const MAX_LABEL_CHARS = 64;

/**
 * A camera label fit to store and show: control and format characters (C0/C1, DEL, bidi overrides)
 * removed, trimmed, capped at MAX_LABEL_CHARS code points; undefined when nothing printable is left.
 */
export function exifLabel(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const clean = [...v.replace(/[\p{Cc}\p{Cf}]/gu, '').trim()].slice(0, MAX_LABEL_CHARS).join('').trim();
  return clean === '' ? undefined : clean;
}

function validGps(g: { latitude?: unknown; longitude?: unknown } | undefined): LatLng | null {
  if (!g) return null;
  const { latitude: lat, longitude: lng } = g;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null; // a camera's "no fix" placeholder, not a place
  return { lat, lng };
}

/** EXIF GPS, capture time (TP25) and camera from a JPEG or HEIC. Never throws. */
export async function extractExif(bytes: Uint8Array): Promise<ExifFacts> {
  if (bytes.length === 0) return { ...NONE };
  const [tags, gps] = await Promise.all([
    exifr.parse(bytes, { gps: true, reviveValues: false, pick: PICK }).catch(() => undefined) as Promise<Record<string, unknown> | undefined>,
    exifr.gps(bytes).catch(() => undefined),
  ]);
  const raw = str(tags?.DateTimeOriginal);
  const offset = str(tags?.OffsetTimeOriginal);
  const takenAt = raw ? exifTimeToIso(raw, offset) : null;
  const make = exifLabel(tags?.Make);
  const model = exifLabel(tags?.Model);
  return {
    gps: validGps(gps),
    takenAt,
    hadOffset: takenAt !== null && offset !== undefined && offsetMinutes(offset) !== null,
    ...(make ? { make } : {}),
    ...(model ? { model } : {}),
  };
}
