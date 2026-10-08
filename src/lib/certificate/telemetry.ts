import { z } from 'zod';

// Certificate telemetry (TSK-16.3, technical-plan §15): the public page reports that it was viewed or that
// its proof failed, and at which step. Nothing else is accepted, so the endpoint cannot carry personal
// data or become a free log sink: a closed set of events and steps, a batch id of Udgam's shape, no other
// member, and a body of at most 512 bytes. Pure.

export const TELEMETRY_MAX_BYTES = 512;
/** Beacons per client address (an IPv6 /64, lib/client-ip.ts) per window (TASK-17 fix round 1). */
export const TELEMETRY_IP_LIMIT = { limit: 30, windowSec: 10 * 60 } as const;
export const telemetryIpKey = (ip: string) => `telemetry:ip:${ip}`;
/**
 * Proof-failure beacons per client address per window, in a bucket of their own (TASK-17 r2 N2): views
 * from a shared address (an office, carrier-grade NAT) must not use up the §15 failure signal. The page
 * sends failures to `/api/telemetry?e=proof_failed`.
 */
export const TELEMETRY_FAILED_IP_LIMIT = { limit: 30, windowSec: 10 * 60 } as const;
export const telemetryFailedIpKey = (ip: string) => `telemetry:failed:ip:${ip}`;
/** The query that routes a beacon to the failure bucket. */
export const TELEMETRY_FAILED_QUERY = 'proof_failed';
/** A beacon body arrives at once; one that trickles is dropped well before the server's request timeout. */
export const TELEMETRY_READ_DEADLINE_MS = 5_000;

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
