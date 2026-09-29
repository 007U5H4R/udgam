import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { bumpAttempt, deleteOutbox, getOutbox, listOutbox, loadSigner, putOutbox } from './capture-store';
import { DB_NAME, openUdgam } from './db';
import { saveEnrolment } from './device-key';

// TSK-10.9: the signed payload, its signature and the photo blobs are written to IndexedDB `udgam` /
// `outbox` BEFORE the upload starts, and stay there until a verdict or a boundary refusal (§9).

describe('outbox', () => {
  it('put → get returns the same payload string, signature and blobs; delete removes it', async () => {
    const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 7, 8, 9])], { type: 'image/jpeg' });
    const id = await putOutbox({ payload: '{"v":1}', signature: 'sig', files: [photo], plotId: 'PL-1', cherryKg: 42.5 });
    expect(id).toMatch(/.+/);
    const got = await getOutbox(id);
    expect(got).toMatchObject({ id, payload: '{"v":1}', signature: 'sig', plotId: 'PL-1', cherryKg: 42.5, attempts: 0 });
    expect(got!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(got!.files).toHaveLength(1);
    expect(new Uint8Array(await got!.files[0]!.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 7, 8, 9]));
    await deleteOutbox(id);
    expect(await getOutbox(id)).toBeNull();
  });

  it('two captures get two records', async () => {
    const a = await putOutbox({ payload: 'a', signature: 's', files: [] });
    const b = await putOutbox({ payload: 'b', signature: 's', files: [] });
    expect(a).not.toBe(b);
    expect((await getOutbox(a))!.payload).toBe('a');
    expect((await getOutbox(b))!.payload).toBe('b');
  });
});

// TSK-11.1: the outbox is listed oldest first, survives a reload (a new connection), counts attempts
// and gives back the photo bytes unchanged.
describe('outbox list (TSK-11.1)', () => {
  beforeEach(async () => {
    const db = await openUdgam();
    try {
      await db.clear('outbox');
    } finally {
      db.close();
    }
  });

  const payload = (seq: number, kg: number) => `{"cherryKg":${kg},"plotId":"PL-${seq}","seq":${seq},"v":1}`;

  it('three puts list in creation order, with plot, kg and photo count; a new connection (a reload) still lists them', async () => {
    const jpeg = (n: number) => new Blob([new Uint8Array([0xff, 0xd8, 0xff, n])], { type: 'image/jpeg' });
    const a = await putOutbox({ payload: payload(1, 42.5), signature: 's1', files: [jpeg(1), jpeg(2), jpeg(3)], plotId: 'PL-1', cherryKg: 42.5 });
    const b = await putOutbox({ payload: payload(2, 38), signature: 's2', files: [jpeg(4)], plotId: 'PL-2', cherryKg: 38 });
    const c = await putOutbox({ payload: payload(3, 51), signature: 's3', files: [jpeg(5), jpeg(6)], plotId: 'PL-3', cherryKg: 51 });

    const listed = await listOutbox();
    expect(listed.map((i) => i.id)).toEqual([a, b, c]);
    expect(listed.map((i) => [i.plotId, i.cherryKg, i.photoCount, i.attempts])).toEqual([
      ['PL-1', 42.5, 3, 0],
      ['PL-2', 38, 1, 0],
      ['PL-3', 51, 2, 0],
    ]);

    // A reload: a fresh connection to the same database, opened without the app's helpers.
    const raw = await openDB(DB_NAME);
    try {
      expect((await raw.getAll('outbox')).length).toBe(3);
    } finally {
      raw.close();
    }
    expect((await listOutbox()).map((i) => i.id)).toEqual([a, b, c]);
  });

  it('keeps creation order when the phone clock goes back between two pickings', async () => {
    const a = await putOutbox({ payload: payload(1, 10), signature: 's', files: [] });
    const db = await openUdgam();
    try {
      const item = await db.get('outbox', a);
      await db.put('outbox', { ...item, createdAt: '2099-01-01T00:00:00.000Z' });
    } finally {
      db.close();
    }
    const b = await putOutbox({ payload: payload(2, 20), signature: 's', files: [] });
    expect((await listOutbox()).map((i) => i.id)).toEqual([a, b]);
  });

  it('an item stored before TKT-11 (no plot, kg or order) is read from its signed payload', async () => {
    const db = await openUdgam();
    try {
      await db.put('outbox', { id: 'OLD', payload: payload(7, 44), signature: 's', files: [new Blob([new Uint8Array([1])])], createdAt: '2026-09-01T00:00:00.000Z', attempts: 2 });
    } finally {
      db.close();
    }
    const [old] = await listOutbox();
    expect(old).toMatchObject({ id: 'OLD', plotId: 'PL-7', cherryKg: 44, photoCount: 1, attempts: 2 });
  });

  it('bumpAttempt increments the count; an unknown id changes nothing', async () => {
    const id = await putOutbox({ payload: payload(1, 10), signature: 's', files: [] });
    await bumpAttempt(id);
    await bumpAttempt(id);
    expect((await getOutbox(id))!.attempts).toBe(2);
    await bumpAttempt('missing');
    expect(await listOutbox()).toHaveLength(1);
  });

  it('photo blobs come back byte-identical after a reload', async () => {
    const bytes = new Uint8Array(4096).map((_, i) => (i * 31 + 7) % 256);
    const id = await putOutbox({ payload: payload(1, 10), signature: 's', files: [new Blob([bytes], { type: 'image/jpeg' })] });
    const [item] = await listOutbox();
    expect(item!.id).toBe(id);
    expect(new Uint8Array(await item!.files[0]!.arrayBuffer())).toEqual(bytes);
  });
});

describe('loadSigner', () => {
  it('is null before enrolment, then the device, its chain head and the private key', async () => {
    expect(await loadSigner()).toBeNull();
    const pair = (await globalThis.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])) as CryptoKeyPair;
    await saveEnrolment(pair, { deviceId: 'DV-ABCDEFGH', nextSeq: 4, lastEventHash: 'f'.repeat(64) });
    const s = await loadSigner();
    expect(s).toMatchObject({ deviceId: 'DV-ABCDEFGH', nextSeq: 4, lastEventHash: 'f'.repeat(64) });
    expect(s!.privateKey.type).toBe('private');
  });
});
