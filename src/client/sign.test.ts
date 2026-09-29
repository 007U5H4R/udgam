import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { makeDevice } from '../../tests/helpers/verify';
import { capturePayloadV1 } from '../lib/capture/payload';
import { jcs, verify } from '../lib/crypto';
import { buildAndSign } from './sign';

describe('buildAndSign (§5.2, §9)', () => {
  it('hashes the exact File bytes, rounds GPS, and signs the canonical string', async () => {
    const d = await makeDevice('DV-7K2M9Q4D');
    const bytes = new TextEncoder().encode('exact photo bytes');
    const file = new File([bytes], 'p.jpg', { type: 'image/jpeg' });
    const out = await buildAndSign(
      {
        plotId: 'PL-P01',
        deviceId: d.id,
        seq: 3,
        prevEventHash: 'a'.repeat(64),
        gps: { lat: 12.421098765, lng: 75.739212345, accuracyM: 8.27 },
        cherryKg: 42.5,
        files: [file],
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
      media: [{ sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, mime: 'image/jpeg' }],
    });
    expect(out.payloadString).toBe(jcs(out.payload));
    expect(capturePayloadV1.safeParse(JSON.parse(out.payloadString)).success).toBe(true);
    expect(await verify(d.publicJwk, out.payloadString, out.signature)).toBe(true);
  });

  it('defaults a missing file type to image/jpeg', async () => {
    const d = await makeDevice('DV-7K2M9Q4D');
    const out = await buildAndSign(
      { plotId: 'PL-P01', deviceId: d.id, seq: 1, prevEventHash: 'genesis', gps: { lat: 12, lng: 75, accuracyM: 5 }, cherryKg: 1, files: [new File(['x'], 'x')] },
      d.pair.privateKey,
    );
    expect(out.payload.media[0]?.mime).toBe('image/jpeg');
  });
});
