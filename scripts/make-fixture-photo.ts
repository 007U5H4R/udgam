// Regenerates evals/fixtures/photos/p01-exif-ok.jpg: a small real JPEG with EXIF GPS inside the
// tracer plot P01 and a DateTimeOriginal (TKT-02, TC-013). Derived from the AI-generated demo photo
// assets/demo-photos/branch-01.jpg (read-only input); the output bytes are reproducible for a given
// sharp/libvips version. Usage: pnpm exec tsx scripts/make-fixture-photo.ts
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { booleanPointInPolygon, point } from '@turf/turf';
import exifr from 'exifr';
import sharp from 'sharp';
import { P01_INSIDE, P01_POLYGON } from './tracer-plot';

const SOURCE = 'assets/demo-photos/branch-01.jpg';
const OUT = 'evals/fixtures/photos/p01-exif-ok.jpg';
const MAX_BYTES = 150 * 1024;
/** Local IST wall-clock time, no zone: phone EXIF is read as IST (TP25). */
const DATE_TIME_ORIGINAL = '2026:10:14 09:40:12';

/** Decimal degrees → EXIF "d/1 m/1 s/10000" rationals. */
function dms(decimal: number): string {
  const abs = Math.abs(decimal);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60 * 10_000);
  return `${d}/1 ${m}/1 ${s}/10000`;
}

async function main(): Promise<void> {
  const { lat, lng } = P01_INSIDE;
  const jpeg = await sharp(readFileSync(SOURCE))
    .rotate()
    .resize({ width: 640, withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .withExif({
      IFD0: { Make: 'Udgam fixture', Model: 'p01-exif-ok', Software: 'scripts/make-fixture-photo.ts' },
      IFD2: { DateTimeOriginal: DATE_TIME_ORIGINAL },
      IFD3: {
        GPSLatitudeRef: lat >= 0 ? 'N' : 'S',
        GPSLatitude: dms(lat),
        GPSLongitudeRef: lng >= 0 ? 'E' : 'W',
        GPSLongitude: dms(lng),
      },
    })
    .toBuffer();

  // Read it back and prove what the fixture claims.
  const exif = (await exifr.parse(jpeg, { gps: true, exif: true, reviveValues: false })) as {
    latitude?: number;
    longitude?: number;
    DateTimeOriginal?: string;
  };
  if (exif.latitude === undefined || exif.longitude === undefined) throw new Error('EXIF GPS missing');
  if (Math.abs(exif.latitude - lat) > 1e-6 || Math.abs(exif.longitude - lng) > 1e-6) throw new Error('EXIF GPS differs');
  if (!booleanPointInPolygon(point([exif.longitude, exif.latitude]), P01_POLYGON)) throw new Error('EXIF GPS outside P01');
  if (exif.DateTimeOriginal !== DATE_TIME_ORIGINAL) throw new Error(`DateTimeOriginal is ${String(exif.DateTimeOriginal)}`);
  if (jpeg.length > MAX_BYTES) throw new Error(`fixture is ${jpeg.length} bytes, over ${MAX_BYTES}`);

  mkdirSync('evals/fixtures/photos', { recursive: true });
  writeFileSync(OUT, jpeg);
  const sha = createHash('sha256').update(jpeg).digest('hex');
  console.log(`${OUT}: ${jpeg.length} bytes, sha256 ${sha}, GPS ${exif.latitude},${exif.longitude}, ${exif.DateTimeOriginal}`);
}

await main();
