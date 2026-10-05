import { expect, test } from '@playwright/test';
import { certificateUrl, greenOnPage, noHorizontalScroll, noSeriousAxeViolations, proofFinalState, seedCertificate, type SeededCertificate } from './helpers/certificate';

// TSK-16.6 · @eval EVAL-088 (certificate) · Design.md §18: the certificate's four states. Loading shows the
// real step line with its bar; mismatch shows the red proof card and no green anywhere; not found is the
// plain message (TSK-16.2); working is verified. `?state=` is honoured here because the Playwright server
// runs with E2E=1; a production deployment ignores it (src/lib/certificate/dev-state.int.test.ts).

let seeded: SeededCertificate;
test.beforeAll(() => {
  seeded = seedCertificate({ events: 3, plots: 3 });
});

test.describe('certificate states (@eval EVAL-088)', () => {
  test('loading: the real step line and the bar, nothing confirmed, no green', async ({ page }) => {
    await page.goto(certificateUrl(seeded, '&state=loading'));
    const proof = page.locator('.proof');
    await expect(proof.locator('#count-line')).toHaveText(/^Checking 0 of \d+ records…$/);
    await expect(proof.getByRole('progressbar', { name: 'Records checked' })).toBeVisible();
    await expect(proof).toContainText('Your browser is checking each record itself.');
    await expect(page.locator('body')).toHaveAttribute('data-state', 'loading');
    await expect(page.locator('.vchip').first()).toContainText('Checking');
    expect(await greenOnPage(page)).toEqual([]);
    await noHorizontalScroll(page);
    await noSeriousAxeViolations(page);
  });

  test('mismatch: the red proof card naming the record, "Check again", and no green anywhere', async ({ page }) => {
    await page.goto(certificateUrl(seeded, '&state=mismatch'));
    expect(await proofFinalState(page)).toBe('mismatch');
    const proof = page.locator('.proof');
    await expect(proof).toContainText('Does not match');
    await expect(proof).toContainText(/Record 1 of \d+ does not match the sealed ledger\./);
    await expect(page.locator('#check-again')).toBeVisible();
    await expect(page.getByText('The details below are what the seller published.')).toBeVisible();
    expect(await greenOnPage(page)).toEqual([]);
    await noHorizontalScroll(page);
    await noSeriousAxeViolations(page);
  });

  test('working = verified: the lit "Verified" and the recorded verdicts', async ({ page }) => {
    await page.goto(certificateUrl(seeded));
    expect(await proofFinalState(page)).toBe('verified');
    await expect(page.locator('.proof')).toContainText('Verified on this device just now');
    await expect(page.locator('.vchip:visible').first()).toContainText('Verified');
  });

  test('not found: the plain message (a wrong h)', async ({ page }) => {
    const res = await page.goto(`/verify/${seeded.batchId}?h=000000000000`);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Batch not found' })).toBeVisible();
    await noHorizontalScroll(page);
    await noSeriousAxeViolations(page);
  });
});
