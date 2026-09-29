import { describe, expect, it, vi } from 'vitest';
import { jcs, sha256Hex, sign } from '../crypto';
import { makeDevice, makePayload, type TestDevice } from '../../../tests/helpers/verify';
import { checkBoundary, type BoundaryDevice } from './boundary';
import { capturePayloadV1 } from './payload';

// TC-007 (Review focus 1) and EVAL-053 at the boundary; Review focus 2 (uploaded bytes = signed bytes).

const bytesOf = (s: string) => new TextEncoder().encode(s);
const PHOTOS = [bytesOf('photo-zero'), bytesOf('photo-one')];

async function setup(over: { revokedAt?: string | null; assigned?: boolean } = {}) {
  const device = await makeDevice('DV-7K2M9Q4D');
  const hashes = await Promise.all(PHOTOS.map((b) => sha256Hex(b)));
  const payload = await makePayload({ device, mediaHashes: hashes });
  payload.media = payload.media.map((m, i) => ({ ...m, size: PHOTOS[i]!.length }));
  const payloadString = jcs(payload);
  const signature = await sign(device.pair.privateKey, payloadString);
  const row: BoundaryDevice = {
    id: device.id,
    agentId: 'agent-1',
    publicJwk: device.publicJwk,
    revokedAt: over.revokedAt ?? null,
    lastSeq: 0,
    lastEventHash: null,
  };
  const findDevice = vi.fn(async (id: string) => (id === device.id ? row : null));
  const isPlotAssigned = vi.fn(async (agentId: string, plotId: string) => (over.assigned ?? true) && agentId === row.agentId && plotId === payload.plotId);
  const files = PHOTOS.map((b, i) => new File([b], `photo${i}.jpg`, { type: 'image/jpeg' }));
  return { device, payload, payloadString, signature, findDevice, isPlotAssigned, files, row };
}

async function resign(device: TestDevice, value: unknown) {
  const s = jcs(value);
  return { payloadString: s, signature: await sign(device.pair.privateKey, s) };
}

describe('checkBoundary (TC-007)', () => {
  it('(a) accepts the canonical string the phone signed', async () => {
    const s = await setup();
    const r = await checkBoundary({ payloadString: s.payloadString, signature: s.signature, files: s.files }, { findDevice: s.findDevice, isPlotAssigned: s.isPlotAssigned });
    expect(r).toEqual({ ok: true, payload: s.payload, payloadHash: await sha256Hex(s.payloadString), device: s.row });
  });

  it('(b) refuses the same object with reordered keys as non_canonical, before any signature work', async () => {
    const s = await setup();
    const { v, ...rest } = s.payload;
    const reordered = JSON.stringify({ ...rest, v }); // same object, different key order
    expect(JSON.parse(reordered)).toEqual(s.payload);
    const r = await checkBoundary({ payloadString: reordered, signature: s.signature, files: s.files }, { findDevice: s.findDevice, isPlotAssigned: s.isPlotAssigned });
    expect(r).toEqual({ ok: false, status: 400, reason: 'non_canonical', signedByKnownDevice: false });
    expect(s.findDevice).not.toHaveBeenCalled();
  });

  it('(b) refuses whitespace as non_canonical, even with a signature over those very bytes', async () => {
    const s = await setup();
    const spaced = JSON.stringify(JSON.parse(s.payloadString), null, 1);
    const sig = await sign(s.device.pair.privateKey, spaced);
    const r = await checkBoundary({ payloadString: spaced, signature: sig, files: s.files }, { findDevice: s.findDevice, isPlotAssigned: s.isPlotAssigned });
    expect(r).toMatchObject({ ok: false, status: 400, reason: 'non_canonical' });
  });

  it('(c) EVAL-053 cherryKg changed after signing → bad_signature, 4xx', async () => {
    const s = await setup();
    const tampered = jcs({ ...s.payload, cherryKg: 142.5 });
    const r = await checkBoundary({ payloadString: tampered, signature: s.signature, files: s.files }, { findDevice: s.findDevice, isPlotAssigned: s.isPlotAssigned });
    expect(r).toEqual({ ok: false, status: 401, reason: 'bad_signature', signedByKnownDevice: false });
  });

  it('refuses a signature from another key as bad_signature', async () => {
    const s = await setup();
    const other = await makeDevice('DV-7K2M9Q4D');
    const r = await checkBoundary(
      { payloadString: s.payloadString, signature: await sign(other.pair.privateKey, s.payloadString), files: s.files },
      { findDevice: s.findDevice, isPlotAssigned: s.isPlotAssigned },
    );
    expect(r).toMatchObject({ ok: false, reason: 'bad_signature' });
  });

  it('refuses an unknown device with 401', async () => {
    const s = await setup();
    const { payloadString, signature } = await resign(s.device, { ...s.payload, deviceId: 'DV-00000000' });
    const r = await checkBoundary({ payloadString, signature, files: s.files }, { findDevice: s.findDevice, isPlotAssigned: s.isPlotAssigned });
    expect(r).toEqual({ ok: false, status: 401, reason: 'unknown_device', signedByKnownDevice: false });
  });

  it('refuses a revoked device with 403, noting that its key did sign', async () => {
    const s = await setup({ revokedAt: '2026-10-01T00:00:00.000Z' });
    const r = await checkBoundary({ payloadString: s.payloadString, signature: s.signature, files: s.files }, { findDevice: s.findDevice, isPlotAssigned: s.isPlotAssigned });
    expect(r).toEqual({ ok: false, status: 403, reason: 'device_revoked', signedByKnownDevice: true, device: s.row });
  });

  it("refuses a plot not assigned to the phone's agent with 403 plot_not_assigned (§6.4, TP5)", async () => {
    const s = await setup({ assigned: false });
    const r = await checkBoundary({ payloadString: s.payloadString, signature: s.signature, files: s.files }, { findDevice: s.findDevice, isPlotAssigned: s.isPlotAssigned });
    expect(r).toEqual({ ok: false, status: 403, reason: 'plot_not_assigned', signedByKnownDevice: true, device: s.row });
    expect(s.isPlotAssigned).toHaveBeenCalledWith('agent-1', s.payload.plotId);
  });

  it('checks the plot assignment only after the signature and revocation (an unsigned claim learns nothing)', async () => {
    const s = await setup({ assigned: false, revokedAt: '2026-10-01T00:00:00.000Z' });
    const revoked = await checkBoundary({ payloadString: s.payloadString, signature: s.signature, files: s.files }, { findDevice: s.findDevice, isPlotAssigned: s.isPlotAssigned });
    expect(revoked).toMatchObject({ ok: false, reason: 'device_revoked' });
    const other = await makeDevice('DV-OTHER000');
    const forged = await checkBoundary(
      { payloadString: s.payloadString, signature: await sign(other.pair.privateKey, s.payloadString), files: s.files },
      { findDevice: s.findDevice, isPlotAssigned: s.isPlotAssigned },
    );
    expect(forged).toMatchObject({ ok: false, reason: 'bad_signature' });
    expect(s.isPlotAssigned).not.toHaveBeenCalled();
  });

  it('refuses uploaded bytes that differ from media[i].sha256 (Review focus 2)', async () => {
    const s = await setup();
    const swapped = [s.files[1]!, s.files[0]!]; // right bytes, wrong order
    const r = await checkBoundary({ payloadString: s.payloadString, signature: s.signature, files: swapped }, { findDevice: s.findDevice, isPlotAssigned: s.isPlotAssigned });
    expect(r).toEqual({ ok: false, status: 409, reason: 'media_hash_mismatch', signedByKnownDevice: true, device: s.row });
    const fewer = await checkBoundary(
      { payloadString: s.payloadString, signature: s.signature, files: s.files.slice(0, 1) },
      { findDevice: s.findDevice, isPlotAssigned: s.isPlotAssigned },
    );
    expect(fewer).toMatchObject({ ok: false, reason: 'media_hash_mismatch' });
    const edited = [new File([bytesOf('photo-zerO')], 'p.jpg', { type: 'image/jpeg' }), s.files[1]!];
    expect(
      await checkBoundary({ payloadString: s.payloadString, signature: s.signature, files: edited }, { findDevice: s.findDevice, isPlotAssigned: s.isPlotAssigned }),
    ).toMatchObject({ ok: false, reason: 'media_hash_mismatch' });
  });

  it('refuses an upload whose byte length differs from the signed media[i].size, even when the hash matches', async () => {
    const s = await setup();
    const wrongSize = { ...s.payload, media: s.payload.media.map((m, i) => (i === 0 ? { ...m, size: m.size + 1 } : m)) };
    const { payloadString, signature } = await resign(s.device, wrongSize);
    const r = await checkBoundary({ payloadString, signature, files: s.files }, { findDevice: s.findDevice, isPlotAssigned: s.isPlotAssigned });
    expect(r).toEqual({ ok: false, status: 409, reason: 'media_hash_mismatch', signedByKnownDevice: true, device: s.row });
  });

  it('refuses a payload that is not JSON, or fails the schema, as bad_schema', async () => {
    const s = await setup();
    const deps = { findDevice: s.findDevice, isPlotAssigned: s.isPlotAssigned };
    expect(await checkBoundary({ payloadString: '{not json', signature: s.signature, files: s.files }, deps)).toMatchObject({
      ok: false,
      status: 400,
      reason: 'bad_schema',
    });
    const v2 = await resign(s.device, { ...s.payload, v: 2 });
    expect(await checkBoundary({ ...v2, files: s.files }, deps)).toMatchObject({ ok: false, status: 400, reason: 'bad_schema' });
  });
});

describe('capturePayloadV1 schema (§5.2)', () => {
  async function base() {
    return makePayload({ device: await makeDevice('DV-7K2M9Q4D') });
  }
  const ok = (x: unknown) => capturePayloadV1.safeParse(x).success;

  it('accepts the payload the phone builds', async () => {
    expect(ok(await base())).toBe(true);
  });

  it('cherryKg must be a multiple of 0.5 in 0.5..500', async () => {
    const p = await base();
    for (const kg of [0.5, 1, 42.5, 499.5, 500]) expect(ok({ ...p, cherryKg: kg }), String(kg)).toBe(true);
    for (const kg of [0, -0.5, 0.25, 42.3, 500.5, 1e9]) expect(ok({ ...p, cherryKg: kg }), String(kg)).toBe(false);
  });

  it('carries 1..3 media', async () => {
    const p = await base();
    const m = p.media[0]!;
    expect(ok({ ...p, media: [] })).toBe(false);
    expect(ok({ ...p, media: [m] })).toBe(true);
    expect(ok({ ...p, media: [m, m, m] })).toBe(true);
    expect(ok({ ...p, media: [m, m, m, m] })).toBe(false);
  });

  it('v must be 1 and unknown keys are refused', async () => {
    const p = await base();
    expect(ok({ ...p, v: 2 })).toBe(false);
    expect(ok({ ...p, extra: true })).toBe(false);
    expect(ok({ ...p, gps: { ...p.gps, alt: 900 } })).toBe(false);
  });

  it('checks hashes, the genesis marker, the UTC timestamp and the GPS ranges', async () => {
    const p = await base();
    expect(ok({ ...p, prevEventHash: 'a'.repeat(64) })).toBe(true);
    expect(ok({ ...p, prevEventHash: 'A'.repeat(64) })).toBe(false);
    expect(ok({ ...p, prevEventHash: '' })).toBe(false);
    expect(ok({ ...p, capturedAt: '2026-10-14T09:42:33.120+05:30' })).toBe(false);
    expect(ok({ ...p, gps: { ...p.gps, lat: 91 } })).toBe(false);
    expect(ok({ ...p, gps: { ...p.gps, accuracyM: -1 } })).toBe(false);
    expect(ok({ ...p, seq: 0 })).toBe(false);
    expect(ok({ ...p, seq: 1.5 })).toBe(false);
    expect(ok({ ...p, media: [{ ...p.media[0]!, sha256: 'x' }] })).toBe(false);
  });
});
