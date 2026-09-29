import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, openField, seedCaptureWorld, type SeededCapture } from './helpers/capture';
import { typePicking } from './helpers/field';

// TKT-11 · TC-051 and EVAL-088 (capture views): the Pickings tab (final/index.html #s8, lines 642–659)
// in all four states. Working: "Your pickings", a month header with its count and plot, rows with
// verdict chips (word + mark + colour), the reason under Needs a check (`r-why`), and for Not accepted
// the reason with a "What can I do?" disclosure; pickings saved on this phone are listed first.
// Loading shows skeleton rows (no spinner); empty says "No pickings recorded yet" with the record
// action; error says the saved pickings are safe and offers Try again.

test.describe.configure({ timeout: 120_000 });

async function axeClean(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
}

/** Put one saved (unsent) picking in the phone's outbox, as the record flow stores it. */
async function saveOnPhone(page: Page, seed: SeededCapture, kg: number) {
  await page.evaluate(
    async ({ plotId, deviceId, seq, kg }) => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const q = indexedDB.open('udgam');
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
      await new Promise<void>((res, rej) => {
        const tx = db.transaction('outbox', 'readwrite');
        const payload = JSON.stringify({ cherryKg: kg, deviceId, plotId, seq, v: 1 });
        tx.objectStore('outbox').put({ id: 'OB-E2E', payload, signature: 'unsent', files: [new Blob([new Uint8Array([0xff, 0xd8, 0xff])])], plotId, cherryKg: kg, photoCount: 1, createdAt: new Date().toISOString(), attempts: 1, order: 1 });
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      db.close();
    },
    { plotId: seed.plots[0]!.id, deviceId: seed.deviceId, seq: seed.nextSeq, kg },
  );
}

test('TC-051 working: month header, verdict chips, reasons under Needs a check and Not accepted, pickings saved on this phone first', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['38.5:Verified', '44:Needs Review:cloud', '29:Rejected:outside', '51:Verified'], refusal: 'plot_not_assigned' });
  await openField(page, context, seed);
  await saveOnPhone(page, seed, 42.5);
  await page.goto('/field/pickings');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your pickings');
  const pending = page.getByTestId('pending-rows').locator('li');
  await expect(pending).toHaveCount(1);
  await expect(pending).toContainText('Saved on this phone');
  await expect(pending.locator('.r-kg')).toHaveText('42.5 kg');
  await expect(pending.getByRole('button', { name: 'Send now' })).toBeVisible();

  const months = page.locator('section[data-month]');
  await expect(months.first().locator('.month h2')).toHaveText(/^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/);
  await expect(months.first().locator('.month span')).toHaveText(/^\d+ pickings? · Plot 1$/);
  const rows = page.locator('section[data-month] li.row');
  await expect(rows).toHaveCount(5);
  // newest first: the refusal (30 min ago), then 51, 29, 44, 38.5 kg
  await expect(rows.locator('.r-kg')).toHaveText(['30.0 kg', '51.0 kg', '29.0 kg', '44.0 kg', '38.5 kg']);
  await expect(rows.locator('.vchip')).toHaveText(['Not accepted', 'Verified', 'Not accepted', 'Needs a check', 'Verified']);
  // word + mark + colour, never colour alone
  await expect(rows.locator('.vchip svg.mk')).toHaveCount(5);
  await expect(page.locator('li.row[data-event="' + seed.events[1]!.eventId + '"] .vchip')).toHaveClass(/\bcheck\b/);

  const needs = page.locator(`li.row[data-event="${seed.events[1]!.eventId}"]`);
  await expect(needs).toHaveClass(/\btall\b/);
  await expect(needs.locator('.r-why')).toHaveText('The satellite picture for this month was cloudy. The office is checking it.');

  const rejected = page.locator(`li.row[data-event="${seed.events[2]!.eventId}"]`);
  await expect(rejected.locator('.r-why > p')).toHaveText('Your phone was 212 m outside Plot 1.');
  const what = rejected.locator('details');
  await expect(what.locator('summary')).toHaveText('What can I do?');
  await expect(what.locator('p')).toBeHidden();
  await what.locator('summary').click();
  await expect(what.locator('p')).toHaveText('Stand inside Plot 1 and record the picking again. If you were inside, tell the office.');

  const refused = page.locator(`li.row[data-event="${seed.refusal!.eventId}"]`);
  await expect(refused.locator('.r-why > p')).toHaveText('This plot is not assigned to you.');
  await refused.locator('summary').click();
  await expect(refused.locator('details p')).toHaveText('Ask the office to assign it to you, then record the picking again.');

  // a Verified row has no reason
  await expect(page.locator(`li.row[data-event="${seed.events[0]!.eventId}"] .r-why`)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Pickings' })).toHaveAttribute('aria-current', 'page');
  await expectNoHorizontalScroll(page);
  await axeClean(page);
});

test('TC-051 / EVAL-088: loading shows skeleton rows (no spinner); empty says so with the record action; error keeps saved pickings safe with Try again', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['38.5:Verified'] });
  await openField(page, context, seed);

  await page.goto('/field/pickings?state=loading');
  await expect(page.locator('main[aria-busy="true"]')).toBeVisible();
  await expect(page.getByTestId('pickings-skeleton').locator('.skel')).toHaveCount(4);
  await expect(page.locator('[role="progressbar"], .spinner')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await axeClean(page);

  await page.goto('/field/pickings?state=empty');
  await expect(page.getByTestId('pickings-empty')).toContainText('No pickings recorded yet');
  const record = page.getByRole('link', { name: "Record today's picking" });
  await expect(record).toHaveAttribute('href', '/field');
  await expectNoHorizontalScroll(page);
  await axeClean(page);

  await page.goto('/field/pickings?state=error');
  const alert = page.locator('main').getByRole('alert');
  await expect(alert).toContainText("Couldn't load your entries.");
  await expect(alert).toContainText('Your saved pickings are safe on this phone.');
  await expect(page.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/field/pickings');
  await expectNoHorizontalScroll(page);
  await axeClean(page);
});

test("TC-051 detail: a picking's photos, kg, IST time, plot, verdict chip, up to three reasons and every group's state; another agent's picking is not found", async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await typePicking(page, seed, { photos: 2 });
  await page.locator('#send-btn').click();
  await expect(page.locator('#verdict-h')).toBeVisible({ timeout: 60_000 });

  await page.goto('/field/pickings');
  const row = page.locator('section[data-month] li.row').first();
  const eventId = (await row.getAttribute('data-event'))!;
  await row.getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/field/pickings/${eventId}$`));

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('42.5 kg · Plot 1');
  await expect(page.locator('.status-row .vchip svg.mk')).toHaveCount(1);
  await expect(page.locator('main time')).toHaveText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2}$/);
  const photos = page.getByTestId('detail-photos').locator('img');
  await expect(photos).toHaveCount(2);
  await expect(photos.first()).toHaveAttribute('alt', 'Photo 1');
  // the thumbnails load for their owner
  await expect.poll(() => photos.evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).naturalWidth > 0))).toEqual([true, true]);
  const lines = page.getByTestId('evidence').locator('li');
  expect(await lines.count()).toBeGreaterThan(0);
  expect(await lines.count()).toBeLessThanOrEqual(3);

  const all = page.getByTestId('all-checks');
  await expect(all.locator('summary')).toHaveText('See all checks');
  await all.locator('summary').click();
  const groups = all.locator('li');
  await expect(groups).toHaveCount(6);
  await expect(groups.locator('.c-name')).toHaveText(["Your phone's seal", 'Inside Plot 1', 'Photos are new', 'Forest map for Plot 1', 'Satellite view this month', 'Harvest size for this plot']);
  for (const s of await groups.locator('.c-state').allTextContents()) expect(['Passed', 'Needs a look', 'Did not pass', 'Could not run', 'Not run']).toContain(s);
  await expectNoHorizontalScroll(page);
  await axeClean(page);

  await page.getByRole('link', { name: 'Back to Pickings' }).click();
  await expect(page).toHaveURL(/\/field\/pickings$/);

  const other = seedCaptureWorld({ events: ['40:Verified'] });
  const res = await page.goto(`/field/pickings/${other.events[0]!.eventId}`);
  expect(res!.status()).toBe(404);
});
