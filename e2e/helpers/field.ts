import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { expect, type Page } from '@playwright/test';
import { demoPhoto, type SeededCapture } from './capture';
import { E2E_DATA_DIR } from './tracer';

// Helpers for the TKT-11 field specs (field-retry, field-pickings, field-nav, field-language): the
// phone's outbox as the page's IndexedDB holds it, a three-photo picking typed up to the Send pill, and
// reads of the e2e database. Photos are the AI-generated demo photos (TP29): never evidence.

export type OutboxView = { id: string; payload: string; signature: string; sizes: number[]; attempts: number; plotId?: string; cherryKg?: number };

/** Every saved picking in the phone's outbox (IndexedDB `udgam` / `outbox`), oldest first. */
export function readOutbox(page: Page): Promise<OutboxView[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const q = indexedDB.open('udgam');
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    try {
      if (!db.objectStoreNames.contains('outbox')) return [];
      const all = await new Promise<
        { id: string; payload: string; signature: string; files: Blob[]; attempts: number; order?: number; plotId?: string; cherryKg?: number }[]
      >((res) => {
        const r = db.transaction('outbox').objectStore('outbox').getAll();
        r.onsuccess = () => res(r.result);
      });
      return all
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((i) => ({ id: i.id, payload: i.payload, signature: i.signature, sizes: i.files.map((f) => f.size), attempts: i.attempts, plotId: i.plotId, cherryKg: i.cherryKg }));
    } finally {
      db.close();
    }
  });
}

const SLOTS = ['The branch', 'Basket on the scale', "The day's pile"] as const;

/** Open the record flow, take `photos` photos (1–3), type the kg and stop at the Send pill. */
export async function typePicking(page: Page, seed: SeededCapture, o: { photos?: 1 | 2 | 3; kg?: string } = {}): Promise<void> {
  const photos = o.photos ?? 3;
  await page.goto(`/field/record?plot=${seed.plots[0]!.id}`);
  for (const [i, slot] of SLOTS.slice(0, photos).entries()) {
    await page.getByLabel(slot).setInputFiles({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: demoPhoto() });
    await page.getByRole('button', { name: 'Use this photo' }).click();
    if (i < photos - 1) await expect(page.getByRole('button', { name: 'Open camera' })).toBeVisible();
  }
  if (photos < 3) await page.getByRole('button', { name: photos === 1 ? 'Continue with 1 photo' : `Continue with ${photos} photos` }).click();
  for (const k of (o.kg ?? '42.5').split('')) await page.locator(`#keypad [data-k="${k}"]`).click();
  await expect(page.locator('#send-btn')).toBeEnabled();
}

/** SHA-256 hex of a payload string (the server's payload_hash). */
export const payloadHash = (payload: string): string => createHash('sha256').update(payload).digest('hex');

/** Run one read-only query against the e2e database. */
export async function dbRows<T = Record<string, unknown>>(sql: string, args: (string | number)[] = []): Promise<T[]> {
  const db = createClient({ url: `file:${join(E2E_DATA_DIR, 'udgam.db')}` });
  try {
    return (await db.execute({ sql, args })).rows as unknown as T[];
  } finally {
    db.close();
  }
}

/** The NDJSON lines of a /api/capture answer. */
export const ndLines = (body: string): Record<string, unknown>[] =>
  body
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Record<string, unknown>);
