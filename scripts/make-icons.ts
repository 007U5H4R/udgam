// Renders the capture app's install icons (TSK-10.12) from the brand object, public/brand/cherry.svg
// (a copy of .design/exploration/final/cherry.svg), on the ground colour #0A0E0C:
//   public/icons/icon-192.png, icon-512.png  — the cherry cluster at 84 % of the square
//   public/icons/maskable-512.png            — at 60 %, inside the maskable safe zone (the inner 80 % circle)
// Run once and commit the output: `pnpm exec tsx scripts/make-icons.ts`.
import { mkdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const BG = '#0A0E0C';
const svg = readFileSync('public/brand/cherry.svg');

async function icon(size: number, scale: number, out: string): Promise<void> {
  const inner = Math.round(size * scale);
  const cherry = await sharp(svg, { density: 384 }).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: cherry, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(`wrote ${out}`);
}

mkdirSync('public/icons', { recursive: true });
await icon(192, 0.84, 'public/icons/icon-192.png');
await icon(512, 0.84, 'public/icons/icon-512.png');
await icon(512, 0.6, 'public/icons/maskable-512.png');
