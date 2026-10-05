import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, openField, seedCaptureWorld } from './helpers/capture';
import { dbRows, ndLines, payloadHash, readOutbox, typePicking } from './helpers/field';

// TKT-11 · TC-050 (both variants) and EVAL-068 (client side): nothing the farmer did is lost. A failed
// send keeps the signed payload, its signature and the photo blobs in IndexedDB and shows the amber
// "Couldn't send" sheet (#s7); Try again re-sends the IDENTICAL bytes (never re-signed), so a retry
// after a lost response gets the original event back from the server's idempotency (TP7, EV15).

test.describe.configure({ timeout: 150_000 });

test('TC-050 (a): no network → the amber sheet says nothing is lost; the outbox holds payload, signature and 3 photos; Try again gets the verdict and empties it', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await page.route('**/api/capture', (r) => r.abort('internetdisconnected'));
  await typePicking(page, seed);
  await page.locator('#send-btn').click();

  const sheet = page.getByTestId('saved-sheet');
  await expect(sheet.getByRole('heading', { level: 1 })).toHaveText('No network here');
  await expect(sheet.getByTestId('saved-body')).toHaveText('Nothing is lost: 3 photos and 42.5 kg are saved on this phone.');
  await expect(sheet.locator('b')).toHaveText(['3 photos', '42.5 kg']);
  const retry = sheet.getByRole('button', { name: 'Try again' });
  await expect(retry).toHaveClass(/amber/);
  await expect(sheet.getByRole('button', { name: 'Try later' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  // the dimmed weight screen behind the sheet is context only
  await expect(page.locator('.under')).toHaveAttribute('aria-hidden', 'true');
  await expectNoHorizontalScroll(page);

  const [saved] = await readOutbox(page);
  expect(saved).toBeDefined();
  expect(JSON.parse(saved!.payload)).toMatchObject({ cherryKg: 42.5, plotId: seed.plots[0]!.id, seq: seed.nextSeq });
  expect(saved!.signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
  expect(saved!.sizes).toHaveLength(3);

  await page.unroute('**/api/capture');
  await retry.click();
  await expect(page.locator('#verdict-h')).toHaveText('Verified', { timeout: 60_000 });
  expect(await readOutbox(page)).toEqual([]);
  // the server holds the identical signed payload and signature the phone saved (never re-signed)
  const rows = await dbRows<{ payload: string; signature: string }>('SELECT payload, signature FROM harvest_events WHERE payload_hash = ?', [payloadHash(saved!.payload)]);
  expect(rows).toEqual([{ payload: saved!.payload, signature: saved!.signature }]);
});

test('TC-050 (a): an answer from a proxy (502 page) → "Couldn\'t send"; after a reload of Home the picking is still saved on this phone', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await page.route('**/api/capture', (r) => r.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad gateway</html>' }));
  await typePicking(page, seed, { photos: 1 });
  await page.locator('#send-btn').click();
  const sheet = page.getByTestId('saved-sheet');
  await expect(sheet.getByRole('heading', { level: 1 })).toHaveText("Couldn't send");
  await expect(sheet.getByTestId('saved-body')).toHaveText('Nothing is lost: 1 photo and 42.5 kg are saved on this phone.');
  const before = await readOutbox(page);
  expect(before).toHaveLength(1);

  await sheet.getByRole('button', { name: 'Try later' }).click();
  await expect(page).toHaveURL(/\/field$/);
  await page.reload();
  const after = await readOutbox(page);
  expect(after.map((i) => [i.id, i.payload, i.signature, i.sizes])).toEqual(before.map((i) => [i.id, i.payload, i.signature, i.sizes]));
});

test('TC-050 (b) / EVAL-068: the server commits but the answer is lost → Try again returns the original event (idempotent) and one event exists', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  let first = '';
  await page.route('**/api/capture', async (route) => {
    const res = await route.fetch(); // the server receives the picking and commits it …
    first = await res.text();
    await route.abort('connectionreset'); // … and the phone never hears back
  });
  await typePicking(page, seed, { photos: 2 });
  await page.locator('#send-btn').click();
  await expect(page.getByTestId('saved-sheet').getByRole('heading', { level: 1 })).toHaveText('No network here', { timeout: 60_000 });
  const original = ndLines(first).find((l) => l.t === 'verdict');
  expect(original, first).toBeDefined();
  const [saved] = await readOutbox(page);
  const hash = payloadHash(saved!.payload);

  await page.unroute('**/api/capture');
  let second = '';
  await page.route('**/api/capture', async (route) => {
    const res = await route.fetch();
    second = await res.text();
    await route.fulfill({ response: res, body: second });
  });
  await page.getByTestId('saved-sheet').getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('#verdict-h')).toBeVisible({ timeout: 60_000 });
  const replay = ndLines(second).find((l) => l.t === 'verdict');
  expect(replay).toMatchObject({ eventId: original!.eventId, verdict: original!.verdict, idempotent: true });
  expect(await readOutbox(page)).toEqual([]);

  const rows = await dbRows<{ id: string; boundary_status: string }>('SELECT id, boundary_status FROM harvest_events WHERE payload_hash = ?', [hash]);
  expect(rows).toEqual([expect.objectContaining({ id: original!.eventId, boundary_status: 'accepted' })]);
});

// TSK-11.3: pickings saved on this phone are listed above the sent ones with "Send now" (no verdict chip:
// the row is not a verdict). Send now sends them oldest first, one at a time, as the identical signed
// copies. Two pickings saved offline carry the same seq, so the second is flagged by chain_continuity on
// the server; Home shows each one's verdict as the server gave it.
test('TSK-11.3: two pickings saved offline → two "Saved on this phone" rows above the sent ones; Send now sends both, oldest first, and Home shows the server\'s verdicts', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['40:Verified'] });
  await openField(page, context, seed);
  await page.route('**/api/capture', (r) => r.abort('internetdisconnected'));
  for (const kg of ['42.5', '38']) {
    await typePicking(page, seed, { photos: 1, kg });
    await page.locator('#send-btn').click();
    await page.getByTestId('saved-sheet').getByRole('button', { name: 'Try later' }).click();
    await expect(page).toHaveURL(/\/field$/);
  }
  const saved = await readOutbox(page);
  expect(saved.map((i) => (JSON.parse(i.payload) as { seq: number; cherryKg: number }).cherryKg)).toEqual([42.5, 38]);
  expect(saved.map((i) => (JSON.parse(i.payload) as { seq: number }).seq)).toEqual([seed.nextSeq, seed.nextSeq]);

  const pending = page.getByTestId('pending-rows').locator('li');
  await expect(pending).toHaveCount(2);
  await expect(pending.first()).toHaveClass(/\brow\b/);
  await expect(pending.first().locator('.r-date')).toHaveText('Saved on this phone');
  await expect(pending.locator('.r-kg')).toHaveText(['42.5 kg', '38.0 kg']);
  await expect(pending.first().getByRole('button', { name: 'Send now' })).toBeVisible();
  await expect(pending.locator('.vchip, .mk')).toHaveCount(0);
  // above the sent entries
  const pendingBox = (await page.getByTestId('pending-rows').boundingBox())!;
  const sentBox = (await page.getByTestId('home-rows').boundingBox())!;
  expect(pendingBox.y + pendingBox.height).toBeLessThanOrEqual(sentBox.y);
  await expectNoHorizontalScroll(page);

  await page.unroute('**/api/capture');
  await pending.first().getByRole('button', { name: 'Send now' }).click();
  await expect(page.getByTestId('pending-rows')).toHaveCount(0, { timeout: 90_000 });
  expect(await readOutbox(page)).toEqual([]);

  const events = await dbRows<{ id: string; cherry_kg: number; final_verdict: string; checks: string }>(
    `SELECT e.id, e.cherry_kg, e.final_verdict, r.checks FROM harvest_events e JOIN verification_runs r ON r.event_id = e.id
     WHERE e.payload_hash IN (?, ?) ORDER BY e.anchor_seq`,
    saved.map((i) => payloadHash(i.payload)),
  );
  expect(events.map((e) => e.cherry_kg)).toEqual([42.5, 38]);
  const chain = (e: { checks: string }) => (JSON.parse(e.checks) as { id: string; status: string }[]).find((c) => c.id === 'chain_continuity')!.status;
  expect(events.map(chain)).toEqual(['ok', 'flag']);
  // Home shows each picking with the verdict the server recorded (the newest first)
  const sent = page.getByTestId('home-rows').locator('li');
  const word = { Verified: 'Verified', 'Needs Review': 'Needs a check', Rejected: 'Not accepted' } as Record<string, string>;
  await expect(sent.nth(0)).toHaveAttribute('data-event', events[1]!.id);
  await expect(sent.nth(0).locator('.vchip')).toHaveText(word[events[1]!.final_verdict]!);
  await expect(sent.nth(1)).toHaveAttribute('data-event', events[0]!.id);
  await expect(sent.nth(1).locator('.vchip')).toHaveText(word[events[0]!.final_verdict]!);
});
