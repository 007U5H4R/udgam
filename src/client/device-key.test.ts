import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { generateDeviceKey, jwkThumbprint, sign, verify } from '../lib/crypto';
import { getPref, openUdgam, setPref, STORES } from './db';
import { clearDevice, exportPublicJwk, getDevice, getOrCreateKeyPair, saveDevice, saveEnrolment } from './device-key';

// TSK-05.4 (technical-plan §9): the phone's P-256 key lives in IndexedDB as a structured-cloned
// CryptoKey whose private half is not extractable; only the public JWK ever leaves the phone.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('the udgam IndexedDB', () => {
  it('has the keys, device, outbox and prefs stores', async () => {
    const db = await openUdgam();
    expect([...db.objectStoreNames].sort()).toEqual([...STORES].sort());
    expect(STORES).toEqual(['keys', 'device', 'outbox', 'prefs']);
    db.close();
  });

  it('adds a missing store to a database an older page created (the tracer page opens version 1 with three stores)', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('udgam', 1);
      req.onupgradeneeded = () => {
        for (const s of ['keys', 'device', 'outbox']) req.result.createObjectStore(s, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    const db = await openUdgam();
    expect(db.objectStoreNames.contains('prefs')).toBe(true);
    db.close();
    await setPref('lang', 'kn');
    expect(await getPref('lang')).toBe('kn');
  });
});

describe('the udgam IndexedDB with other tabs open (Fix 1)', () => {
  const rawOpen = (version: number, stores: string[] = []) =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('udgam', version);
      req.onupgradeneeded = () => {
        for (const s of stores) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('raw open blocked'));
    });

  it('rejects instead of hanging when an upgrade is blocked by another tab holding the old version open', async () => {
    const legacy = await rawOpen(1, ['keys', 'device', 'outbox']); // e.g. the tracer page, never closing
    await expect(openUdgam()).rejects.toThrow('udgam_db_blocked');
    legacy.close();
    const db = await openUdgam(); // once the other tab lets go, it works
    expect(db.objectStoreNames.contains('prefs')).toBe(true);
    db.close();
  });

  it('closes its own connection when another tab needs to upgrade (blocking)', async () => {
    const mine = await openUdgam();
    const other = await rawOpen(mine.version + 1);
    expect(other.version).toBe(mine.version + 1);
    other.close();
  });
});

describe('device key', () => {
  it('creates a P-256 pair once and returns the same stored key afterwards', async () => {
    const a = await getOrCreateKeyPair();
    const b = await getOrCreateKeyPair();
    expect(a.privateKey.algorithm).toMatchObject({ name: 'ECDSA', namedCurve: 'P-256' });
    expect(a.privateKey.extractable).toBe(false);
    expect(b.privateKey.extractable).toBe(false);
    expect(await exportPublicJwk(a)).toEqual(await exportPublicJwk(b));
    // the stored private key still signs, and the public key verifies it
    const sig = await sign(b.privateKey, '{"a":1}');
    expect(await verify(await exportPublicJwk(a), '{"a":1}', sig)).toBe(true);
  });

  it('the stored key object round-trips through IndexedDB as a CryptoKey, and exporting the private key rejects', async () => {
    await getOrCreateKeyPair();
    const db = await openUdgam();
    const rec = (await db.get('keys', 'device')) as { privateKey: CryptoKey; publicKey: CryptoKey };
    db.close();
    expect(rec.privateKey).toBeInstanceOf(CryptoKey);
    expect(rec.privateKey.type).toBe('private');
    expect(rec.privateKey.extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey('jwk', rec.privateKey)).rejects.toThrow();
    await expect(globalThis.crypto.subtle.exportKey('pkcs8', rec.privateKey)).rejects.toThrow();
  });

  it('exportPublicJwk gives only the public members {kty, crv, x, y}', async () => {
    const jwk = await exportPublicJwk(await getOrCreateKeyPair());
    expect(Object.keys(jwk).sort()).toEqual(['crv', 'kty', 'x', 'y']);
    expect(jwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    expect(await jwkThumbprint(jwk)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('device state', () => {
  it('saves, reads and clears the device record; clearing also drops the key so re-enrolment makes a new one', async () => {
    expect(await getDevice()).toBeNull();
    const first = await exportPublicJwk(await getOrCreateKeyPair());
    await saveDevice({ deviceId: 'DV-ABCDEFGH', nextSeq: 1, lastEventHash: 'genesis' });
    expect(await getDevice()).toEqual({ deviceId: 'DV-ABCDEFGH', nextSeq: 1, lastEventHash: 'genesis' });
    await clearDevice();
    expect(await getDevice()).toBeNull();
    expect(await exportPublicJwk(await getOrCreateKeyPair())).not.toEqual(first);
  });

  it('saveEnrolment stores a freshly enrolled pair and its device together, replacing an older phone identity', async () => {
    const old = await getOrCreateKeyPair();
    await saveDevice({ deviceId: 'DV-OLD00000', nextSeq: 7, lastEventHash: 'cd'.repeat(32) });
    const fresh = await generateDeviceKey();
    await saveEnrolment(fresh, { deviceId: 'DV-NEW00000', nextSeq: 1, lastEventHash: 'genesis' });
    expect(await getDevice()).toEqual({ deviceId: 'DV-NEW00000', nextSeq: 1, lastEventHash: 'genesis' });
    const stored = await getOrCreateKeyPair();
    expect(await exportPublicJwk(stored)).toEqual(await exportPublicJwk(fresh));
    expect(await exportPublicJwk(stored)).not.toEqual(await exportPublicJwk(old));
    expect(stored.privateKey.extractable).toBe(false);
  });

  it('stores the device record in the shape the capture page reads ({id:"current", deviceId, nextSeq, lastEventHash})', async () => {
    await saveDevice({ deviceId: 'DV-ABCDEFGH', nextSeq: 3, lastEventHash: 'ab'.repeat(32) });
    const db = await openUdgam();
    expect(await db.get('device', 'current')).toEqual({ id: 'current', deviceId: 'DV-ABCDEFGH', nextSeq: 3, lastEventHash: 'ab'.repeat(32) });
    db.close();
  });
});
