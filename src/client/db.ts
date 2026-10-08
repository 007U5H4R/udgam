import { openDB, type IDBPDatabase } from 'idb';

// The phone's IndexedDB `udgam` (technical-plan §9). Browser only. Every store is keyed by `id`:
//   keys   — { id: 'device', privateKey, publicKey }: the device CryptoKeyPair, private half non-extractable
//   device — { id: 'current', deviceId, nextSeq, lastEventHash }
//   outbox — pending captures (TKT-10/11)
//   prefs  — { id: <name>, value } (the first-run language choice, TC-025)

export const DB_NAME = 'udgam';
export const STORES = ['keys', 'device', 'outbox', 'prefs'] as const;
export type StoreName = (typeof STORES)[number];

const VERSION = 1;

function createMissing(db: IDBPDatabase): void {
  for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
}

/** Raised when another tab holds an older version open and will not let an upgrade through. */
export class UdgamDbBlockedError extends Error {
  constructor() {
    super('udgam_db_blocked');
    this.name = 'UdgamDbBlockedError';
  }
}

/**
 * Open at `version` (the current one when undefined). Our connection closes itself when another tab
 * needs to upgrade (`blocking`), and an upgrade that another tab blocks rejects at once instead of
 * leaving the promise pending for ever (the connection is closed if it opens later).
 */
function open(version?: number): Promise<IDBPDatabase> {
  return new Promise((resolve, reject) => {
    let blocked = false;
    let db: IDBPDatabase | undefined;
    openDB(DB_NAME, version, {
      upgrade: createMissing,
      blocked() {
        blocked = true;
        reject(new UdgamDbBlockedError());
      },
      blocking() {
        db?.close();
      },
    }).then(
      (opened) => {
        db = opened;
        if (blocked) opened.close();
        else resolve(opened);
      },
      reject,
    );
  });
}

/**
 * Open the database with every store present. A database created earlier with fewer stores (the TKT-02
 * tracer page opens version 1 with three) is upgraded once to the next version to add the missing ones.
 * Rejects with UdgamDbBlockedError when another open tab blocks that upgrade.
 */
export async function openUdgam(): Promise<IDBPDatabase> {
  const db = await open(VERSION).catch(async (err: unknown) => {
    // Already at a later version: open whatever version is there.
    if (err instanceof DOMException && err.name === 'VersionError') return open();
    throw err;
  });
  if (STORES.every((s) => db.objectStoreNames.contains(s))) return db;
  const next = db.version + 1;
  db.close();
  return open(next);
}

/** A stored preference, or null. */
export async function getPref(name: string): Promise<string | null> {
  const db = await openUdgam();
  try {
    const rec = (await db.get('prefs', name)) as { value?: unknown } | undefined;
    return typeof rec?.value === 'string' ? rec.value : null;
  } finally {
    db.close();
  }
}

export async function setPref(name: string, value: string): Promise<void> {
  const db = await openUdgam();
  try {
    await db.put('prefs', { id: name, value });
  } finally {
    db.close();
  }
}
