import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { P01_INSIDE, seedTracerWorld, type TracerWorld } from '../../scripts/tracer-world';
import { runCapture, type CaptureEvent } from '../../src/lib/capture/pipeline';
import { jcs, sha256Hex, sign } from '../../src/lib/crypto';
import { localMediaStore } from '../../src/lib/media/store';
import type { CapturePayloadV1 } from '../../src/lib/verification/types';
import { tempDb, type TempDb } from '../helpers/db';
import { makeDevice, type TestDevice } from '../helpers/verify';

// TC-043 (S1, review focus 2): the uploaded bytes are the signed bytes. Each file's SHA-256 must equal
// media[i].sha256 in the signed payload, in order; a swap or a reorder is a 4xx media_hash_mismatch,
// anchored as a rejected event. An accepted photo is stored byte for byte (thumbnails are other files).
// Real JPEG bytes (the AI-generated demo photos, TP29) with a random trailer, so every run is unique.

let t: TempDb;
let dev: TestDevice;
let world: TracerWorld;

beforeEach(async () => {
  t = await tempDb();
  dev = await makeDevice();
  world = await seedTracerWorld(t.db, { publicJwk: dev.publicJwk });
});
afterEach(async () => {
  await t.cleanup();
});

const jpeg = (file: string) => new Uint8Array(Buffer.concat([readFileSync(`assets/demo-photos/${file}`), randomBytes(16)]));

async function signed(photos: Uint8Array[]) {
  const payload: CapturePayloadV1 = {
    v: 1,
    plotId: world.plotId,
    deviceId: world.deviceId,
    seq: 1,
    prevEventHash: 'genesis',
    capturedAt: new Date().toISOString(),
    gps: { ...P01_INSIDE, accuracyM: 8 },
    cherryKg: 42.5,
    media: await Promise.all(photos.map(async (b) => ({ sha256: await sha256Hex(b), size: b.length, mime: 'image/jpeg' }))),
  };
  const payloadString = jcs(payload);
  return { payload, payloadString, signature: await sign(dev.pair.privateKey, payloadString) };
}

async function send(payloadString: string, signature: string, uploads: Uint8Array[]): Promise<CaptureEvent[]> {
  const fd = new FormData();
  fd.set('payload', payloadString);
  fd.set('signature', signature);
  uploads.forEach((b, i) => fd.set(`photo${i}`, new File([new Uint8Array(b)], `p${i}.jpg`, { type: 'image/jpeg' })));
  const events: CaptureEvent[] = [];
  await runCapture(fd, { db: t.db, media: localMediaStore(t.dir), agentId: world.agentId }, (e) => events.push(e));
  return events;
}

const rejectedRows = async () =>
  (await t.client.execute(`SELECT boundary_reason, anchor_seq FROM harvest_events WHERE boundary_status = 'rejected'`)).rows as unknown as {
    boundary_reason: string;
    anchor_seq: number;
  }[];

describe('TC-043 uploaded bytes are the signed bytes', () => {
  it('one file swapped for different bytes of the same size → 409 media_hash_mismatch, anchored as a rejected event', async () => {
    const a = jpeg('branch-01.jpg');
    const b = jpeg('scale-01.jpg');
    const { payloadString, signature } = await signed([a, b]);
    const swapped = new Uint8Array(b);
    swapped[swapped.length - 1] = swapped[swapped.length - 1]! ^ 0xff; // same size, one byte different
    const events = await send(payloadString, signature, [a, swapped]);
    expect(events.at(-1)).toMatchObject({ t: 'rejected', reason: 'media_hash_mismatch', status: 409 });
    const rows = await rejectedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.boundary_reason).toBe('media_hash_mismatch');
    const [entry] = (await t.client.execute({ sql: 'SELECT kind FROM ledger_entries WHERE seq = ?', args: [rows[0]!.anchor_seq] })).rows;
    expect(entry!.kind).toBe('harvest_event');
    expect(Number((await t.client.execute('SELECT COUNT(*) AS n FROM verification_runs')).rows[0]!.n)).toBe(0);
  });

  it('the right files in the wrong order → media_hash_mismatch', async () => {
    const a = jpeg('branch-01.jpg');
    const b = jpeg('scale-01.jpg');
    const { payloadString, signature } = await signed([a, b]);
    const events = await send(payloadString, signature, [b, a]);
    expect(events.at(-1)).toMatchObject({ t: 'rejected', reason: 'media_hash_mismatch' });
  });

  it("an accepted capture's stored originals hash to the payload's media[i].sha256, byte for byte", async () => {
    const a = jpeg('branch-02.jpg');
    const b = jpeg('pile-01.jpg');
    const { payload, payloadString, signature } = await signed([a, b]);
    const events = await send(payloadString, signature, [a, b]);
    expect(events.at(-1)).toMatchObject({ t: 'verdict' });
    const rows = (await t.client.execute('SELECT path, sha256 FROM media ORDER BY rowid')).rows as unknown as { path: string; sha256: string }[];
    expect(rows.map((r) => r.sha256)).toEqual(payload.media.map((m) => m.sha256));
    for (const [i, r] of rows.entries()) {
      const stored = readFileSync(join(t.dir, r.path));
      expect(createHash('sha256').update(stored).digest('hex')).toBe(payload.media[i]!.sha256);
      expect(Buffer.from(stored).equals(Buffer.from(i === 0 ? a : b))).toBe(true);
    }
  });
});
