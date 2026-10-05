import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Demo photos with synthetic EXIF (technical-plan TSK-20.2, TP29). The source images are the
// AI-generated slot photos in assets/demo-photos (read-only input, never evidence). Each capture gets
// its own copy: re-encoded at a slightly different quality, with EXIF GPS at the capture point,
// DateTimeOriginal in IST with OffsetTimeOriginal +05:30 and `Make: Udgam demo`, so no two seeded photos
// share bytes (photo_uniqueness) and the EXIF checks read them like a phone's. Used by the seed, the
// staged attacks and the demo e2e.

const ASSETS = fileURLToPath(new URL('../../assets/demo-photos/', import.meta.url));

/** The capture slots in screen order (Design.md D6), and the demo images for each (assets/demo-photos/manifest.json). */
export const SLOT_FILES = {
  branch: ['branch-01.jpg', 'branch-02.jpg', 'branch-03.jpg', 'branch-04.jpg'],
  scale: ['scale-01.jpg', 'scale-02.jpg', 'scale-03.jpg'],
  pile: ['pile-01.jpg'],
} as const;
export const SLOTS = ['branch', 'scale', 'pile'] as const;
export type Slot = (typeof SLOTS)[number];

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** An instant as the phone's local wall clock in IST, EXIF style: `YYYY:MM:DD HH:MM:SS`. */
export function exifIst(iso: string): string {
  const d = new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString(); // read as UTC fields: the IST wall clock
  return `${d.slice(0, 4)}:${d.slice(5, 7)}:${d.slice(8, 10)} ${d.slice(11, 19)}`;
}

/** Decimal degrees → EXIF rational "d/1 m/1 s/10000". */
function dms(decimal: number): string {
  const abs = Math.abs(decimal);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60 * 10_000);
  return `${d}/1 ${m}/1 ${s}/10000`;
}

export type DemoPhotoInput = {
  slot: Slot;
  /** Which of the slot's images (wraps around). */
  variant: number;
  /** Where the photo says it was taken. */
  gps: { lat: number; lng: number };
  /** When the photo says it was taken (ISO UTC); written as IST wall clock + "+05:30". */
  takenAt: string;
  /** A label unique to this photo (EXIF Model), so equal scenes still differ in bytes. */
  label: string;
};

/** One demo photo as a phone would hand it over: a JPEG with GPS, time, offset and make in its EXIF. */
export async function demoPhoto(p: DemoPhotoInput): Promise<Uint8Array<ArrayBuffer>> {
  const files = SLOT_FILES[p.slot];
  const file = files[((p.variant % files.length) + files.length) % files.length]!;
  const jpeg = await sharp(readFileSync(`${ASSETS}${file}`))
    .rotate()
    .resize({ width: 720, withoutEnlargement: true })
    .jpeg({ quality: 70 + (Math.abs(p.variant) % 9) })
    .withExif({
      IFD0: { Make: 'Udgam demo', Model: p.label, Software: 'scripts/seed (AI-generated demo photo, not evidence)' },
      IFD2: { DateTimeOriginal: exifIst(p.takenAt), OffsetTimeOriginal: '+05:30' },
      IFD3: {
        GPSLatitudeRef: p.gps.lat >= 0 ? 'N' : 'S',
        GPSLatitude: dms(p.gps.lat),
        GPSLongitudeRef: p.gps.lng >= 0 ? 'E' : 'W',
        GPSLongitude: dms(p.gps.lng),
      },
    })
    .toBuffer();
  return new Uint8Array(jpeg);
}
