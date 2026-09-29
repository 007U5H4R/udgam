import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { P01_INSIDE } from '../scripts/tracer-plot';
import { signIn } from './helpers/auth';
import { mockGeolocation } from './helpers/stubs';
import { query, seedTracer, type TracerKey } from './helpers/tracer';

// TC-013 / EVAL-001, EVAL-002: a seeded phone signs a picking on the minimal capture page and sees
// Verified with evidence; the database then holds the event, its media, its run and two ledger entries.

const FIXTURE = readFileSync('evals/fixtures/photos/p01-exif-ok.jpg');

/** The fixture's EXIF DateTimeOriginal: an IST wall-clock time with no zone (TP25). */
const FIXTURE_TIME = '2026:10:14 09:40:12';

/** Now as EXIF writes it on an Indian phone: `YYYY:MM:DD HH:MM:SS` in IST, same length as FIXTURE_TIME. */
function exifNowIst(): string {
  const iso = new Date(Date.now() + 330 * 60_000).toISOString();
  return `${iso.slice(0, 4)}:${iso.slice(5, 7)}:${iso.slice(8, 10)} ${iso.slice(11, 19)}`;
}

/**
 * The fixture JPEG, its EXIF time moved to now (so exif_time_agreement sees a photo taken moments
 * before the capture, as on a real phone), with a random trailer after its end-of-image marker: still
 * a valid JPEG with the same EXIF GPS, but unique bytes, so parallel projects and re-runs never trip
 * photo_uniqueness.
 */
function uniquePhoto(): Buffer {
  const photo = Buffer.from(FIXTURE);
  let at = photo.indexOf(FIXTURE_TIME, 0, 'latin1');
  if (at < 0) throw new Error('fixture EXIF time not found');
  const now = exifNowIst();
  for (; at >= 0; at = photo.indexOf(FIXTURE_TIME, at + 1, 'latin1')) photo.write(now, at, 'latin1');
  return Buffer.concat([photo, randomBytes(16)]);
}

/** Put the seeded test key (imported non-extractable) and the device state into IndexedDB. */
async function injectDevice(page: Page, key: TracerKey): Promise<void> {
  await page.evaluate(async ({ jwk, deviceId }) => {
    const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('udgam', 1);
      req.onupgradeneeded = () => {
        for (const s of ['keys', 'device', 'outbox']) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['keys', 'device'], 'readwrite');
      tx.objectStore('keys').put({ id: 'device', privateKey });
      tx.objectStore('device').put({ id: 'current', deviceId, nextSeq: 1, lastEventHash: 'genesis' });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { jwk: key.testOnlyPrivateJwk, deviceId: key.deviceId });
}

async function capture(page: Page, kg: string) {
  await page.getByLabel('Photo').setInputFiles({ name: 'p01.jpg', mimeType: 'image/jpeg', buffer: uniquePhoto() });
  await page.getByLabel('Cherry (kg)').fill(kg);
  await page.getByRole('button', { name: 'Send' }).click();
}

test('TC-013 EVAL-001 EVAL-002 a seeded phone signs a picking and sees Verified with evidence', async ({ page, context }) => {
  const key = seedTracer();
  await mockGeolocation(context, { lat: P01_INSIDE.lat, lng: P01_INSIDE.lng, accuracy: 8 });
  // /api/capture needs the device's agent signed in (technical-plan §10, TKT-04)
  await signIn(page, key.agentEmail, key.testOnlyAgentPassword);
  await page.goto(`/field/tracer?plot=${key.plotId}`);
  await injectDevice(page, key);

  // EVAL-001: first capture on the device (genesis)
  await capture(page, '42.5');
  await expect(page.getByTestId('verdict')).toHaveText('Verified');
  const evidence = page.getByTestId('evidence').getByRole('listitem');
  await expect(evidence).toHaveCount(7); // one row per registered check
  await expect(evidence).toContainText([`Signed by enrolled phone ${key.deviceId}`, '1 of 1 photos are new', 'Inside the plot']);
  const signed = await page.getByTestId('signed-payload').textContent();

  const events = await query<{ id: string; payload: string; cherry_kg: number; seq: number; final_verdict: string; anchor_seq: number }>(
    'SELECT id, payload, cherry_kg, seq, final_verdict, anchor_seq FROM harvest_events WHERE device_id = ?',
    [key.deviceId],
  );
  expect(events).toHaveLength(1);
  const ev = events[0]!;
  expect(ev.payload).toBe(signed); // the stored payload is the exact signed string
  expect(ev).toMatchObject({ cherry_kg: 42.5, seq: 1, final_verdict: 'Verified' });
  expect(await query('SELECT id FROM media WHERE event_id = ?', [ev.id])).toHaveLength(1);
  const runs = await query<{ verdict: string; anchor_seq: number }>('SELECT verdict, anchor_seq FROM verification_runs WHERE event_id = ?', [ev.id]);
  expect(runs).toEqual([expect.objectContaining({ verdict: 'Verified' })]);
  const entries = await query<{ seq: number; kind: string }>(
    `SELECT seq, kind FROM ledger_entries WHERE json_extract(payload, '$.eventId') = ? ORDER BY seq`,
    [ev.id],
  );
  expect(entries.map((e) => e.kind)).toEqual(['harvest_event', 'verification_run']);
  expect(entries.map((e) => e.seq)).toEqual([ev.anchor_seq, runs[0]!.anchor_seq]);
  // plus the seed's own two anchored entries
  const seedEntries = await query(
    `SELECT seq FROM ledger_entries WHERE json_extract(payload, '$.plotId') = ? AND kind = 'plot_registered'
     UNION ALL SELECT seq FROM ledger_entries WHERE json_extract(payload, '$.deviceId') = ? AND kind = 'device_enrolled'`,
    [key.plotId, key.deviceId],
  );
  expect(seedEntries).toHaveLength(2);

  // EVAL-002: a second picking on the same plot continues the device's chain and is Verified too
  await capture(page, '30');
  await expect
    .poll(async () => (await query('SELECT id FROM harvest_events WHERE device_id = ?', [key.deviceId])).length)
    .toBe(2);
  await expect(page.getByTestId('verdict')).toHaveText('Verified');
  const both = await query<{ seq: number; prev_event_hash: string; final_verdict: string }>(
    'SELECT seq, prev_event_hash, final_verdict FROM harvest_events WHERE device_id = ? ORDER BY seq',
    [key.deviceId],
  );
  expect(both.map(({ seq, prev_event_hash, final_verdict }) => ({ seq, prev_event_hash, final_verdict }))).toEqual([
    { seq: 1, prev_event_hash: 'genesis', final_verdict: 'Verified' },
    { seq: 2, prev_event_hash: createHash('sha256').update(signed!, 'utf8').digest('hex'), final_verdict: 'Verified' },
  ]);
});
