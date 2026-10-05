import { execFileSync } from 'node:child_process';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_ACCOUNTS, SEED_PASSWORD, seedAccounts, signIn } from './helpers/auth';
import type { SeededReview } from './helpers/seed-review';
import { E2E_DATA_DIR } from './helpers/tracer';

// TKT-12 (TASK-13): the admin review queue and detail ported from final/admin.html — TC-054 (queue,
// detail, four states, 768 px list → detail, ≥ 1100 px side by side), TC-055/EVAL-075 (the reasoned,
// signed decision), TC-056/EVAL-076 (a hard-failed run offers no override), EVAL-088 (admin states),
// TC-080 (no horizontal scroll) and TC-081 (axe) on every state. Each Playwright project is one viewport
// (320, 375, 768, 1440); each test seeds its own FPO (e2e/helpers/seed-review.ts).

test.beforeAll(() => seedAccounts());

function seedReview(): SeededReview {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', DATA_DIR: E2E_DATA_DIR, LOG_LEVEL: 'silent' };
  delete env.DATABASE_URL;
  const out = execFileSync('./node_modules/.bin/tsx', ['e2e/helpers/seed-review.ts'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out.trim().split('\n').pop()!) as SeededReview;
}

async function checkSurface(page: Page) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1100;
const queue = (page: Page) => page.getByRole('list', { name: 'Waiting for a person' });
const item = (page: Page, runId: string) => page.locator(`a.q-item[data-run="${runId}"]`);

test.describe('admin review queue (TSK-12.2, TC-054, EVAL-088)', () => {
  test('lists the waiting pickings oldest first with headline, score and time, and the final ones apart', async ({ page }) => {
    const s = seedReview();
    await signIn(page, s.adminEmail, s.testOnlyAdminPassword);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('3 Pickings to check');
    await expect(page.getByText(`${s.orgName} · Review`)).toBeVisible();

    const rows = queue(page).locator('a.q-item');
    await expect(rows).toHaveCount(3);
    expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-run')))).toEqual([s.cloudy, s.outside, s.harvest]);
    await expect(item(page, s.cloudy)).toContainText('38.5 kg');
    await expect(item(page, s.cloudy)).toContainText('Satellite picture cloudy · score 100');
    await expect(item(page, s.cloudy)).toContainText(/waiting 4 days/);
    await expect(item(page, s.outside)).toContainText('Taken outside the plot');
    await expect(item(page, s.harvest)).toContainText('Harvest high for this plot');

    await expect(page.getByRole('heading', { level: 2, name: 'Not accepted by the checks (1)' })).toBeVisible();
    await expect(page.getByText("Shown so you can answer the farmer. These can't be changed.")).toBeVisible();
    await expect(item(page, s.final)).toContainText('Not accepted · Photo already used');

    // the rail's Review count equals the waiting list
    await expect(page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: /^Review\s*, 3 waiting$/ })).toHaveAttribute('aria-current', 'page');
    if (isDesktop(page)) await expect(page.getByText('Pick an item to see its photos, plot and all 12 checks.')).toBeVisible();
    await checkSurface(page);
  });

  test('loading, empty and error states on the queue and on a detail (TC-081 all four states)', async ({ page }) => {
    test.setTimeout(120_000); // six axe scans
    const s = seedReview();
    await signIn(page, s.adminEmail, s.testOnlyAdminPassword);
    for (const base of ['/admin', `/admin/review/${s.cloudy}`]) {
      await page.goto(`${base}?state=loading`);
      await expect(page.getByRole('status')).toContainText('Loading the review list…');
      await expect(page.locator('.sk-row')).toHaveCount(4);
      await checkSurface(page);

      await page.goto(`${base}?state=empty`);
      await expect(page.getByRole('heading', { level: 2, name: 'Nothing to check.' })).toBeVisible();
      await expect(page.getByText('New items appear here when a picking needs a person to look.')).toBeVisible();
      await checkSurface(page);

      await page.goto(`${base}?state=error`);
      const alert = page.getByRole('alert').filter({ hasText: "Couldn't load the review list." });
      await expect(alert).toContainText('Nothing was changed.');
      await expect(alert.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/admin');
      await checkSurface(page);
    }
    await page.getByRole('link', { name: 'Try again' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(queue(page).locator('a.q-item')).toHaveCount(3);
  });
});

test.describe('review detail (TSK-12.3, TC-054)', () => {
  test('shows the title, score with its scale and cap reason, plot card, photos and all 12 checks with evidence', async ({ page }) => {
    const s = seedReview();
    await signIn(page, s.adminEmail, s.testOnlyAdminPassword);
    await item(page, s.cloudy).click();
    await expect(page).toHaveURL(new RegExp(`/admin/review/${s.cloudy}$`));

    const detail = page.locator('section.detail');
    await expect(detail.getByRole('heading', { level: 2 })).toContainText('38.5 kg ·');
    await expect(detail.locator('.d-title .vchip')).toHaveText('Needs a check');
    await expect(detail.locator('.d-meta')).toContainText(/Recorded .* on phone DV-.* · waiting 4 days/);
    await expect(detail.locator('.score-line')).toHaveText('Score 100 of 100 · Needs a check');
    await expect(detail.locator('.scale-key')).toHaveText('0–49 Not accepted50–79 Needs a check80+ Verified');
    await expect(detail.getByTestId('why')).toHaveText('Why a person needs to look: A satellite check could not run, so a person must look.');

    const map = detail.getByTestId('review-map');
    await expect(map).toHaveAttribute('aria-label', /The dot showing where the phone was is \d+ metres inside the glowing plot line\./);
    await expect(map.getByTestId('phone-dot')).toHaveCount(1);
    await expect(map.locator('.m-band')).toHaveAttribute('data-margin-m', '25');
    await expect(detail.locator('.plot-say')).toContainText(/Taken \d+ m inside PL-/);

    const imgs = detail.locator('.ph-grid img');
    await expect(imgs).toHaveCount(3);
    for (const img of await imgs.all()) {
      await expect(img).toHaveAttribute('src', /^\/api\/media\/ME-[0-9A-Z]+\/thumb$/);
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }

    await expect(detail.getByRole('heading', { level: 3, name: 'All 12 checks' })).toBeVisible();
    await expect(detail.locator('.checks-sum')).toHaveText("11 passed · 1 couldn't run");
    const checks = detail.locator('ol.checks > li');
    await expect(checks).toHaveCount(12);
    await expect(checks.first()).toContainText("Couldn't run");
    await expect(checks.first()).toContainText('Satellite view this month');
    await expect(checks.first()).toContainText('Satellite view blocked by cloud for ±30 days (demo data)'); // system words, demo label kept
    await expect(detail.locator('li[data-check="geofence"]')).toContainText('Passed');

    if (isDesktop(page)) {
      // rail + queue + detail side by side
      await expect(queue(page)).toBeVisible();
      await expect(item(page, s.cloudy)).toHaveAttribute('aria-current', 'true');
      await expect(detail.getByRole('link', { name: 'Back to list' })).toBeHidden();
    } else {
      // < 1100 px: the detail alone, with Back to the list
      await expect(queue(page)).toBeHidden();
      await detail.getByRole('link', { name: 'Back to list' }).click();
      await expect(page).toHaveURL(/\/admin$/);
      await expect(queue(page)).toBeVisible();
      await item(page, s.cloudy).click();
      await expect(page).toHaveURL(new RegExp(`/admin/review/${s.cloudy}$`));
    }
    await checkSurface(page);
  });

  test('keyboard: Tab follows the visual order to Accept, Not accepted, Check again, with a visible focus ring (TC-081)', async ({ page }) => {
    const s = seedReview();
    await signIn(page, s.adminEmail, s.testOnlyAdminPassword);
    await page.goto(`/admin/review/${s.cloudy}`);
    await expect(page.locator('section.detail .d-title')).toBeVisible();
    expect(await page.locator('[tabindex]').evaluateAll((els) => els.filter((e) => Number(e.getAttribute('tabindex')) > 0).length)).toBe(0);

    type Stop = { key: string; inDetail: boolean; inActions: boolean; y: number; x: number; ring: boolean };
    const stops: Stop[] = [];
    for (let i = 0; i < 80 && stops.at(-1)?.key !== '#btn-again'; i++) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate((): Stop | null => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        // the layout position inside the element's scrolling column, so scrolling to it does not move it
        let scrolled = 0;
        for (let p = el.parentElement; p; p = p.parentElement) scrolled += p.scrollTop;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          // a scrolling column is a Tab stop of its own in Chromium (keyboard-focusable scrollers)
          key: el.id ? `#${el.id}` : (el.getAttribute('href') ?? `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`),
          inDetail: !!el.closest('section.detail'),
          inActions: !!el.closest('.d-actions'),
          y: Math.round(r.top + scrolled),
          x: Math.round(r.left),
          ring: el.matches(':focus-visible') && cs.outlineStyle === 'solid' && parseFloat(cs.outlineWidth) >= 2,
        };
      });
      if (!stop) break;
      stops.push(stop);
    }
    const detail = stops.filter((st) => st.inDetail);
    // the decision controls close the detail's order, in their visual order (TC-081)
    expect(detail.slice(-3).map((st) => st.key)).toEqual(['#btn-accept', '#btn-reject', '#btn-again']);
    expect(detail.slice(0, -3).some((st) => st.inActions)).toBe(false);
    // Back to list is the detail's first link below 1100 px
    if (!isDesktop(page)) expect(detail.find((st) => st.key.startsWith('/'))?.key).toBe('/admin');
    // inside the scrolling body, each stop is below (or on the same row and right of) the one before
    const body = detail.filter((st) => !st.inActions);
    for (let i = 1; i < body.length; i++) {
      const [a, b] = [body[i - 1]!, body[i]!];
      expect(b.y > a.y || (b.y === a.y && b.x > a.x), `${a.key} → ${b.key}`).toBe(true);
    }
    // every stop shows the focus ring
    expect(stops.filter((st) => !st.ring).map((st) => st.key)).toEqual([]);
  });

  test('another organisation’s picking is a 404', async ({ page }) => {
    const s = seedReview();
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
    const res = await page.goto(`/admin/review/${s.cloudy}`);
    expect(res?.status()).toBe(404);
  });
});

test.describe('decisions (TSK-12.4, TSK-12.6, TC-055, TC-056, EVAL-075, EVAL-076)', () => {
  test('accept needs a public-safe reason of 10 characters; the outcome is recorded and the item leaves the queue', async ({ page }) => {
    test.setTimeout(90_000);
    const s = seedReview();
    await signIn(page, s.adminEmail, s.testOnlyAdminPassword);
    await page.goto(`/admin/review/${s.cloudy}`);

    await page.locator('#btn-accept').click();
    const form = page.locator('form.decide');
    await expect(form.getByRole('heading', { level: 3 })).toHaveText('Accept as verified');
    const reason = form.getByLabel('Reason (at least 10 characters)');
    await expect(reason).toBeFocused();
    await expect(form.locator('.cnt')).toHaveText('0 of at least 10 characters');
    await expect(form.locator('.dec-note')).toHaveText(
      'Your decision is signed with your account and recorded permanently. The reason is shown on the public certificate.',
    );
    const confirm = form.getByRole('button', { name: 'Confirm: accept as verified' });
    await expect(confirm).toBeDisabled();
    await reason.fill('Too short');
    await expect(form.locator('.cnt')).toHaveText('9 of at least 10 characters');
    await expect(confirm).toBeDisabled();
    await checkSurface(page);

    await reason.fill('Farmer confirmed on 98450 12345');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(form.getByRole('alert')).toHaveText('Take out the phone number: the reason is shown on the public certificate.');

    await reason.fill('Clear sky photo checked by the office in person');
    await expect(form.locator('.cnt')).toHaveText('47 characters · ready to confirm');
    await confirm.click();

    const outcome = page.getByTestId('outcome');
    await expect(outcome).toBeVisible();
    await expect(outcome).toContainText('Accepted as verified');
    await expect(outcome).toContainText('Recorded');
    await expect(outcome.locator('blockquote')).toHaveText('Clear sky photo checked by the office in person');
    await expect(outcome).toBeFocused();
    await expect(page.getByTestId('live')).toContainText('Recorded: accepted as verified.');
    await expect(outcome.getByRole('link', { name: 'Next picking (2 left)' })).toBeVisible();
    await expect(page.locator('.d-title .vchip')).toHaveText('Verified');
    await checkSurface(page);

    await page.goto('/admin');
    await expect(queue(page).locator('a.q-item')).toHaveCount(2);
    await expect(item(page, s.cloudy)).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('2 Pickings to check');
  });

  test('a hard-failed rejection shows the locked line and no accept, reject or check-again control', async ({ page }) => {
    const s = seedReview();
    await signIn(page, s.adminEmail, s.testOnlyAdminPassword);
    await page.goto(`/admin/review/${s.final}`);
    await expect(page.locator('.d-title .vchip')).toHaveText('Not accepted');
    await expect(page.getByTestId('why')).toContainText("Why it was not accepted: “Photos are new” failed. This rule always means Not accepted and can’t be overruled.");
    await expect(page.getByTestId('locked')).toHaveText("This one can't be changed: “Photos are new” failed (1 of 1 photos seen before).");
    for (const id of ['#btn-accept', '#btn-reject', '#btn-again']) await expect(page.locator(id)).toHaveCount(0);
    await expect(page.locator('form.decide')).toHaveCount(0);
    await checkSurface(page);
  });

  test('a batched picking explains that its result is fixed and offers no accept, reject or check-again control (EXE16)', async ({ page }) => {
    const s = seedReview();
    await signIn(page, s.adminEmail, s.testOnlyAdminPassword);
    await page.goto(`/admin/review/${s.batched}`);
    await expect(page.locator('.d-title .vchip')).toHaveText('Verified');
    await expect(page.getByTestId('locked')).toHaveText(`This picking is in batch ${s.batchId}. Its result was fixed when the batch was made, so it can't be checked again or changed.`);
    for (const id of ['#btn-accept', '#btn-reject', '#btn-again']) await expect(page.locator(id)).toHaveCount(0);
    await expect(page.locator('form.decide')).toHaveCount(0);
    await checkSurface(page);
  });

  test('the Sign out pill keeps the queue column’s width in the empty and error states', async ({ page }) => {
    const s = seedReview();
    await signIn(page, s.adminEmail, s.testOnlyAdminPassword);
    for (const state of ['empty', 'error']) {
      await page.goto(`/admin?state=${state}`);
      const pill = page.locator('.q-foot').getByRole('button', { name: 'Sign out' });
      await expect(pill).toBeVisible();
      const width = (await pill.boundingBox())!.width;
      expect(width, state).toBeLessThanOrEqual(360);
    }
  });

  test('"Check again" is off with nothing to retry, and re-runs the check that could not run', async ({ page }) => {
    test.setTimeout(90_000);
    const s = seedReview();
    await signIn(page, s.adminEmail, s.testOnlyAdminPassword);
    await page.goto(`/admin/review/${s.outside}`);
    await expect(page.locator('#btn-again')).toBeDisabled();
    await expect(page.locator('.again-hint')).toHaveText('All checks ran — nothing to retry');

    await page.goto(`/admin/review/${s.cloudy}`);
    await expect(page.locator('.again-hint')).toHaveText('Check again runs “Satellite view this month” again.');
    await page.locator('#btn-again').click();
    await expect(page).not.toHaveURL(new RegExp(`/admin/review/${s.cloudy}$`), { timeout: 30_000 });
    await expect(page.locator('.d-meta')).toContainText('check 2, run again');
    await expect(page.locator('li[data-check="ndvi_harvest_window"]')).not.toHaveAttribute('data-status', 'unavailable');
    await checkSurface(page);
  });
});
