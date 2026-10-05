import { expect, test, type Page } from '@playwright/test';
import { certificateUrl, noHorizontalScroll, noSeriousAxeViolations, proofFinalState, seedCertificate, type SeededCertificate } from './helpers/certificate';

// The public certificate (TKT-16), ported from .design/exploration/final/verify.html. Each Playwright
// project is one viewport (320, 375, 768, 1440). One batch is seeded per worker: 3 Verified pickings
// (38 + 41.5 + 45 = 124.5 kg) on 3 farms in Kodagu, an organic attestation, a transfer.

let seeded: SeededCertificate;
test.beforeAll(() => {
  seeded = seedCertificate({ events: 3, plots: 3 });
});

const width = (page: Page) => page.viewportSize()!.width;

async function openVerified(page: Page) {
  const res = await page.goto(certificateUrl(seeded));
  expect(res?.status()).toBe(200);
  expect(await proofFinalState(page)).toBe('verified');
}

test.describe('certificate hero, origin map and journey (TSK-16.4, @eval EVAL-087, TC-066)', () => {
  test('the h1 names the kilograms, crop, farms and district from the feed', async ({ page }) => {
    await openVerified(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('124.5 kg of Arabica cherry from 3 farms in Kodagu');
    await expect(page.getByText(`Batch ${seeded.batchId}`, { exact: true })).toBeVisible();
    await expect(page.getByText('Kodagu, Karnataka, India · harvested 2–6 Sep 2026')).toBeVisible();
  });

  test('proof first on phones; map and journey side by side from 1000 px', async ({ page }) => {
    await openVerified(page);
    const proof = (await page.locator('.proof').boundingBox())!;
    const map = (await page.locator('#origin-map').boundingBox())!;
    const journey = (await page.locator('#journey').boundingBox())!;
    if (width(page) < 1000) {
      expect(proof.y).toBeLessThan(map.y);
      expect(journey.y).toBeGreaterThanOrEqual(map.y + map.height); // single column
    } else {
      // side by side: their boxes overlap vertically and the journey is to the right of the map
      expect(journey.y).toBeLessThan(map.y + map.height);
      expect(map.y).toBeLessThan(journey.y + journey.height);
      expect(journey.x).toBeGreaterThan(map.x + map.width);
    }
  });

  test('the map draws each plot from its anchored polygon, with its forest-loss line verbatim (demo data kept)', async ({ page }) => {
    await openVerified(page);
    const svg = page.locator('#origin-map svg');
    await expect(svg).toHaveAttribute('role', 'img');
    for (const plotId of seeded.plotIds) await expect(svg.locator(`g[data-plot="${plotId}"] path`).first()).toHaveAttribute('d', /^M[\d.]+ [\d.]+ L/);
    const farms = page.getByRole('list', { name: 'Farms in this batch' }).getByRole('listitem');
    await expect(farms).toHaveCount(3);
    for (const [i, producerId] of seeded.producerIds.entries()) {
      await expect(farms.nth(i)).toContainText(`Farm ${producerId} · 2.0 ha`);
      await expect(farms.nth(i)).toContainText('1 picking');
      // EXE12 / CF-11: fixture satellite data is labelled, and the label is shown as recorded
      await expect(farms.nth(i).getByTestId('forest-line')).toHaveText('0.0% of plot area lost since 2021 (hard fail at 10.0%) (demo data)');
    }
  });

  test('the journey: harvested, checked, batched, handed to the buyer', async ({ page }) => {
    await openVerified(page);
    const steps = page.locator('#journey li');
    await expect(steps).toHaveCount(4);
    await expect(steps.nth(0)).toContainText('Harvested2–6 Sep 20263 farms in Kodagu');
    await expect(steps.nth(1)).toContainText('Checked3 pickings');
    await expect(steps.nth(2)).toContainText('Batched');
    await expect(steps.nth(3)).toContainText('Handed to buyer');
  });

  test('the origin table', async ({ page }) => {
    await openVerified(page);
    const table = page.locator('table.origin-table');
    await expect(table.locator('td[data-label="Region"]')).toHaveText('Kodagu, Karnataka, India');
    await expect(table.locator('td[data-label="Variety"]')).toHaveText('Arabica');
    await expect(table.locator('td[data-label="Farms"]')).toHaveText('3');
    await expect(table.locator('td[data-label="Harvest window"]')).toHaveText('2–6 Sep 2026');
    await expect(table.locator('td[data-label="Quantity"]')).toHaveText('124.5 kg cherry');
  });

  test('TC-068: the embedded #proof-feed is the /api/verify response, byte for byte as JSON', async ({ page }) => {
    await openVerified(page);
    const embedded = JSON.parse((await page.locator('#proof-feed').textContent())!) as unknown;
    const api = await page.request.get(`/api/verify/${seeded.batchId}?h=${seeded.shortHash}`);
    expect(api.status()).toBe(200);
    expect(embedded).toEqual(await api.json());
  });
});

test.describe('certificate entries, organic line, files and limits (TSK-16.5)', () => {
  test('each entry: date, kg, verdict word + mark, three evidence lines, "See all checks" for the rest', async ({ page }) => {
    await openVerified(page);
    const entries = page.locator(width(page) >= 760 ? 'table.e-table tbody tr[data-event]' : 'ol.e-list > li');
    await expect(entries).toHaveCount(3);
    const expected = [
      ['2 Sep 2026', '38.0 kg'],
      ['4 Sep 2026', '41.5 kg'],
      ['6 Sep 2026', '45.0 kg'],
    ];
    for (const [i, [date, kg]] of expected.entries()) {
      await expect(entries.nth(i)).toContainText(date!);
      await expect(entries.nth(i)).toContainText(kg!);
      await expect(entries.nth(i)).toContainText(`Farm ${seeded.producerIds[i]}`);
      const chip = entries.nth(i).locator('.vchip');
      await expect(chip).toHaveText('Verified'); // the word…
      await expect(chip.locator('svg[data-mark="ok"]')).toHaveCount(1); // …and the mark, never colour alone
    }
    const evidence = page.getByTestId('evidence').filter({ visible: true }).first();
    await expect(evidence.locator('li')).toHaveCount(3);
    await expect(evidence).toContainText('Signed by enrolled phone DV-');
    const more = page.locator('details').filter({ visible: true }).filter({ hasText: 'See all checks (9 more)' }).first();
    await expect(more.locator('li').first()).toBeHidden();
    await more.locator('summary').click();
    // the rest, with the fixture satellite lines labelled "(demo data)" exactly as recorded (EXE12)
    await expect(more).toContainText('0.0% of plot area lost since 2021 (hard fail at 10.0%) (demo data)');
    await expect(more).toContainText('Living canopy around the picking date: NDVI 0.71 (needs ≥ 0.45) (demo data)');
  });

  test('the organic line reads "Certified by <issuer> — certificate on record" with its validity', async ({ page }) => {
    await openVerified(page);
    const line = page.getByTestId('attestation-line');
    await expect(line).toHaveText('Certified by INDOCERT — certificate on record · valid 1 Jan 2026–31 Dec 2027');
    await expect(page.getByText(`Covers Farm ${seeded.producerIds[0]} only, not every farm in this batch.`)).toBeVisible();
  });

  test('files: the EUDR GeoJSON link behind the same h, and Print', async ({ page }) => {
    await openVerified(page);
    const block = page.locator('#dl-block');
    await expect(block.getByRole('link', { name: 'Download EUDR map file (GeoJSON)' })).toHaveAttribute('href', `/api/verify/${seeded.batchId}/geojson?h=${seeded.shortHash}`);
    await expect(block.getByRole('button', { name: 'Print certificate' })).toBeVisible();
  });

  test('honest limits: trust anchor, GPS inside the plot, re-encoded photos, salami, pruning vs clearing', async ({ page }) => {
    await openVerified(page);
    const limits = page.locator('#limits');
    await expect(limits.getByRole('heading', { level: 2 })).toHaveText('What this can’t prove');
    await expect(limits.locator('[data-limit="trust"]')).toContainText('the key Udgam publishes');
    await expect(limits.locator('[data-limit="gps"]')).toContainText('inside the plot is not proof');
    await expect(limits.locator('[data-limit="photos"]')).toContainText('re-saved or edited');
    await expect(limits.locator('[data-limit="salami"]')).toContainText('Many small pickings');
    await expect(limits.locator('[data-limit="clearing"]')).toContainText('pruning');
    await page.getByRole('link', { name: 'What this can’t prove' }).click();
    await expect(page).toHaveURL(/#limits$/);
  });

  test('an office decision shows its reason as text; no attestation, no organic line', async ({ page }) => {
    const other = seedCertificate({ events: 2, plots: 1, override: true, attestation: false });
    await page.goto(certificateUrl(other));
    expect(await proofFinalState(page)).toBe('verified');
    await expect(page.getByTestId('override-reason').filter({ visible: true })).toHaveText('Decided by the office: Verified · Reason: Scale photo checked by the office');
    await expect(page.getByTestId('attestation-line')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Organic' })).toHaveCount(0);
  });
});

test.describe('certificate responsive and accessibility gates (TSK-16.11, @eval EVAL-087, EVAL-089, TC-080, TC-081)', () => {
  // One test per state (TASK-17 fix round 1): each is one navigation and one axe scan, so it fits the
  // default timeout under a loaded host; the four used to share one 30 s budget.
  for (const [name, extra, final] of [
    ['verified', '', 'verified'],
    ['loading', '&state=loading', null],
    ['mismatch', '&state=mismatch', 'mismatch'],
    ['not found', null, null],
  ] as const) {
    test(`no horizontal scroll and no serious or critical axe violation: ${name}`, async ({ page }) => {
      const path = extra === null ? `/verify/${seeded.batchId}?h=000000000000` : certificateUrl(seeded, extra);
      await page.goto(path);
      if (final) expect(await proofFinalState(page), path).toBe(final);
      else await page.waitForLoadState('networkidle');
      await noHorizontalScroll(page);
      await noSeriousAxeViolations(page);
    });
  }

  test('tab order follows the page: proof panel → (map) → entries → downloads', async ({ page }) => {
    await openVerified(page);
    // the map sits between the proof panel and the entries in the document (it has nothing to focus)
    const order = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('.proof, #origin-map, section[aria-labelledby="entries-h"], #dl-block'));
      return ['.proof', '#origin-map', 'section[aria-labelledby="entries-h"]', '#dl-block'].map((sel) => all.findIndex((e) => e.matches(sel)));
    });
    expect(order).toEqual([0, 1, 2, 3]);
    const regions: string[] = [];
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const r = await page.evaluate(() => {
        const a = document.activeElement;
        if (!a || a === document.body) return 'none';
        if (a.closest('.proof')) return 'proof';
        if (a.closest('#origin-map')) return 'map';
        if (a.closest('section[aria-labelledby="entries-h"]')) return 'entries';
        if (a.closest('#dl-block')) return 'downloads';
        return `other:${a.tagName.toLowerCase()}`;
      });
      if (regions.at(-1) !== r) regions.push(r);
      if (r === 'downloads' && (await page.evaluate(() => document.activeElement?.id)) === 'print') break;
    }
    expect(regions.filter((r) => r !== 'none')).toEqual(['proof', 'entries', 'downloads']);
  });

  test('the page runs under its CSP with no violation (TC-076 on the certificate)', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (m) => {
      if (/Content Security Policy|Content-Security-Policy/i.test(m.text())) violations.push(m.text());
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`));
    });
    const res = await page.goto(certificateUrl(seeded));
    expect(res!.headers()['content-security-policy']).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(await proofFinalState(page)).toBe('verified');
    await page.waitForLoadState('networkidle');
    expect(violations).toEqual([]);
  });
});
