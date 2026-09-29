import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { makeDevice } from '../../tests/helpers/verify';
import { capturePayloadV1 } from '../lib/capture/payload';
import { jcs, verify } from '../lib/crypto';
import { signCapture } from './sign';

// The photo hashes and MIME types come from hashFile when each photo is accepted (TKT-10), so the MIME a
// phone signs is the sniffed one the server checks. buildAndSign, which signed `File.type` instead, was
// removed (TASK-20 fix round 2, N4).
describe('signCapture (§5.2, §9)', () => {
  it('rounds GPS, keeps the photo hashes as given, and signs the canonical string', async () => {
    const d = await makeDevice('DV-7K2M9Q4D');
    const sha256 = createHash('sha256').update('exact photo bytes').digest('hex');
    const out = await signCapture(
      {
        plotId: 'PL-P01',
        deviceId: d.id,
        seq: 3,
        prevEventHash: 'a'.repeat(64),
        gps: { lat: 12.421098765, lng: 75.739212345, accuracyM: 8.27 },
        cherryKg: 42.5,
        media: [{ sha256, size: 17, mime: 'image/heic' }],
      },
      d.pair.privateKey,
      () => new Date('2026-10-14T04:12:33.120Z'),
    );
    expect(out.payload).toEqual({
      v: 1,
      plotId: 'PL-P01',
      deviceId: d.id,
      seq: 3,
      prevEventHash: 'a'.repeat(64),
      capturedAt: '2026-10-14T04:12:33.120Z',
      gps: { lat: 12.4210988, lng: 75.7392123, accuracyM: 8.3 },
      cherryKg: 42.5,
      media: [{ sha256, size: 17, mime: 'image/heic' }],
    });
    expect(out.payloadString).toBe(jcs(out.payload));
    expect(capturePayloadV1.safeParse(JSON.parse(out.payloadString)).success).toBe(true);
    expect(await verify(d.publicJwk, out.payloadString, out.signature)).toBe(true);
  });

  it('the module signs only pre-hashed drafts: nothing signs a photo by its File.type (N4)', async () => {
    const mod: Record<string, unknown> = await import('./sign');
    expect(Object.keys(mod).sort()).toEqual(['signCapture']);
  });
});
