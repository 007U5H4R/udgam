// Regenerates the TKT-08 EXIF fixtures (TC-035): small real JPEGs whose EXIF is exactly what the
// test expects. sharp writes the EXIF (it is already a dependency, so no piexifjs); exifr reads every
// file back before it is written, so a fixture can never claim more than it holds. sample.heic is not
// generated (see README.md). Usage: pnpm exec tsx evals/fixtures/photos/make.ts
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import exifr from 'exifr';
import sharp, { type Exif } from 'sharp';
import { P01_INSIDE } from '../../../scripts/tracer-plot';

const DIR = dirname(fileURLToPath(import.meta.url));

/** Local wall-clock time as a phone writes it: no zone (TP25). */
export const DATE_TIME_ORIGINAL = '2026:09:20 10:15:00';
/** The zone some phones add in OffsetTimeOriginal (EXIF 2.31). */
export const OFFSET_TIME_ORIGINAL = '+05:30';
/** EXIF GPS on gps-time-offset.jpg: the tracer plot P01's inside point. */
export const GPS = P01_INSIDE;

/** Decimal degrees → EXIF "d/1 m/1 s/10000" rationals. */
function dms(decimal: number): string {
  const abs = Math.abs(decimal);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60 * 10_000);
  return `${d}/1 ${m}/1 ${s}/10000`;
}

/** A 64×48 plain green JPEG (coffee-leaf colour); `exif` undefined → no metadata at all. */
function jpeg(exif?: Exif): Promise<Buffer> {
  const img = sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 46, g: 94, b: 52 } } }).jpeg({ quality: 70 });
  return (exif ? img.withExif(exif) : img).toBuffer();
}

type Read = { latitude?: number; longitude?: number; DateTimeOriginal?: string; OffsetTimeOriginal?: string };
const read = async (b: Buffer): Promise<Read> => ((await exifr.parse(b, { gps: true, reviveValues: false })) as Read | undefined) ?? {};

function check(name: string, ok: boolean, what: string): void {
  if (!ok) throw new Error(`${name}: ${what}`);
}

async function main(): Promise<void> {
  const files: Record<string, Buffer> = {
    'gps-time-offset.jpg': await jpeg({
      IFD0: { Make: 'Udgam fixture', Model: 'gps-time-offset' },
      IFD2: { DateTimeOriginal: DATE_TIME_ORIGINAL, OffsetTimeOriginal: OFFSET_TIME_ORIGINAL },
      IFD3: { GPSLatitudeRef: GPS.lat >= 0 ? 'N' : 'S', GPSLatitude: dms(GPS.lat), GPSLongitudeRef: GPS.lng >= 0 ? 'E' : 'W', GPSLongitude: dms(GPS.lng) },
    }),
    'time-no-offset.jpg': await jpeg({ IFD0: { Make: 'Udgam fixture', Model: 'time-no-offset' }, IFD2: { DateTimeOriginal: DATE_TIME_ORIGINAL } }),
    'no-exif.jpg': await jpeg(),
  };

  const a = await read(files['gps-time-offset.jpg']!);
  check('gps-time-offset.jpg', Math.abs((a.latitude ?? NaN) - GPS.lat) < 1e-7 && Math.abs((a.longitude ?? NaN) - GPS.lng) < 1e-7, 'GPS differs');
  check('gps-time-offset.jpg', a.DateTimeOriginal === DATE_TIME_ORIGINAL && a.OffsetTimeOriginal === OFFSET_TIME_ORIGINAL, 'time differs');
  const b = await read(files['time-no-offset.jpg']!);
  check('time-no-offset.jpg', b.DateTimeOriginal === DATE_TIME_ORIGINAL && b.OffsetTimeOriginal === undefined && b.latitude === undefined, 'EXIF differs');
  const c = await read(files['no-exif.jpg']!);
  check('no-exif.jpg', Object.keys(c).length === 0, 'has EXIF');

  for (const [name, bytes] of Object.entries(files)) {
    writeFileSync(join(DIR, name), bytes);
    console.log(`${name}: ${bytes.length} bytes, sha256 ${createHash('sha256').update(bytes).digest('hex')}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
