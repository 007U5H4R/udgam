import { expect, test } from '@playwright/test';
import { demoPhoto, openField, seedCaptureWorld, choosePhoto } from './helpers/capture';

// TSK-10.7 (s2 Photos, s3 Review) and TC-047 (GPS starts with the record flow; weak or denied location is
// reported plainly). The camera is the native file input (F4): accept="image/*" capture="environment",
// no gallery option; the tab bar is never shown inside the record flow (Design.md §5).

// Each test seeds its own world through a tsx child process; under parallel agents that alone can take
// many seconds, so the budget is wider than Playwright's 30 s default.
test.describe.configure({ timeout: 120_000 });

test.use({ viewport: { width: 375, height: 812 } });

test('a photo for "The branch" goes to review; Use this photo returns with 1 of 3; Take again reopens the camera', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await page.getByRole('button', { name: "Record today's picking" }).click();
  await expect(page).toHaveURL(/\/field\/record\?plot=/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Take up to 3 photos');
  await expect(page.locator('h1 .lit')).toHaveText('3 photos');
  await expect(page.getByTestId('need-one')).toHaveText('At least 1 photo is needed.');
  await expect(page.locator('.tabbar')).toHaveCount(0);

  const input = page.getByLabel('The branch');
  await expect(input).toHaveAttribute('type', 'file');
  await expect(input).toHaveAttribute('accept', 'image/*');
  await expect(input).toHaveAttribute('capture', 'environment');
  await expect(page.locator('input[type=file]:not([capture="environment"])')).toHaveCount(0);

  await choosePhoto(input, { name: 'branch.jpg', mimeType: 'image/jpeg', buffer: demoPhoto() });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Is the photo clear?');
  await expect(page.locator('.checklist li')).toHaveText(['It is in focus', 'The cherries can be seen', 'It is not too dark']);
  await expect(page.getByRole('img', { name: 'Your photo: The branch' })).toBeVisible();
  await expect(page.locator('.tabbar')).toHaveCount(0);

  // Take again opens the camera for the same slot
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Take again' }).click();
  await (await chooser).setFiles({ name: 'branch2.jpg', mimeType: 'image/jpeg', buffer: demoPhoto('branch-02.jpg') });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Is the photo clear?');

  await page.getByRole('button', { name: 'Use this photo' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Take up to 3 photos');
  await expect(page.getByTestId('photo-counter')).toHaveText('1 of 3');
  await expect(page.getByRole('button', { name: 'Continue with 1 photo' })).toBeVisible();
  await expect(page.locator('.slot[data-state="filled"] img')).toHaveCount(1);
  await expect(page.locator('.slot[data-state="next"]')).toContainText('Basket on the scale');
  await expect(page.locator('.tabbar')).toHaveCount(0);

  // "Open camera" opens the next slot's input
  const next = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open camera' }).click();
  expect((await next).element()).toBeTruthy();
});

test('TC-047 the GPS watch starts when /field/record mounts, with high accuracy', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await page.addInitScript(() => {
    const w = window as unknown as { __watchCalls: PositionOptions[] };
    w.__watchCalls = [];
    const real = navigator.geolocation.watchPosition.bind(navigator.geolocation);
    navigator.geolocation.watchPosition = (s, e, o) => {
      w.__watchCalls.push(o ?? {});
      return real(s, e, o);
    };
  });
  await page.goto(`/field/record?plot=${seed.plots[0]!.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Take up to 3 photos');
  const calls = await page.evaluate(() => (window as unknown as { __watchCalls: PositionOptions[] }).__watchCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ enableHighAccuracy: true });
});

test('TC-047 a 150 m fix shows "Move to open sky"; denied location shows how to allow it in two steps', async ({ page, context, browser }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed, { ...seed.plots[0]!.inside, accuracy: 150 });
  await page.goto(`/field/record?plot=${seed.plots[0]!.id}`);
  await expect(page.getByTestId('gps-line')).toHaveText('Move to open sky for a better location. You can still record.');

  const denied = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const p2 = await denied.newPage();
  await p2.addInitScript(() => {
    navigator.geolocation.watchPosition = (_s, e) => {
      setTimeout(() => e?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError), 50);
      return 1;
    };
  });
  await openField(p2, denied, seed);
  await p2.goto(`/field/record?plot=${seed.plots[0]!.id}`);
  const line = p2.getByTestId('gps-line');
  await expect(line).toContainText('Location is off. To allow it:');
  await expect(line.locator('ol li')).toHaveText(['Tap the lock icon next to the web address.', 'Choose Allow for Location, then come back to this page.']);
  await denied.close();
});

test('a plot that is not assigned to the agent goes back to Home', async ({ page, context }) => {
  const seed = seedCaptureWorld();
  await openField(page, context, seed);
  await page.goto('/field/record?plot=PL-NOTMINE1');
  await expect(page).toHaveURL(/\/field$/);
});

// CR-101 = DES-030 (Stage 8 re-run): in ಕನ್ನಡ at 320 px the slot names ("ತಕ್ಕಡಿಯ ಮೇಲಿನ ಬುಟ್ಟಿ") made the
// third slot wider than its track, so the grid reached x 323 on a 320 px screen. The tracks are
// minmax(0, 1fr) and the names wrap: no horizontal overflow, every slot inside the screen.
test.describe('photos step at 320 px in Kannada (CR-101, DES-030)', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('no horizontal overflow; all three slots and their names inside the screen', async ({ page, context }) => {
    const seed = seedCaptureWorld();
    await openField(page, context, seed);
    await context.addCookies([{ name: 'udgam_lang', value: 'kn', url: page.url() }]);
    await page.goto(`/field/record?plot=${seed.plots[0]!.id}`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'kn');
    await expect(page.locator('.slot')).toHaveCount(3);
    await expect(page.locator('.slot .s-name').nth(1)).toHaveText('ತಕ್ಕಡಿಯ ಮೇಲಿನ ಬುಟ್ಟಿ');
    const m = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      right: Array.from(document.querySelectorAll('.slot, .slot .s-name'), (el) => Math.ceil(el.getBoundingClientRect().right)),
    }));
    expect(m.scrollWidth).toBeLessThanOrEqual(320);
    expect(m.right.filter((r) => r > 320)).toEqual([]);
  });
});
