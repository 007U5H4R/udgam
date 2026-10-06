import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { DEMO_ACCOUNTS, SEED_PASSWORD, seedAccounts, signIn } from './helpers/auth';
import { openField, seedCaptureWorld } from './helpers/capture';
import { seedEnrolment } from './helpers/enrolment';
import type { SeededAgreements } from './helpers/seed-agreements';
import type { SeededBatches } from './helpers/seed-batches';
import type { SeededProcessing } from './helpers/seed-processing';
import type { SeededReview } from './helpers/seed-review';
import { stubTiles } from './helpers/stubs';
import { E2E_DATA_DIR } from './helpers/tracer';
import { axeOn } from './helpers/axe';

// Stage 8 office fixes (docs/exec/stage8/stage8-office.md): the office shell around every admin, buyer and
// processor screen. DES-105: Sign out on every office screen (the rail foot on tablet and desktop, the end
// of the screen on phones, the list column's foot for the buyer), exactly one visible at a time.

test.describe.configure({ timeout: 120_000 });

test.beforeAll(() => seedAccounts());

/** Run one of the e2e seed scripts against the e2e database and return its JSON result. */
function runSeed<T>(script: string, args: string[] = []): T {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'test', DATA_DIR: E2E_DATA_DIR, LOG_LEVEL: 'silent' };
  delete env.DATABASE_URL;
  const out = execFileSync('./node_modules/.bin/tsx', [script, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out.trim().split('\n').pop()!) as T;
}

const phone = (page: Page) => (page.viewportSize()?.width ?? 0) < 700;

async function axeClean(page: Page) {
  const { violations } = await (await axeOn(page)).analyze();
  expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
}

/** Exactly one visible Sign out, in the rail foot (≥ 700 px) or at the end of the screen (phones). */
async function oneSignOut(page: Page, where: string, maxWidth = 360) {
  const out = page.getByRole('button', { name: 'Sign out' });
  await expect(out, where).toHaveCount(1);
  await expect(out, where).toBeVisible();
  if (!phone(page) && (await page.getByRole('navigation', { name: 'Admin sections' }).count())) {
    await expect(page.getByRole('navigation', { name: 'Admin sections' }).getByRole('button', { name: 'Sign out' }), where).toBeVisible();
  }
  const box = (await out.boundingBox())!;
  expect(box.width, where).toBeLessThanOrEqual(maxWidth);
  expect(box.height, where).toBeGreaterThanOrEqual(48);
}

test.describe('DES-105 Sign out on every office screen', () => {
  test('admin: every rail section, the demo-free lists, and the forced states', async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
    for (const path of ['/admin', '/admin?state=empty', '/admin?state=error', '/admin/plots', '/admin/plots/new', '/admin/batches', '/admin/batches/new', '/admin/phones', '/admin/agreements']) {
      await page.goto(path);
      await oneSignOut(page, path);
    }
    await axeClean(page);
  });

  test('admin: Sign out from a screen that had none ends the session', async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
    await page.goto('/admin/phones');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto('/admin/phones');
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('buyer: batches and agreements', async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.buyerA.email, SEED_PASSWORD);
    for (const path of ['/buyer', '/buyer/agreements', '/buyer/agreements/new']) {
      await page.goto(path);
      await oneSignOut(page, path, 760); // the buyer's list column pill (unchanged on Batches), or the detail's end
    }
    await axeClean(page);
  });

  // The buyer has no rail: Sign out sits at the foot of the list column, which a detail that is the whole
  // screen (< 1100 px) hides. There the detail ends with its own ghost pill instead (as RailShell's phone
  // footer does); side by side (≥ 1100 px) only the list's shows.
  test('buyer: a detail that is the whole screen ends with Sign out', async ({ page }) => {
    const b = runSeed<SeededBatches>('e2e/helpers/seed-batches.ts', ['--transfer-to', 'ORG-BUYER-A']);
    const a = runSeed<SeededAgreements>('e2e/helpers/seed-agreements.ts');
    const narrow = (page.viewportSize()?.width ?? 0) < 1100;
    const inDetail = async (where: string) => {
      const out = page.getByRole('button', { name: 'Sign out' });
      const detailOut = page.locator('section.detail, section[aria-labelledby="d-h"]').getByRole('button', { name: 'Sign out' });
      await oneSignOut(page, where, narrow ? 360 : 760);
      await expect(detailOut, where).toHaveCount(narrow ? 1 : 0);
      if (narrow) {
        // the last thing on the screen: nothing in the detail sits below it
        const below = await out.evaluate((btn) => {
          const end = btn.getBoundingClientRect().bottom;
          return [...btn.closest('section')!.querySelectorAll('h2, h3, p, a, button, li')].filter((el) => el !== btn && el.getBoundingClientRect().top >= end).length;
        });
        expect(below, where).toBe(0);
      }
    };

    await signIn(page, DEMO_ACCOUNTS.buyerA.email, SEED_PASSWORD);
    await page.goto(`/buyer/batches/${b.batch!.batchId}`);
    await expect(page.getByRole('heading', { level: 2, name: b.batch!.batchId })).toBeVisible();
    await inDetail('buyer batch detail');
    await axeClean(page);

    await page.context().clearCookies();
    await signIn(page, a.buyerEmail, a.testOnlyPassword);
    for (const id of [a.created.id, a.released.id]) {
      await page.goto(`/buyer/agreements/${id}`);
      await inDetail(`buyer agreement ${id}`);
    }
    await page.goto('/buyer/agreements/new');
    await inDetail('buyer new agreement');
    await axeClean(page);

    // and it ends the session from the detail
    await page.goto(`/buyer/agreements/${a.created.id}`);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto(`/buyer/agreements/${a.created.id}`);
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  // DES-117: an open review or processor detail hides the phone tab bar and its pill (so the sticky
  // decision bar sits at the bottom edge); below 700 px the detail ends with its own Sign out instead, clear
  // of that bar. From 700 px the rail foot carries the one Sign out.
  test('admin review and processor details end with Sign out on phones', async ({ page }) => {
    const r = runSeed<SeededReview>('e2e/helpers/seed-review.ts');
    const p = runSeed<SeededProcessing>('e2e/helpers/seed-processing.ts', ['--to-processor', DEMO_ACCOUNTS.processorA.orgId]);
    const atEnd = async (where: string) => {
      await oneSignOut(page, where);
      if (!phone(page)) return;
      const out = page.getByRole('button', { name: 'Sign out' });
      await expect(page.locator('section.detail').getByRole('button', { name: 'Sign out' }), where).toHaveCount(1);
      // nothing in the detail's body comes after it, and the sticky bar never covers it
      const below = await out.evaluate((btn) => {
        const end = btn.getBoundingClientRect().bottom;
        return [...btn.closest('.d-body')!.querySelectorAll('h2, h3, p, a, button, li')].filter((el) => el !== btn && el.getBoundingClientRect().top >= end).length;
      });
      expect(below, where).toBe(0);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(out, where).toBeInViewport();
      const hit = await out.evaluate((btn) => {
        const b = btn.getBoundingClientRect();
        const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return at === btn || btn.contains(at);
      });
      expect(hit, where).toBe(true);
    };

    await signIn(page, r.adminEmail, r.testOnlyAdminPassword);
    for (const id of [r.outside, r.final]) {
      await page.goto(`/admin/review/${id}`);
      await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
      await atEnd(`review ${id}`);
    }
    await page.goto('/admin');
    await oneSignOut(page, 'queue'); // the queue alone still has exactly one
    await axeClean(page);

    await page.context().clearCookies();
    await signIn(page, DEMO_ACCOUNTS.processorA.email, SEED_PASSWORD);
    await page.goto(`/processor/batches/${p.batchId}`);
    await expect(page.getByRole('heading', { level: 2, name: p.batchId })).toBeVisible();
    await atEnd('processor batch detail');
    await axeClean(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('processor: the batch list', async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.processorA.email, SEED_PASSWORD);
    for (const path of ['/processor', '/processor?state=empty']) {
      await page.goto(path);
      await oneSignOut(page, path);
    }
    await axeClean(page);
  });
});

/** The shared not-found card (DES-104, DES-011): a 404 on the dark ground, an h1 in a main, a way home. */
async function styledNotFound(page: Page, url: string, o: { title: string; back: string; href: string }) {
  const res = await page.goto(url);
  expect(res!.status(), url).toBe(404);
  const card = page.getByTestId('not-found');
  await expect(card, url).toBeVisible();
  await expect(page.getByRole('main').getByRole('heading', { level: 1 }), url).toHaveText(o.title);
  await expect(card.getByRole('link', { name: o.back }), url).toHaveAttribute('href', o.href);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg, url).not.toBe('rgb(255, 255, 255)');
  // A nested not-found keeps its route's title (Next resolves the page's metadata); an unmatched URL gets its own.
  if (url === '/no-such-page') await expect(page, url).toHaveTitle('Not found · Udgam');
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, url).toBeLessThanOrEqual(page.viewportSize()!.width);
  const { violations } = await (await axeOn(page)).analyze();
  // serious/critical, plus the moderate landmark and heading rules Next's default 404 failed
  expect(
    violations.filter((v) => v.impact === 'serious' || v.impact === 'critical' || ['landmark-one-main', 'region', 'page-has-heading-one'].includes(v.id)).map((v) => v.id),
    url,
  ).toEqual([]);
}

const PAGE = 'We can’t find that page.';

test.describe('DES-104 / DES-011 one styled not-found', () => {
  // DES-115: a bad batch, plot or review link goes back to its own list, and the rail marks that section.
  test('admin: unknown batch, run and plot inside the shell, back to their own list; any unknown URL', async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
    for (const [url, back, href, section] of [
      ['/admin/batches/B-NOPE0000', 'Back to Batches', '/admin/batches', 'Batches'],
      ['/admin/review/VR-NOPE00000000', 'Back to Review', '/admin', 'Review'],
      ['/admin/plots/PL-NOPE0000', 'Back to Plots', '/admin/plots', 'Plots'],
    ] as const) {
      await styledNotFound(page, url, { title: PAGE, back, href });
      await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(1);
      const rail = page.getByRole('navigation', { name: 'Admin sections' });
      await expect(rail.locator('a[aria-current="page"]'), url).toHaveCount(1);
      await expect(rail.locator('a[aria-current="page"]'), url).toHaveText(section);
    }
    await page.getByRole('link', { name: 'Back to Plots' }).click();
    await expect(page).toHaveURL(/\/admin\/plots$/);
    await styledNotFound(page, '/no-such-page', { title: PAGE, back: 'Go to your home screen', href: '/' });
    await page.getByRole('link', { name: 'Go to your home screen' }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('buyer and processor: unknown batch, back to Batches', async ({ page }) => {
    await signIn(page, DEMO_ACCOUNTS.buyerA.email, SEED_PASSWORD);
    await styledNotFound(page, '/buyer/batches/B-NOPE0000', { title: PAGE, back: 'Back to Batches', href: '/buyer' });
    await page.context().clearCookies();
    await signIn(page, DEMO_ACCOUNTS.processorA.email, SEED_PASSWORD);
    await styledNotFound(page, '/processor/batches/B-NOPE0000', { title: PAGE, back: 'Back to Batches', href: '/processor' });
  });

  test('signed out: an unknown URL is styled and goes to sign-in', async ({ page }) => {
    await styledNotFound(page, '/no-such-page', { title: PAGE, back: 'Go to your home screen', href: '/' });
    await page.getByRole('link', { name: 'Go to your home screen' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('field: a missing picking says so, keeps the tab bar and goes back to Pickings', async ({ page, context }) => {
    const seed = seedCaptureWorld();
    await openField(page, context, seed);
    await styledNotFound(page, '/field/pickings/EV-NOPE00000000', { title: 'We can’t find that picking.', back: 'Back to Pickings', href: '/field/pickings' });
    await expect(page.getByTestId('not-found')).toContainText('Your saved pickings are safe on this phone.');
    await expect(page.locator('nav').last()).toBeVisible();
    await page.getByRole('link', { name: 'Back to Pickings' }).click();
    await expect(page).toHaveURL(/\/field\/pickings$/);
  });
});

/** DES-103: the page has an h1 at every width (axe page-has-heading-one), and only one is exposed. */
async function oneH1(page: Page, where: string) {
  await expect(page.getByRole('heading', { level: 1 }), where).toHaveCount(1);
  const { violations } = await (await axeOn(page)).withRules(['page-has-heading-one']).analyze();
  expect(violations.map((v) => v.id), where).toEqual([]);
}

test.describe('DES-103 a detail that is the whole screen keeps an h1', () => {
  test('admin review, plot, plot new and batch details; the agreement skeleton', async ({ page }) => {
    const r = runSeed<SeededReview>('e2e/helpers/seed-review.ts');
    await signIn(page, r.adminEmail, r.testOnlyAdminPassword);
    await page.goto(`/admin/review/${r.outside}`);
    await oneH1(page, 'review detail');
    await page.goto(`/admin/batches/${r.batchId}`);
    await oneH1(page, 'batch detail');
    await page.goto('/admin/plots/new');
    await oneH1(page, 'plot new');
    await page.goto('/admin/plots');
    const href = (await page.locator('main a[href^="/admin/plots/PL-"]').first().getAttribute('href'))!;
    await page.goto(href);
    await oneH1(page, 'plot detail');
  });

  test('buyer batch detail and the agreement loading skeletons', async ({ page }) => {
    const b = runSeed<SeededBatches>('e2e/helpers/seed-batches.ts', ['--transfer-to', 'ORG-BUYER-A']);
    await signIn(page, DEMO_ACCOUNTS.buyerA.email, SEED_PASSWORD);
    await page.goto(`/buyer/batches/${b.batch!.batchId}`);
    await oneH1(page, 'buyer batch detail');
    await page.goto('/buyer/agreements/new?state=loading');
    await oneH1(page, 'new agreement loading');
    const a = runSeed<SeededAgreements>('e2e/helpers/seed-agreements.ts');
    await page.context().clearCookies();
    await signIn(page, a.buyerEmail, a.testOnlyPassword);
    await page.goto(`/buyer/agreements/${a.created.id}?state=loading`);
    await oneH1(page, 'agreement loading');
  });
});

test.describe('DES-110 one title pattern: "<Screen> <ID> · Udgam"', () => {
  test('lists and details on admin, buyer and processor', async ({ page }) => {
    const a = runSeed<SeededAgreements>('e2e/helpers/seed-agreements.ts');
    await signIn(page, a.ready.adminEmail, a.testOnlyPassword);
    for (const [path, title] of [
      ['/admin', 'Review · Udgam'],
      ['/admin/phones', 'Phones · Udgam'],
      ['/admin/plots', 'Plots · Udgam'],
      ['/admin/batches', 'Batches · Udgam'],
      [`/admin/agreements/${a.ready.id}`, `Agreement ${a.ready.id} · Udgam`],
      [`/admin/batches/${a.ready.batchId}`, `Batch ${a.ready.batchId} · Udgam`],
    ] as const) {
      await page.goto(path);
      await expect(page, path).toHaveTitle(title);
    }
    await page.context().clearCookies();
    await signIn(page, a.buyerEmail, a.testOnlyPassword);
    await page.goto(`/buyer/agreements/${a.released.id}`);
    await expect(page).toHaveTitle(`Agreement ${a.released.id} · Udgam`);
    await page.context().clearCookies();
    await signIn(page, DEMO_ACCOUNTS.processorA.email, SEED_PASSWORD);
    await page.goto('/processor');
    await expect(page).toHaveTitle('Batches · Udgam');
  });
});

test.describe('DES-106 the plot map controls meet the target and text floors', () => {
  test('zoom buttons are 48 px and the attribution is 13 px on Add a plot', async ({ page }) => {
    await stubTiles(page);
    await signIn(page, DEMO_ACCOUNTS.adminA.email, SEED_PASSWORD);
    await page.goto('/admin/plots/new');
    for (const name of ['Zoom in', 'Zoom out']) {
      const box = (await page.getByRole('button', { name }).or(page.getByRole('link', { name })).first().boundingBox())!;
      expect(box.width, name).toBeGreaterThanOrEqual(48);
      expect(box.height, name).toBeGreaterThanOrEqual(48);
    }
    const size = await page.locator('.leaflet-control-attribution').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(13);
  });
});

test.describe('DES-107 the batch builder has select all per crop and a plot filter', () => {
  test('select all Arabica, the other crop waits, clear; the plot filter hides rows but keeps choices', async ({ page }) => {
    const b = runSeed<SeededBatches>('e2e/helpers/seed-batches.ts');
    await signIn(page, b.adminEmail, b.testOnlyAdminPassword);
    await page.goto('/admin/batches/new');
    const n = b.arabica.length;
    const all = page.getByRole('button', { name: `Select all Arabica (${n})` });
    await all.click();
    await expect(page.getByRole('button', { name: /^Create batch · / })).toHaveText(new RegExp(`^Create batch · ${n} pickings · `));
    await expect(page.getByRole('button', { name: /^Select all Robusta/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Clear Arabica' }).click();
    await expect(page.getByRole('button', { name: 'Choose pickings' })).toBeDisabled();

    // a row without a reason line is no taller than its two lines need (was 96 px)
    const row = (await page.locator(`label[for="pick-${b.arabica[0]}"]`).boundingBox())!;
    if ((page.viewportSize()?.width ?? 0) >= 700) expect(row.height).toBeLessThan(96); // phones wrap the title and facts

    const filter = page.getByLabel('Plot', { exact: true });
    const options = await filter.locator('option').allTextContents();
    expect(options[0]).toBe(`All plots (${n + 1})`);
    await page.locator(`label[for="pick-${b.robusta}"]`).click();
    await filter.selectOption({ index: options.findIndex((o) => o.endsWith(`(${n})`)) });
    await expect(page.getByRole('status').filter({ hasText: 'Showing' })).toHaveText(`Showing ${n} of ${n + 1} pickings`);
    await expect(page.locator(`label[for="pick-${b.robusta}"]`)).toBeHidden();
    // the hidden Robusta choice still counts: the Arabica rows stay disabled and the pill still says 1 picking
    await expect(page.getByRole('button', { name: /^Create batch · 1 picking · / })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Select all Arabica/ })).toBeDisabled();
    await axeClean(page);
  });
});

test.describe('DES-108 each agent’s Phones and Plots sections are distinct landmarks', () => {
  test('the section names carry the agent’s name', async ({ page }) => {
    const seed = seedEnrolment({ enrol: true, plot: true });
    await signIn(page, seed.adminEmail, SEED_PASSWORD);
    await page.goto('/admin/phones');
    const card = page.getByTestId(`agent-${seed.agentId}`);
    await expect(card.getByRole('region', { name: `${seed.agentName} Phones`, exact: true })).toBeVisible();
    await expect(card.getByRole('region', { name: `${seed.agentName} Plots this agent records`, exact: true })).toBeVisible();
    const { violations } = await (await axeOn(page)).withRules(['landmark-unique']).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

test.describe('DES-111 the batch detail cards keep one 16 px rhythm', () => {
  test('score card → QR card → pickings card are 16 px apart', async ({ page }) => {
    const r = runSeed<SeededReview>('e2e/helpers/seed-review.ts');
    await signIn(page, r.adminEmail, r.testOnlyAdminPassword);
    await page.goto(`/admin/batches/${r.batchId}`);
    const gaps = await page.locator('[data-testid="batch-qr"]').evaluate((qr) => {
      const prev = qr.previousElementSibling!.getBoundingClientRect();
      const next = qr.nextElementSibling!.getBoundingClientRect();
      const me = qr.getBoundingClientRect();
      return [Math.round(me.top - prev.bottom), Math.round(next.top - me.bottom)];
    });
    expect(gaps).toEqual([16, 16]);
  });
});

test.describe('DES-113 the review decision buttons keep their words on one line', () => {
  test('Accept as verified, Not accepted and Check again are one line each', async ({ page }) => {
    const r = runSeed<SeededReview>('e2e/helpers/seed-review.ts');
    await signIn(page, r.adminEmail, r.testOnlyAdminPassword);
    await page.goto(`/admin/review/${r.cloudy}`);
    for (const id of ['#btn-accept', '#btn-reject', '#btn-again']) {
      const el = page.locator(id);
      await expect(el).toBeVisible();
      // one line of 16–18 px text in a 52–60 px pill; a wrapped label makes the pill taller
      const h = (await el.boundingBox())!.height;
      if ((page.viewportSize()?.width ?? 0) > 380) expect(h, id).toBeLessThanOrEqual(62);
      const fits = await el.evaluate((b) => b.scrollWidth <= b.clientWidth + 1);
      expect(fits, id).toBe(true);
    }
  });
});
