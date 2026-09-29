import { z } from 'zod';
import type { CapturePayloadV1 } from '../verification/types';

// Capture payload v1 (technical-plan §5.2): the exact object the phone signs. Strict objects: an
// unknown key is refused, so the parsed object canonicalises back to the very string that was signed.

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const roundedTo = (dp: number) => (x: number) => Math.round(x * 10 ** dp) / 10 ** dp === x;

export const capturePayloadV1 = z.strictObject({
  v: z.literal(1),
  plotId: z.string().min(1).max(64),
  deviceId: z.string().regex(/^DV-[0-9A-HJKMNP-TV-Z]{8}$/),
  seq: z.int().min(1),
  prevEventHash: z.union([z.literal('genesis'), hex64]),
  capturedAt: z.iso.datetime(), // UTC ("Z") only
  gps: z.strictObject({
    lat: z.number().min(-90).max(90).refine(roundedTo(7), 'lat is rounded to 7 dp'),
    lng: z.number().min(-180).max(180).refine(roundedTo(7), 'lng is rounded to 7 dp'),
    accuracyM: z.number().min(0).max(1_000_000).refine(roundedTo(1), 'accuracy is rounded to 1 dp'),
  }),
  cherryKg: z
    .number()
    .min(0.5)
    .max(500)
    .refine((kg) => Number.isInteger(kg * 2), 'cherryKg is a multiple of 0.5'),
  media: z
    .array(
      z.strictObject({
        sha256: hex64,
        size: z.int().positive(),
        mime: z.string().regex(/^image\/[a-z0-9.+-]+$/),
      }),
    )
    .min(1)
    .max(3),
});

// The schema and the §5.2 type must describe the same object.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const schemaMatchesType: Same<z.infer<typeof capturePayloadV1>, CapturePayloadV1> = true;
void schemaMatchesType;
