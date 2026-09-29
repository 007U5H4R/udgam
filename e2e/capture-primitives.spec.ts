import { expect, test } from '@playwright/test';
import { openField, seedCaptureWorld } from './helpers/capture';

// TSK-10.2: the ported field stylesheet and base components on /field (signed-in seeded agent): the
// primary pill is 60 px tall, the floating tab bar has Home · Pickings · Help with Home current, and a
// verdict chip carries its word and its mark for each of the three verdicts (never colour alone).

test('the record pill, the tab bar and the three verdict chips match the frozen components', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['38.5:Rejected', '44:Needs Review', '51:Verified'] });
  await openField(page, context, seed);

  const record = page.getByRole('button', { name: "Record today's picking" });
  await expect(record).toBeVisible();
  expect(await record.evaluate((el) => getComputedStyle(el).height)).toBe('60px');

  const tabs = page.locator('nav.tabbar .tab');
  await expect(tabs).toHaveCount(3);
  await expect(tabs).toHaveText(['Home', 'Pickings', 'Help']);
  await expect(tabs.first()).toHaveAttribute('aria-current', 'page');
  await expect(tabs.nth(1)).not.toHaveAttribute('aria-current', /.*/);

  for (const [verdict, word] of [
    ['Verified', 'Verified'],
    ['Needs Review', 'Needs a check'],
    ['Rejected', 'Not accepted'],
  ] as const) {
    const chip = page.locator(`.vchip[data-verdict="${verdict}"]`);
    await expect(chip).toHaveCount(1);
    await expect(chip).toHaveText(word);
    await expect(chip.locator('svg.mk')).toHaveCount(1);
  }
});
