import { z } from 'zod';

// Certificate telemetry (TSK-16.3, technical-plan §15): the public page reports that it was viewed or that
// its proof failed, and at which step. Nothing else is accepted, so the endpoint cannot carry personal
// data or become a free log sink: a closed set of events and steps, a batch id of Udgam's shape, no other
// member, and a body of at most 512 bytes. Pure.

export const TELEMETRY_MAX_BYTES = 512;

const STEPS = ['format', 'unknown-key', 'checkpoint-signature', 'payload-hash', 'entry-hash', 'merkle-path', 'payload-signature', 'short-hash', 'closure-incomplete'] as const;
/** `B-` + 8 Crockford base32 (lib/ids.ts). */
const BATCH_ID = /^B-[0-9A-HJKMNP-TV-Z]{8}$/;

const Telemetry = z.discriminatedUnion('event', [
  z.strictObject({ event: z.literal('certificate.viewed'), batchId: z.string().regex(BATCH_ID) }),
  z.strictObject({ event: z.literal('certificate.proof_failed'), batchId: z.string().regex(BATCH_ID), step: z.enum(STEPS) }),
]);

export type TelemetryEvent = z.infer<typeof Telemetry>;

/** The event in a request body, or null for anything else (too long, not JSON, unknown or extra members). */
export function parseTelemetry(body: string): TelemetryEvent | null {
  if (new TextEncoder().encode(body).length > TELEMETRY_MAX_BYTES) return null;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const r = Telemetry.safeParse(json);
  return r.success ? r.data : null;
}
