import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { SeededCapture } from './seed-capture';
import { signIn } from './auth';
import { mockGeolocation } from './stubs';
import { E2E_DATA_DIR } from './tracer';

// Helpers for the capture-app specs (TKT-10): a fresh capture world per test (e2e/helpers/seed-capture.ts),
// the seeded phone key put into the browser's IndexedDB, and unique photo bytes from the AI-generated
// demo photos (assets/demo-photos, TP29 — never presented as real evidence).

export type { SeededCapture };

export function seedCaptureWorld(o: { plots?: string[]; events?: string[]; photo?: string; refusal?: string; phone?: string } = {}): SeededCapture {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', DATA_DIR: E2E_DATA_DIR, LOG_LEVEL: 'silent' };
  delete env.DATABASE_URL;
  const args = ['e2e/helpers/seed-capture.ts'];
  if (o.plots) args.push('--plots', o.plots.join(','));
  if (o.events) args.push('--events', o.events.join(','));
  if (o.photo) args.push('--photo', o.photo);
  if (o.refusal) args.push('--refusal', o.refusal);
  if (o.phone) args.push('--phone', o.phone);
  const out = execFileSync('./node_modules/.bin/tsx', args, { env, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
  return JSON.parse(out.trim().split('\n').at(-1)!) as SeededCapture;
}

/** The demo photo with a random trailer after its end-of-image marker: a valid JPEG with unique bytes. */
export function demoPhoto(file = 'branch-01.jpg'): Buffer {
  return Buffer.concat([readFileSync(`assets/demo-photos/${file}`), randomBytes(16)]);
}

/**
 * Choose a photo on a capture slot's file input once the page has hydrated (QA-P5-7): RecordFlow marks
 * each input `data-hydrated="true"` from a client effect; a file set before that is lost.
 */
export async function choosePhoto(input: Locator, files: Parameters<Locator['setInputFiles']>[0]): Promise<void> {
  await expect(input).toHaveAttribute('data-hydrated', 'true');
  await input.setInputFiles(files);
}

/** Put the seeded phone (key imported non-extractable, chain head) into this origin's IndexedDB `udgam`. */
export async function injectDevice(page: Page, seed: SeededCapture): Promise<void> {
  await page.evaluate(
    async ({ jwk, deviceId, nextSeq, lastEventHash }) => {
      const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('udgam');
        req.onupgradeneeded = () => {
          for (const s of ['keys', 'device', 'outbox', 'prefs']) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['keys', 'device'], 'readwrite');
        tx.objectStore('keys').put({ id: 'device', privateKey });
        tx.objectStore('device').put({ id: 'current', deviceId, nextSeq, lastEventHash });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { jwk: seed.testOnlyPrivateJwk, deviceId: seed.deviceId, nextSeq: seed.nextSeq, lastEventHash: seed.lastEventHash },
  );
}

/** Sign in as the seeded agent at a GPS fix, open /field, put the phone key in place and reload. */
export async function openField(
  page: Page,
  context: BrowserContext,
  seed: SeededCapture,
  fix: { lat: number; lng: number; accuracy: number } = { ...seed.plots[0]!.inside, accuracy: 8 },
): Promise<void> {
  await mockGeolocation(context, fix);
  await signIn(page, seed.agentEmail, seed.testOnlyAgentPassword);
  await expect(page).toHaveURL(/\/field$/);
  await injectDevice(page, seed);
  await page.reload();
}

/** No horizontal page scroll: the document is no wider than the viewport (not innerWidth, which emulated phones widen). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
}
