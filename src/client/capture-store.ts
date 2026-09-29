import { openUdgam } from './db';

// The phone's copy of a capture until the server has answered (technical-plan §9, TSK-10.9): IndexedDB
// `udgam` / `outbox` holds the exact signed payload string, its signature and the photo Blobs, written
// BEFORE the upload starts. It is deleted only on a verdict or on a boundary refusal that retrying
// cannot fix, so a lost network or a lost response loses nothing (TKT-11 re-sends it unchanged).

export type OutboxItem = {
  id: string;
  /** The canonical payload string exactly as signed; never re-serialised. */
  payload: string;
  signature: string;
  /** The original photo bytes, in payload order. */
  files: Blob[];
  createdAt: string;
  attempts: number;
  /** For the "saved on this phone" screens (TKT-11): what the farmer sent. */
  plotId?: string;
  cherryKg?: number;
};

export type NewOutboxItem = Omit<OutboxItem, 'id' | 'createdAt' | 'attempts'> & { id?: string };

/** Store a capture; resolves its id. */
export async function putOutbox(item: NewOutboxItem): Promise<string> {
  const id = item.id ?? globalThis.crypto.randomUUID();
  const db = await openUdgam();
  try {
    await db.put('outbox', { ...item, id, createdAt: new Date().toISOString(), attempts: 0 } satisfies OutboxItem);
    return id;
  } finally {
    db.close();
  }
}

export async function getOutbox(id: string): Promise<OutboxItem | null> {
  const db = await openUdgam();
  try {
    return ((await db.get('outbox', id)) as OutboxItem | undefined) ?? null;
  } finally {
    db.close();
  }
}

export async function deleteOutbox(id: string): Promise<void> {
  const db = await openUdgam();
  try {
    await db.delete('outbox', id);
  } finally {
    db.close();
  }
}

/** Count one more send attempt of a stored capture. */
export async function countAttempt(id: string): Promise<void> {
  const db = await openUdgam();
  try {
    const tx = db.transaction('outbox', 'readwrite');
    const item = (await tx.store.get(id)) as OutboxItem | undefined;
    if (item) await tx.store.put({ ...item, attempts: item.attempts + 1 });
    await tx.done;
  } finally {
    db.close();
  }
}

export type Signer = { deviceId: string; nextSeq: number; lastEventHash: string; privateKey: CryptoKey };

/** The enrolled device, its chain head and its (non-extractable) signing key, or null before enrolment. */
export async function loadSigner(): Promise<Signer | null> {
  const db = await openUdgam();
  try {
    const key = (await db.get('keys', 'device')) as { privateKey?: CryptoKey } | undefined;
    const device = (await db.get('device', 'current')) as { deviceId: string; nextSeq: number; lastEventHash: string } | undefined;
    if (!key?.privateKey || !device) return null;
    return { deviceId: device.deviceId, nextSeq: device.nextSeq, lastEventHash: device.lastEventHash, privateKey: key.privateKey };
  } finally {
    db.close();
  }
}

/**
 * After the server accepted payload `seq` (any verdict: the event is on record), move the chain head
 * past it — once: a re-sent payload whose answer was already applied changes nothing.
 */
export async function advanceDevice(deviceId: string, seq: number, payloadHash: string): Promise<void> {
  const db = await openUdgam();
  try {
    const tx = db.transaction('device', 'readwrite');
    const d = (await tx.store.get('current')) as { deviceId: string; nextSeq: number } | undefined;
    if (d && d.deviceId === deviceId && d.nextSeq === seq) await tx.store.put({ ...d, id: 'current', nextSeq: seq + 1, lastEventHash: payloadHash });
    await tx.done;
  } finally {
    db.close();
  }
}
