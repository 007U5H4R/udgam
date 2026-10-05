import { expect, test } from '@playwright/test';
import { noHorizontalScroll, SEED, signInAs, stepTimer, writeTimings } from './helpers/demo';
import { stubTiles } from './helpers/stubs';

// @eval EVAL-074 · TC-078 (technical-plan TSK-20.6): each of the four staged attacks is submitted from
// /admin/demo (DEMO_MODE=1) through the capture pipeline. Its card shows the system verdict and the
// catching check's evidence, and its review page (Needs Review or Rejected) shows that evidence too:
// "m outside the plot edge", "photos seen before", "% of plot area lost since 2021" with "25.0%", and
// "x the reference upper bound". The second project (the other width) runs against the same seeded state:
// each card is already submitted, so it re-reads the stored verdict and evidence rather than resubmitting.
// Resubmission returning the original verdict (TP7) is covered by demo.int.test.ts.

const EXPECTED: Record<string, { verdict: 'Needs Review' | 'Rejected'; evidence: string[] }> = {
  'gps-spoof': { verdict: 'Needs Review', evidence: ['m outside the plot edge'] },
  replay: { verdict: 'Rejected', evidence: ['photos seen before'] },
  'yield-inflation': { verdict: 'Rejected', evidence: ['x the reference upper bound'] },
  'plot-laundering': { verdict: 'Rejected', evidence: ['% of plot area lost since 2021', '25.0%'] },
};

test('@eval EVAL-074 the four demo attacks show the evidence that caught them', async ({ page }, info) => {
  const t = stepTimer();
  try {
    await t.step('office opens the demo attack page', async () => {
      await stubTiles(page);
      await signInAs(page, 'admin');
      await page.goto('/admin/demo');
      await expect(page.getByRole('heading', { level: 1, name: 'Demo tools' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Demo attacks' })).toBeVisible();
      await expect(page.getByRole('list', { name: 'Staged attacks' }).getByRole('listitem')).toHaveCount(4);
      await noHorizontalScroll(page);
    });

    for (const a of SEED.attacks) {
      const want = EXPECTED[a.id]!;
      await t.step(`${a.id}: submit, then the card and the review show the catching evidence`, async () => {
        await page.goto('/admin/demo');
        const card = page.getByTestId(`attack-${a.id}`);
        const submit = card.getByRole('button', { name: /^Submit/ });
        if (await submit.count()) {
          await expect(card.getByRole('button')).toHaveCount(1); // one pill per card
          await submit.click();
        }
        const result = card.getByTestId('attack-result');
        await expect(result).toBeVisible({ timeout: 60_000 });
        await expect(result.locator('[data-verdict]')).toHaveAttribute('data-verdict', want.verdict);
        await expect(result.locator('[data-verdict]')).toHaveText(want.verdict); // the system state, on an admin surface
        for (const e of want.evidence) await expect(card.getByTestId('attack-evidence')).toContainText(e);
        await expect(card.getByTestId('attack-evidence')).toHaveAttribute('data-check', a.expected.check);

        await card.getByRole('link', { name: 'Open its review' }).click();
        await expect(page).toHaveURL(/\/admin\/review\/VR-[0-9A-Z]{12}$/);
        const main = page.getByRole('main');
        for (const e of want.evidence) await expect(main.getByText(e, { exact: false }).first()).toBeVisible();
        await expect(main.locator(`[data-verdict="${want.verdict}"]`).first()).toBeVisible();
        await noHorizontalScroll(page);
      });
    }
  } finally {
    writeTimings(info, 'demo-attacks', t.steps, t.totalMs());
  }
});

test('/admin/demo is admin only: a buyer is sent to their own home', async ({ page }) => {
  await signInAs(page, 'buyer');
  await page.goto('/admin/demo');
  await expect(page).toHaveURL(/\/buyer$/);
});
