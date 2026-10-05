import { expect, test } from '@playwright/test';
import { EXPECTED_STEP, SUITE_VECTOR, TAMPER_VARIANTS } from '../src/lib/ledger/testing/tamper';
import { certificateUrl, greenOnPage, proofFinalState, seedCertificate, type SeededCertificate } from './helpers/certificate';

// TSK-16.8 · TC-065 · @eval EVAL-058..063 (page side) · CF-04: the test-only tamper mode (E2E=1 only)
// embeds a forged feed; the visitor's browser must reach the mismatch state naming the step that catches
// each forgery (docs/proof-feed.md §10, EXPECTED_STEP), and no --ok green may render anywhere on the page.
// The intact load reaches verified.

let seeded: SeededCertificate;
test.beforeAll(() => {
  seeded = seedCertificate({ events: 3, plots: 2 });
});

test.describe('certificate tamper mode (@eval EVAL-058..063, TC-065)', () => {
  test('the intact feed verifies (EVAL-058 page side)', async ({ page }) => {
    await page.goto(certificateUrl(seeded));
    expect(await proofFinalState(page)).toBe('verified');
    await expect(page.getByTestId('proof-seal')).toContainText(/Checkpoints? \d+/);
  });

  for (const variant of TAMPER_VARIANTS) {
    const step = EXPECTED_STEP[SUITE_VECTOR[variant]];
    test(`${variant}: mismatch at ${step}, no green anywhere`, async ({ page }) => {
      await page.goto(certificateUrl(seeded, `&__tamper=${variant}`));
      expect(await proofFinalState(page)).toBe('mismatch');
      const box = page.getByTestId('proof-mismatch');
      await expect(box).toHaveAttribute('data-step', step);
      await expect(page.locator('.proof')).toContainText('Does not match');
      await expect(page.locator('.proof')).toContainText(step);
      await expect(page.locator('#check-again')).toBeVisible();
      expect(await greenOnPage(page)).toEqual([]);
    });
  }

  test('other-key: the panel names the key it expected (EVAL-062)', async ({ page }) => {
    await page.goto(certificateUrl(seeded, '&__tamper=other-key'));
    expect(await proofFinalState(page)).toBe('mismatch');
    const keys = (await (await page.request.get('/.well-known/udgam-ledger-key')).json()) as { keys: { kid: string }[] };
    await expect(page.locator('.proof')).toContainText(`expected key ${keys.keys[0]!.kid.slice(0, 8)}`);
  });
});
