import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { SEED_PASSWORD, signIn } from './helpers/auth';
import { seedEnrolment } from './helpers/enrolment';
import { query } from './helpers/tracer';
import { axeOn } from './helpers/axe';

// TSK-05.7: the admin Phones page. Issue a code (visible once, not retrievable after a reload), revoke a
// phone behind a confirm sheet (the revocation is anchored), assign a plot; no horizontal scroll at any
// project viewport (320, 375, 768, 1440; TC-080) and no serious axe violations (TC-081).


async function noHorizontalScroll(page: Page) {
  // Against the project's viewport, not innerWidth: an emulated phone widens its layout viewport to fit
  // overflowing content, so innerWidth alone would hide the overflow.
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
}

async function noSeriousAxeViolations(page: Page) {
  const { violations } = await (await axeOn(page)).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
}

test.describe('/admin/phones (TKT-05)', () => {
  test('issue a code once, revoke a phone (anchored), assign a plot', async ({ page }) => {
    const seed = seedEnrolment({ enrol: true, plot: true }); // a fresh FPO: its admin, agent, phone and plot
    const agent = { id: seed.agentId, name: seed.agentName };
    await signIn(page, seed.adminEmail, SEED_PASSWORD);
    await page.goto('/admin/phones');
    await expect(page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Phones' })).toHaveAttribute('aria-current', 'page');
    const card = page.getByTestId(`agent-${agent.id}`);
    await expect(card.getByRole('heading', { name: agent.name })).toBeVisible();
    await noHorizontalScroll(page);
    await noSeriousAxeViolations(page);

    // Issue code: shown once, with its expiry; only its hash is stored
    await card.getByRole('button', { name: 'Issue code' }).click();
    const shown = card.getByTestId('issued-code');
    await expect(shown).toHaveText(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    const code = (await shown.textContent())!;
    await expect(card.getByText(/Works once, until .* IST/)).toBeVisible();
    const hash = createHash('sha256').update(code).digest('hex');
    expect(await query('SELECT agent_id FROM enrollment_codes WHERE code_hash = ?', [hash])).toEqual([expect.objectContaining({ agent_id: agent.id })]);
    await noHorizontalScroll(page);
    await page.reload();
    await expect(page.getByTestId(`agent-${agent.id}`)).toBeVisible();
    await expect(page.getByTestId('issued-code')).toHaveCount(0);
    expect(await page.content()).not.toContain(code);

    // Revoke: a confirm sheet says it is permanent and recorded; the revocation is anchored
    const row = page.getByTestId(`phone-${seed.deviceId}`);
    await row.getByRole('button', { name: `Revoke ${seed.deviceId}` }).click();
    const sheet = page.getByRole('dialog', { name: `Revoke ${seed.deviceId}?` });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('permanent and recorded in the ledger');
    await noHorizontalScroll(page);
    await sheet.getByRole('button', { name: 'Revoke this phone' }).click();
    await expect(sheet).toBeHidden();
    await expect(row.getByText('Revoked', { exact: true })).toBeVisible();
    const [dev] = await query<{ revoked_at: string | null }>('SELECT revoked_at FROM devices WHERE id = ?', [seed.deviceId!]);
    expect(dev!.revoked_at).not.toBeNull();
    const revocations = await query<{ payload: string }>(`SELECT payload FROM ledger_entries WHERE kind = 'device_revoked' AND json_extract(payload, '$.deviceId') = ?`, [seed.deviceId!]);
    expect(revocations.map((r) => JSON.parse(r.payload))).toEqual([{ deviceId: seed.deviceId, revokedAt: dev!.revoked_at }]);

    // Assign a plot
    await card.getByLabel('Add a plot').selectOption(seed.plotId!);
    await card.getByRole('button', { name: 'Assign' }).click();
    await expect(card.getByTestId(`assigned-${agent.id}-${seed.plotId}`)).toBeVisible();
    const live = await query('SELECT agent_id FROM agent_plots WHERE agent_id = ? AND plot_id = ? AND revoked_at IS NULL', [agent.id, seed.plotId!]);
    expect(live).toHaveLength(1);
    await noHorizontalScroll(page);

    // …and remove it again
    await card.getByRole('button', { name: `Remove ${seed.plotId} from ${agent.name}` }).click();
    await expect(card.getByTestId(`assigned-${agent.id}-${seed.plotId}`)).toHaveCount(0);
  });

  test('loading, empty and error states are reachable and have no horizontal scroll', async ({ page }) => {
    await signIn(page, seedEnrolment().adminEmail, SEED_PASSWORD);
    await page.goto('/admin/phones?state=loading');
    await expect(page.getByTestId('phones-loading')).toBeVisible();
    await noHorizontalScroll(page);
    await page.goto('/admin/phones?state=empty');
    await expect(page.getByTestId('phones-empty')).toContainText('No agents yet');
    await noHorizontalScroll(page);
    await page.goto('/admin/phones?state=error');
    await expect(page.getByTestId('phones-error')).toContainText('Nothing is lost');
    await noHorizontalScroll(page);
    await noSeriousAxeViolations(page);
  });

  test('an agent cannot open the Phones page (redirected to their own home)', async ({ page }) => {
    await signIn(page, seedEnrolment().agentEmail, SEED_PASSWORD);
    await page.goto('/admin/phones');
    await expect(page).toHaveURL(/\/field$/);
  });
});
