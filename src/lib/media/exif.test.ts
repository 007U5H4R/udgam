import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exifTimeToIso, extractExif } from './exif';
import { sniffImage } from './sniff';

// TC-035 (technical-plan §22 TSK-08.1; review focus 7, 8; TP25). Expected values are literals from the
// fixture README, never recomputed. `pnpm test:tz` re-runs it under America/Los_Angeles and Asia/Kolkata:
// the results must match.

const fixture = (name: string) => new Uint8Array(readFileSync(`evals/fixtures/photos/${name}`));

describe('extractExif (TC-035)', () => {
  it('gps-time-offset.jpg: 10:15:00 at +05:30 is 04:45:00Z; GPS in decimal degrees to 6 dp', async () => {
    const f = await extractExif(fixture('gps-time-offset.jpg'));
    expect(f.takenAt).toBe('2026-09-20T04:45:00.000Z');
    expect(f.hadOffset).toBe(true);
    expect(f.gps).not.toBeNull();
    expect(f.gps!.lat).toBeCloseTo(12.4211, 6);
    expect(f.gps!.lng).toBeCloseTo(75.7392, 6);
    expect(f.make).toBe('Udgam fixture');
    expect(f.model).toBe('gps-time-offset');
  });

  it('time-no-offset.jpg: a zone-less time is read as IST, giving the same instant (TP25)', async () => {
    const f = await extractExif(fixture('time-no-offset.jpg'));
    expect(f).toMatchObject({ takenAt: '2026-09-20T04:45:00.000Z', hadOffset: false, gps: null });
  });

  it('no-exif.jpg: no facts, no throw', async () => {
    expect(await extractExif(fixture('no-exif.jpg'))).toEqual({ gps: null, takenAt: null, hadOffset: false });
  });

  it('sample.heic: sniffed as HEIC by magic bytes; its (absent) EXIF parses without throwing', async () => {
    const bytes = fixture('sample.heic');
    expect(sniffImage(bytes)).toBe('image/heic');
    expect(await extractExif(bytes)).toMatchObject({ gps: null, takenAt: null, hadOffset: false });
  });

  it('never throws: garbage, empty and truncated input give all-null facts', async () => {
    const none = { gps: null, takenAt: null, hadOffset: false };
    expect(await extractExif(new Uint8Array())).toEqual(none);
    expect(await extractExif(new TextEncoder().encode('jpeg-bytes:a'))).toEqual(none);
    expect(await extractExif(fixture('gps-time-offset.jpg').subarray(0, 40))).toEqual(none);
  });
});

describe('exifTimeToIso (TP25)', () => {
  it('applies the offset exactly when one is given', () => {
    expect(exifTimeToIso('2026:09:20 10:15:00', '+05:30')).toBe('2026-09-20T04:45:00.000Z');
    expect(exifTimeToIso('2026:09:20 10:15:00', '+02:00')).toBe('2026-09-20T08:15:00.000Z');
    expect(exifTimeToIso('2026:09:20 22:15:00', '-04:00')).toBe('2026-09-21T02:15:00.000Z');
    expect(exifTimeToIso('2026:09:20 10:15:00', 'Z')).toBe('2026-09-20T10:15:00.000Z');
  });

  it('reads a zone-less time as +05:30, across a date line in UTC', () => {
    expect(exifTimeToIso('2026:09:20 10:15:00')).toBe('2026-09-20T04:45:00.000Z');
    expect(exifTimeToIso('2026:01:01 03:00:00', null)).toBe('2025-12-31T21:30:00.000Z');
  });

  it('falls back to IST when the offset is malformed', () => {
    expect(exifTimeToIso('2026:09:20 10:15:00', '5:30')).toBe('2026-09-20T04:45:00.000Z');
  });

  it('rejects impossible or placeholder times', () => {
    expect(exifTimeToIso('0000:00:00 00:00:00')).toBeNull();
    expect(exifTimeToIso('2026:13:01 10:00:00')).toBeNull();
    expect(exifTimeToIso('2026:02:30 10:00:00')).toBeNull();
    expect(exifTimeToIso('2026:09:20 24:00:00')).toBeNull();
    expect(exifTimeToIso('    :  :     :  :  ')).toBeNull();
    expect(exifTimeToIso('2026-09-20T10:15:00')).toBeNull();
  });
});

describe('camera make and model are bounded, printable text (TKT-19)', () => {
  const jpegWith = async (make: string, model: string) => {
    const sharp = (await import('sharp')).default;
    const buf = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .jpeg()
      .withExif({ IFD0: { Make: make, Model: model } })
      .toBuffer();
    return new Uint8Array(buf);
  };

  it('strips control characters and caps each at 64 characters', async () => {
    const f = await extractExif(await jpegWith(`Evil\u0007Cam\u001b[31m${'X'.repeat(200)}`, 'Pixel\u00019\tPro'));
    expect(f.make).toBe(`EvilCam[31m${'X'.repeat(64 - 'EvilCam[31m'.length)}`);
    expect(f.make).toHaveLength(64);
    expect(f.model).toBe('Pixel9Pro');
  });

  it('a make or model that is only control characters or spaces is left out', async () => {
    const f = await extractExif(await jpegWith('\u0001\u0002', '   '));
    expect(f).not.toHaveProperty('make');
    expect(f).not.toHaveProperty('model');
  });
});
