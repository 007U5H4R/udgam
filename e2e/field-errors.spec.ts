import { expect, test } from '@playwright/test';
import { openField, seedCaptureWorld } from './helpers/capture';

// TASK-12 fix round 1 (spec MAJOR 1) · EVAL-088 / TC-051: a server failure on /field/record,
// /field/help or /field/pickings/[eventId] shows the /field error boundary — what happened, that the
// saved pickings are safe on this phone, and a Try again control — in the agent's language, never Next's
// bare error page. `?state=throw` makes the page throw (dev and e2e builds only, route-state.ts).

test.describe.configure({ timeout: 120_000 });

const EN = { title: "Couldn't load your entries.", body: 'Your saved pickings are safe on this phone.', retry: 'Try again' };
const KN = { title: 'ನಿಮ್ಮ ದಾಖಲೆಗಳನ್ನು ತೆರೆಯಲಾಗಲಿಲ್ಲ.', body: 'ಉಳಿಸಿದ ಕೊಯ್ಲುಗಳು ಈ ಫೋನಿನಲ್ಲಿ ಸುರಕ್ಷಿತವಾಗಿವೆ.', retry: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ' };

test('EVAL-088: a thrown server error on record, help and the picking detail shows the recovery control', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['38.5:Verified'] });
  await openField(page, context, seed);
  const routes = [`/field/record?plot=${seed.plots[0]!.id}&state=throw`, '/field/help?state=throw', `/field/pickings/${seed.events[0]!.eventId}?state=throw`];
  for (const url of routes) {
    await page.goto(url);
    const alert = page.getByRole('alert');
    await expect(alert, url).toContainText(EN.title);
    await expect(alert, url).toContainText(EN.body);
    await expect(page.getByRole('link', { name: EN.retry }), url).toBeVisible();
  }

  // Try again renders the route afresh: without the forced throw, the detail page comes back.
  await page.goto(`/field/pickings/${seed.events[0]!.eventId}?state=throw`);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.goto(`/field/pickings/${seed.events[0]!.eventId}`);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('38.5 kg');
});

test('EVAL-088: the error boundary speaks the chosen language (ಕನ್ನಡ)', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['38.5:Verified'] });
  await openField(page, context, seed);
  await context.addCookies([{ name: 'udgam_lang', value: 'kn', url: page.url() }]);
  for (const url of [`/field/record?plot=${seed.plots[0]!.id}&state=throw`, '/field/pickings?state=throw', '/field?state=throw']) {
    await page.goto(url);
    const alert = page.getByRole('alert');
    await expect(alert, url).toContainText(KN.title);
    await expect(alert, url).toContainText(KN.body);
    await expect(page.getByRole('link', { name: KN.retry }), url).toBeVisible();
  }
});

test('Try again in the error boundary re-renders the failed route', async ({ page, context }) => {
  const seed = seedCaptureWorld({ events: ['38.5:Verified'] });
  await openField(page, context, seed);
  await page.goto('/field/help?state=throw');
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('link', { name: EN.retry }).click();
  // the forced throw is in the URL, so the route fails again: the boundary is shown afresh, still on /field/help
  await expect(page).toHaveURL(/\/field\/help\?state=throw$/);
  await expect(page.getByRole('alert')).toContainText(EN.title);
});
