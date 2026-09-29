import { generateDeviceKey, publicMembers, type PublicJwk } from '../lib/crypto';
import { openUdgam } from './db';

// The phone's device key and chain state (technical-plan §9, TSK-05.4). Browser only. The P-256 key
// pair is generated with a NON-extractable private key and stored in IndexedDB as a structured-cloned
// CryptoKey: it is never exported, posted or logged. Only the public JWK leaves the phone.

type KeyRecord = { id: 'device'; privateKey: CryptoKey; publicKey: CryptoKey };
export type DeviceState = { deviceId: string; nextSeq: number; lastEventHash: string };

/** The stored device key pair, created (non-extractable) on first use. */
export async function getOrCreateKeyPair(): Promise<CryptoKeyPair> {
  const db = await openUdgam();
  try {
    const existing = (await db.get('keys', 'device')) as KeyRecord | undefined;
    if (existing) return { privateKey: existing.privateKey, publicKey: existing.publicKey };
    const pair = await generateDeviceKey();
    // Another tab may have stored one meanwhile: keep the first.
    const tx = db.transaction('keys', 'readwrite');
    const raced = (await tx.store.get('device')) as KeyRecord | undefined;
    if (!raced) await tx.store.put({ id: 'device', privateKey: pair.privateKey, publicKey: pair.publicKey } satisfies KeyRecord);
    await tx.done;
    return raced ? { privateKey: raced.privateKey, publicKey: raced.publicKey } : pair;
  } finally {
    db.close();
  }
}

/** The public half as a JWK with only {kty, crv, x, y}: what enrolment sends to the server. */
export async function exportPublicJwk(pair: CryptoKeyPair): Promise<PublicJwk> {
  return publicMembers(await globalThis.crypto.subtle.exportKey('jwk', pair.publicKey));
}

/** Remember the enrolled device and its chain head (next seq, last accepted payload hash or 'genesis'). */
export async function saveDevice(state: DeviceState): Promise<void> {
  const db = await openUdgam();
  try {
    await db.put('device', { id: 'current', deviceId: state.deviceId, nextSeq: state.nextSeq, lastEventHash: state.lastEventHash });
  } finally {
    db.close();
  }
}

/** The enrolled device, or null before enrolment. */
export async function getDevice(): Promise<DeviceState | null> {
  const db = await openUdgam();
  try {
    const rec = (await db.get('device', 'current')) as (DeviceState & { id: string }) | undefined;
    return rec ? { deviceId: rec.deviceId, nextSeq: rec.nextSeq, lastEventHash: rec.lastEventHash } : null;
  } finally {
    db.close();
  }
}

/** Forget the device and its key, so the next enrolment makes a fresh key (a revoked key stays unusable). */
export async function clearDevice(): Promise<void> {
  const db = await openUdgam();
  try {
    const tx = db.transaction(['device', 'keys'], 'readwrite');
    await Promise.all([tx.objectStore('device').delete('current'), tx.objectStore('keys').delete('device'), tx.done]);
  } finally {
    db.close();
  }
}
