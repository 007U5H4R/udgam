import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { demoPhoto } from '../scripts/seed/photos';
import { noHorizontalScroll, SEED, signInAs, stepTimer, writeTimings } from './helpers/demo';
import { stubTiles } from './helpers/stubs';

// @eval EVAL-073 · TC-078 (technical-plan TSK-20.5): the grant demo end to end, through the UI only, on the
// seeded Kodagu demo (playwright.demo.config.ts). The office (at the project's width) registers a plot
// by upload, assigns it to the agent and issues a code; the agent's phone (375 px, mocked GPS inside the
// new plot, demo photos with matching EXIF) enrols, records a picking and sees Verified; the office
// builds a batch of it and hands it to the buyer; the buyer opens the certificate from the batch's QR
// link, the proof panel reaches `verified` and the EUDR GeoJSON downloads. Step timings go to
// evals/results/local/demo-run-<sha>.json. No database access outside the app.

const r7 = (n: number) => Math.round(n * 1e7) / 1e7;

/** A ~1 ha rectangle near Suntikoppa, Kodagu, new for every run (a demo draws its own plot). */
function newPlot(): { geojson: string; centre: { lat: number; lng: number } } {
  const lat = r7(12.478 + Math.random() * 0.01);
  const lng = r7(75.79 + Math.random() * 0.01);
  const dLat = 40 / 111_195;
  const dLng = 62 / (111_195 * Math.cos((lat * Math.PI) / 180));
  const ring = [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ].map(([x, y]) => [r7(x!), r7(y!)]);
  const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Demo plot' }, geometry: { type: 'Polygon', coordinates: [ring] } }] };
  return { geojson: JSON.stringify(fc), centre: { lat, lng } };
}

const AGENT = 'agent2' as const;
const BUYER_NAME = SEED.buyer.name;

test('@eval EVAL-073 TC-078 the Kodagu demo: register → enrol → capture → Verified → batch → transfer → certificate verified → GeoJSON', async ({ browser, page: office }, info) => {
  const t = stepTimer();
  const agentId = SEED.users.find((u) => u.key === AGENT)!.id;
  const plot = newPlot();
  const farmer = `Demo farmer ${Date.now().toString(36)}`;
  let plotId = '';
  let code = '';
  let batchId = '';

  // The phone: always 375 px, GPS pinned inside the new plot.
  const phoneCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    geolocation: { latitude: plot.centre.lat, longitude: plot.centre.lng, accuracy: 8 },
    permissions: ['geolocation'],
    extraHTTPHeaders: { 'x-forwarded-for': `10.73.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}` },
  });
  const phone = await phoneCtx.newPage();

  try {
    await t.step('office signs in and registers a plot by upload', async () => {
      await stubTiles(office);
      await signInAs(office, 'admin');
      await office.goto('/admin/plots/new');
      await office.waitForLoadState('networkidle'); // the form is hydrated before anything is chosen
      await office.getByLabel('Whose plot is it?').selectOption({ label: 'A new farmer…' });
      await office.getByLabel('New farmer’s name').fill(farmer);
      await office.getByRole('radio', { name: 'Arabica' }).check();
      const upload = office.getByLabel(/boundary file/i);
      await upload.setInputFiles({ name: 'demo-plot.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(plot.geojson) });
      await expect.poll(() => upload.evaluate((el) => (el as HTMLInputElement).files?.length ?? 0)).toBe(1);
      await office.getByRole('button', { name: 'Save plot' }).click();
      await expect(office).toHaveURL(/\/admin\/plots\/PL-[0-9A-Z]{8}$/);
      plotId = office.url().split('/').at(-1)!;
      await expect(office.getByTestId('registration-checks').getByText('Forest map · Passed')).toBeVisible();
      await noHorizontalScroll(office);
    });

    await t.step('office assigns the plot to the agent and issues an enrolment code', async () => {
      await office.goto('/admin/phones');
      const card = office.getByTestId(`agent-${agentId}`);
      await card.getByLabel('Add a plot').selectOption(plotId);
      await card.getByRole('button', { name: 'Assign' }).click();
      await expect(card.getByTestId(`assigned-${agentId}-${plotId}`)).toBeVisible();
      await card.getByRole('button', { name: 'Issue code' }).click();
      const shown = card.getByTestId('issued-code');
      await expect(shown).toHaveText(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
      code = (await shown.textContent())!;
      await noHorizontalScroll(office);
    });

    await t.step('the phone enrols with the code', async () => {
      await signInAs(phone, AGENT);
      await phone.goto('/enrol');
      await phone.getByRole('dialog', { name: 'ಭಾಷೆ · Language' }).getByRole('button', { name: 'English' }).click();
      await phone.getByLabel('Enter the 6-letter code from the office').fill(code);
      await phone.getByRole('button', { name: 'Set up this phone' }).click();
      await expect(phone.getByTestId('enrol-done')).toHaveText('This phone is ready');
    });

    await t.step('the phone records a picking on the new plot and sees Verified', async () => {
      await phone.goto(`/field/record?plot=${plotId}`);
      const takenAt = new Date(Date.now() - 60_000).toISOString();
      const slots = [
        ['The branch', 'branch'],
        ['Basket on the scale', 'scale'],
      ] as const;
      for (const [i, [label, slot]] of slots.entries()) {
        const bytes = await demoPhoto({ slot, variant: Date.now() % 97, gps: plot.centre, takenAt, label: `demo-${info.project.name}-${slot}-${Date.now()}` });
        await phone.getByLabel(label).setInputFiles({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(bytes) });
        await phone.getByRole('button', { name: 'Use this photo' }).click();
        await expect(phone.getByRole('button', { name: 'Open camera' })).toBeVisible();
      }
      await phone.getByRole('button', { name: 'Continue with 2 photos' }).click();
      for (const k of ['4', '2', '.', '5']) await phone.locator(`#keypad [data-k="${k}"]`).click();
      await phone.locator('#send-btn').click();
      await expect(phone.locator('#verdict-h')).toBeVisible({ timeout: 60_000 });
      await expect(phone.locator('h1 .lit')).toHaveText('Verified');
      await expect(phone.locator('.v-sub')).toContainText('42.5 kg');
      await phone.getByRole('button', { name: 'Done' }).click();
    });

    await t.step('office builds a batch from the Verified picking', async () => {
      await office.goto('/admin/batches/new');
      const row = office.locator('label', { hasText: plotId });
      await expect(row).toHaveCount(1);
      await row.locator('input[type=checkbox]').check();
      const pill = office.getByRole('button', { name: /^Create batch/ });
      await expect(pill).toHaveText('Create batch · 1 picking · 42.5 kg');
      await pill.click();
      await expect(office).toHaveURL(/\/admin\/batches\/B-[0-9A-Z]{8}$/);
      batchId = new URL(office.url()).pathname.split('/').pop()!;
      await expect(office.getByRole('heading', { level: 2, name: batchId })).toBeVisible();
      await noHorizontalScroll(office);
    });

    await t.step('office transfers the batch to the buyer', async () => {
      const form = office.getByRole('form', { name: 'Transfer custody' });
      await form.getByLabel('Hand to').selectOption({ label: BUYER_NAME });
      await form.getByRole('button', { name: 'Sign and transfer' }).click();
      await expect(office.getByTestId('custody-line')).toContainText(BUYER_NAME);
    });

    let certificatePath = '';
    await t.step('the buyer finds the batch and its QR link', async () => {
      await office.context().clearCookies();
      await signInAs(office, 'buyer');
      await expect(office).toHaveURL(/\/buyer$/);
      await office.locator(`[data-batch-id="${batchId}"]`).click();
      await expect(office.getByRole('heading', { level: 2, name: batchId })).toBeVisible();
      const qr = office.getByTestId('batch-qr');
      await expect(qr.locator('svg')).toBeVisible();
      const link = /\/verify\/B-[0-9A-Z]{8}\?h=[0-9a-f]{12}/.exec((await qr.textContent()) ?? '');
      expect(link, 'the QR card carries the certificate link').not.toBeNull();
      certificatePath = link![0];
      expect(certificatePath.startsWith(`/verify/${batchId}?h=`)).toBe(true);
      await expect(office.locator('body')).not.toContainText(farmer); // producer IDs only (EV16)
    });

    await t.step('the certificate opens from the QR link and its proof verifies in the browser', async () => {
      await office.goto(certificatePath);
      await expect(office.locator('body')).toHaveAttribute('data-state', 'verified', { timeout: 30_000 });
      await expect(office.getByRole('heading', { level: 1 })).toContainText('42.5 kg of Arabica cherry');
      await expect(office.locator('body')).not.toContainText(farmer);
      await noHorizontalScroll(office);
    });

    await t.step('the EUDR GeoJSON downloads', async () => {
      const [download] = await Promise.all([office.waitForEvent('download'), office.locator('#geojson').click()]);
      expect(download.suggestedFilename()).toBe(`udgam-${batchId}-eudr.geojson`);
      const doc = JSON.parse(readFileSync((await download.path())!, 'utf8')) as { type: string; features: { geometry: { type: string } }[] };
      expect(doc.type).toBe('FeatureCollection');
      expect(doc.features).toHaveLength(1);
      expect(JSON.stringify(doc)).not.toContain(farmer);
    });
  } finally {
    const file = writeTimings(info, 'demo', t.steps, t.totalMs());
    info.annotations.push({ type: 'timings', description: file });
    await phoneCtx.close();
  }
  expect(t.totalMs()).toBeLessThan(600_000);
});
