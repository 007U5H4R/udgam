import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { deleteOutbox, getOutbox, loadSigner, putOutbox } from './capture-store';
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
