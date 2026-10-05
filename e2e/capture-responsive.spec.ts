import { expect, test, type Locator, type Page } from '@playwright/test';
import { ownClientAddress } from './helpers/enrolment';
import { choosePhoto, demoPhoto, expectNoHorizontalScroll, seedCaptureWorld } from './helpers/capture';
import { signIn } from './helpers/auth';
import { mockGeolocation } from './helpers/stubs';

// EVAL-086 · the capture flow is usable at the case's viewports, mobile-375 (the `phone` project,
// 375 × 812) and tablet-768 (the `tablet` project, 768 × 1024). The real flow, end to end: a fresh phone
// enrols with a code from the office, the agent chooses a plot, adds two photos, enters the kilos,
// submits and reads the verdict. On every step:
//   - no horizontal page scroll (document scrollWidth ≤ the viewport width) and no zoom (scale 1);
//   - every visible interactive target is at least 24 × 24 CSS px (WCAG 2.2 SC 2.5.8, the case's
//     accessibility_requirement), and at least 48 px as Design.md §17 asks (the case follows Design.md
//     where it is stricter). Exempt inline links: none — the flow has no link inside a sentence.
//     Not targets: the visually hidden camera inputs (1 px, clip-path, tabindex -1), opened by "Open camera";
//   - the step's primary action lies inside the viewport and is not clipped or covered, without scrolling.
// The demo photos (assets/demo-photos) carry no EXIF time, so the photo line reads "2 new photos".
// On the verdict, the evidence text itself (each `.ev-t` and its text-bearing descendants) is inside the
// viewport width, not cut off or clipped, at ≥ 13 px (Design.md §12 "minimum 13 px anywhere"), so it
// reads without pinch-zoom.

test.describe.configure({ timeout: 180_000 });

/** The case's viewports, as Playwright projects (playwright.config.ts). */
const CASE_PROJECTS: Record<string, { width: number; height: number }> = { phone: { width: 375, height: 812 }, tablet: { width: 768, height: 1024 } };

/** WCAG 2.2 SC 2.5.8 Target Size (Minimum), CSS px. */
const MIN_TARGET = 24;
/** Design.md §17 "all ≥ 48 px": stricter, and the case follows Design.md where it is stricter (its notes). */
const DESIGN_MIN_TARGET = 48;
/** Design.md §12: no text under 13 px anywhere. */
const MIN_TEXT_PX = 13;
/** Inline links exempt from SC 2.5.8 (a link inside a sentence), as CSS selectors. None in the capture flow. */
const EXEMPT_INLINE: string[] = [];

type Target = { what: string; width: number; height: number };

/** Every visible interactive target on the page, measured; a visually hidden input is measured by its label. */
async function targets(page: Page): Promise<Target[]> {
  return page.evaluate((exempt) => {
    const sel = [
      'a[href]',
      'button',
      'input:not([type=hidden])',
      'select',
      'textarea',
      'summary',
      '[role=button]',
      '[role=link]',
      '[role=tab]',
      '[role=checkbox]',
      '[role=radio]',
      '[role=switch]',
      '[role=option]',
      '[role=menuitem]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const describe = (el: Element) => {
      const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
      const id = el.id ? `#${el.id}` : '';
      const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
      return `${el.tagName.toLowerCase()}${id}${cls} "${name}"`;
    };
    const out: { what: string; width: number; height: number }[] = [];
    const seen = new Set<Element>();
    for (const el of Array.from(document.querySelectorAll(sel))) {
      if (exempt.some((s) => el.matches(s))) continue;
      if (el.closest('[inert], [aria-hidden="true"]')) continue;
      if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      let target: Element = el;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) {
        // A visually hidden control: its target is the label around or for it. With no label and out of the
        // tab order (tabindex -1) it is no target at all: the native camera inputs (RecordFlow) have no hit
        // area (clip-path) and are opened only by the "Open camera" pill, which is measured itself.
        const label = el.closest('label') ?? (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null);
        if (!label && (el as HTMLElement).tabIndex < 0) continue;
        if (!label) {
          out.push({ what: `${describe(el)} (hidden, no label)`, width: r.width, height: r.height });
          continue;
        }
        target = label;
      }
      if (seen.has(target)) continue;
      seen.add(target);
      const t = target.getBoundingClientRect();
      out.push({ what: describe(target), width: Math.round(t.width * 100) / 100, height: Math.round(t.height * 100) / 100 });
    }
    return out;
  }, EXEMPT_INLINE);
}

/** Inside the viewport, and the element itself is what a tap at its centre and edges hits (not clipped or covered). */
async function expectInViewAndUnclipped(page: Page, action: Locator, name: string) {
  await expect(action, name).toBeVisible();
  const vp = page.viewportSize()!;
  const box = await action.boundingBox();
  expect(box, `${name} has a box`).not.toBeNull();
  const b = box!;
  expect(b.x, `${name} left`).toBeGreaterThanOrEqual(0);
  expect(b.y, `${name} top`).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width, `${name} right inside the viewport`).toBeLessThanOrEqual(vp.width);
  expect(b.y + b.height, `${name} bottom inside the viewport`).toBeLessThanOrEqual(vp.height);
  const hits = await action.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const inset = Math.min(r.height / 2, 8);
    const points = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + r.width / 2, r.top + 2],
      [r.left + r.width / 2, r.bottom - 2],
      [r.left + r.height / 2, r.top + r.height / 2],
      [r.right - r.height / 2, r.top + r.height / 2],
      [r.left + inset, r.top + r.height / 2],
    ];
    const missed = points.filter(([x, y]) => {
      const hit = document.elementFromPoint(x!, y!);
      return !hit || !(hit === el || el.contains(hit));
    });
    // No ancestor that clips its overflow cuts the element off.
    const clippers: string[] = [];
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const ar = a.getBoundingClientRect();
      if (r.left < ar.left - 0.5 || r.right > ar.right + 0.5 || r.top < ar.top - 0.5 || r.bottom > ar.bottom + 0.5) clippers.push(a.tagName.toLowerCase() + (a.className ? `.${String(a.className)}` : ''));
    }
    return { missed: missed.length, clippers };
  });
  expect(hits.missed, `${name}: every probe point hits the action`).toBe(0);
  expect(hits.clippers, `${name}: no clipping ancestor`).toEqual([]);
}

/**
 * The verdict evidence text itself (EvidenceList's `.ev-t` and every descendant that holds text, e.g. its
 * `small`), not the `li` around it: each visible (not display:none, visibility:hidden or opacity 0), at
 * ≥ 13 px, not cut off (`scrollWidth ≤ clientWidth` on block boxes), its box inside the viewport width, no
 * clip-path on it or an ancestor, and every non-empty text node drawing at least one line, each line inside
 * the viewport width and inside every ancestor that clips it. Clipping ancestors: overflow-x other than
 * visible clips sideways; overflow-y clips vertically only when hidden or clip (a scroll container's content
 * below its fold is reachable); `contain: paint` clips on all sides. Returns the problems (none when readable).
 */
async function evidenceText(span: Locator): Promise<{ texts: number; problems: string[] }> {
  return span.evaluate((root, minPx) => {
    const vw = document.documentElement.clientWidth;
    const problems: string[] = [];
    const tag = (el: Element) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : '');
    const holders = [root, ...Array.from(root.querySelectorAll('*'))].filter((el) => Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== ''));
    for (const el of holders) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) problems.push(`${tag(el)}: not visible`);
      const fontPx = parseFloat(cs.fontSize);
      if (fontPx < minPx) problems.push(`${tag(el)}: font-size ${fontPx}px < ${minPx}px`);
      if (cs.display !== 'inline' && el.scrollWidth > el.clientWidth) problems.push(`${tag(el)}: cut off (scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth})`);
      if (r.left < 0 || r.right > vw) problems.push(`${tag(el)}: box ${Math.round(r.left)}–${Math.round(r.right)} outside 0–${vw}`);
      // Every rendered line of its own text, inside the viewport width and inside each clipping ancestor.
      const clips: { r: DOMRect; x: boolean; y: boolean }[] = [];
      for (let a: Element | null = el; a && a !== document.documentElement; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (acs.clipPath !== 'none') problems.push(`${tag(el)}: clip-path ${acs.clipPath} on ${tag(a)}`);
        const paint = /\b(paint|strict|content)\b/.test(acs.contain);
        const x = paint || acs.overflowX !== 'visible';
        const y = paint || acs.overflowY === 'hidden' || acs.overflowY === 'clip';
        if (x || y) clips.push({ r: a.getBoundingClientRect(), x, y });
      }
      for (const n of Array.from(el.childNodes)) {
        if (n.nodeType !== Node.TEXT_NODE || n.textContent!.trim() === '') continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const drawn = Array.from(range.getClientRects()).filter((t) => t.width > 0 && t.height > 0);
        if (drawn.length === 0) problems.push(`${tag(el)}: text "${n.textContent!.trim().slice(0, 30)}" draws no line`);
        for (const t of drawn) {
          if (t.left < -0.5 || t.right > vw + 0.5) problems.push(`${tag(el)}: text line ${Math.round(t.left)}–${Math.round(t.right)} outside 0–${vw}`);
          const clipped = clips.some(
            ({ r: c, x, y }) => (x && (t.left < c.left - 0.5 || t.right > c.right + 0.5)) || (y && (t.top < c.top - 0.5 || t.bottom > c.bottom + 0.5)),
          );
          if (clipped) problems.push(`${tag(el)}: text line clipped by an ancestor`);
        }
      }
    }
    return { texts: holders.length, problems };
  }, MIN_TEXT_PX);
}

/** One step of the flow: unscrolled, no sideways scroll, no zoom, targets ≥ 24 × 24, the primary action in view. */
async function checkStep(page: Page, step: string, primary: Locator | null) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expectNoHorizontalScroll(page);
  const view = await page.evaluate(() => ({ scale: window.visualViewport?.scale ?? 1, clientWidth: document.documentElement.clientWidth }));
  // On the isMobile phone project a missing or wrong meta viewport lays the page out at 980 px and zooms
  // out to fit, so the clientWidth check below does the work; the scale check stays as a cheap guard.
  expect(view.scale, `${step}: not zoomed`).toBe(1);
  expect(view.clientWidth, `${step}: layout width is the viewport width`).toBe(page.viewportSize()!.width);
  const all = await targets(page);
  expect(all.length, `${step}: has interactive targets`).toBeGreaterThan(0);
  const small = all.filter((t) => t.width < MIN_TARGET || t.height < MIN_TARGET);
  expect(small, `${step}: targets under ${MIN_TARGET} × ${MIN_TARGET} CSS px`).toEqual([]);
  const underDesign = all.filter((t) => t.width < DESIGN_MIN_TARGET || t.height < DESIGN_MIN_TARGET);
  expect(underDesign, `${step}: targets under Design.md's ${DESIGN_MIN_TARGET} px`).toEqual([]);
  if (primary) await expectInViewAndUnclipped(page, primary, `${step} primary action`);
}

test('EVAL-086 capture flow usable at 375 and 768 px: enrol, choose a plot, add photos, enter kg, submit, read the verdict', async ({ page, context }, info) => {
  test.skip(!(info.project.name in CASE_PROJECTS), 'EVAL-086 names mobile-375 and tablet-768 (the phone and tablet projects)');
  expect(page.viewportSize()).toEqual(CASE_PROJECTS[info.project.name]);
  await page.emulateMedia({ reducedMotion: 'reduce' }); // the checking screen waits on "See result"
  await ownClientAddress(page); // the enrol route limits attempts per client address

  // Plot 1 is P02; the agent stands inside Plot 2 (P01) and chooses it.
  const seed = seedCaptureWorld({ plots: ['P02', 'P01'], code: true });
  const [, plot2] = seed.plots;
  await mockGeolocation(context, { ...plot2!.inside, accuracy: 8 });
  await signIn(page, seed.agentEmail, seed.testOnlyAgentPassword);
  await expect(page).toHaveURL(/\/field$/);

  // A phone with no key yet: Home offers to set it up.
  const setUp = page.getByRole('button', { name: 'Set up this phone' });
  await expect(setUp).toBeVisible();
  await checkStep(page, 'home (not set up)', setUp);

  // Enrol
  await setUp.click();
  await expect(page).toHaveURL(/\/enrol$/);
  const sheet = page.getByRole('dialog', { name: 'ಭಾಷೆ · Language' });
  await expect(sheet).toBeVisible();
  await checkStep(page, 'enrol language sheet', sheet.getByRole('button', { name: 'English' }));
  await sheet.getByRole('button', { name: 'English' }).click();
  await expect(sheet).toBeHidden();
  await page.getByLabel('Enter the 6-letter code from the office').fill(seed.testOnlyCode!);
  await checkStep(page, 'enrol code', page.getByRole('button', { name: 'Set up this phone' }));
  await page.getByRole('button', { name: 'Set up this phone' }).click();
  await expect(page.getByTestId('enrol-done')).toHaveText('This phone is ready');
  await checkStep(page, 'enrol done', page.getByRole('button', { name: 'Go to Home' }));
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await expect(page).toHaveURL(/\/field$/);

  // Choose a plot
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toHaveText(/^You're \d+ m from Plot 1$/);
  await checkStep(page, 'home (Plot 1)', page.getByRole('button', { name: 'Change plot' }));
  await page.getByRole('button', { name: 'Change plot' }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a plot' });
  await expect(chooser).toBeVisible();
  const choice = chooser.getByRole('button', { name: `Plot 2 · ${seed.farmerName}` });
  await checkStep(page, 'choose a plot', choice);
  await choice.click();
  await expect(chooser).toBeHidden();
  await expect(h1).toHaveText('You\'re inside Plot 2');
  const record = page.getByRole('button', { name: "Record today's picking" });
  await checkStep(page, 'home (Plot 2)', record);

  // Add photos
  await record.click();
  await expect(page).toHaveURL(new RegExp(`/field/record\\?plot=${plot2!.id}$`));
  await expect(h1).toHaveText('Take up to 3 photos');
  await checkStep(page, 'photos (none)', page.getByRole('button', { name: 'Open camera' }));
  await choosePhoto(page.getByLabel('The branch'), { name: 'branch.jpg', mimeType: 'image/jpeg', buffer: demoPhoto() });
  await expect(h1).toHaveText('Is the photo clear?');
  await expect(page.locator('.photo-big img')).toBeVisible();
  await checkStep(page, 'review photo 1', page.getByRole('button', { name: 'Use this photo' }));
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await expect(page.getByTestId('photo-counter')).toHaveText('1 of 3');
  await checkStep(page, 'photos (1 of 3)', page.getByRole('button', { name: 'Open camera' }));
  await choosePhoto(page.getByLabel('Basket on the scale'), { name: 'scale.jpg', mimeType: 'image/jpeg', buffer: demoPhoto('scale-01.jpg') });
  await expect(h1).toHaveText('Is the photo clear?');
  await checkStep(page, 'review photo 2', page.getByRole('button', { name: 'Use this photo' }));
  await page.getByRole('button', { name: 'Use this photo' }).click();
  await expect(page.getByTestId('photo-counter')).toHaveText('2 of 3');
  const cont = page.getByRole('button', { name: 'Continue with 2 photos' });
  await checkStep(page, 'photos (2 of 3)', cont);

  // Enter kg
  await cont.click();
  await expect(h1).toHaveText('How many kilos?');
  for (const k of ['4', '2', '.', '5']) await page.locator(`#keypad [data-k="${k}"]`).click();
  const submit = page.locator('#send-btn');
  await expect(submit).toBeEnabled();
  await checkStep(page, 'weight (Submit)', submit);

  // Submit
  await submit.click();
  await expect(page.locator('#see-result')).toBeVisible({ timeout: 45_000 });
  await checkStep(page, 'checking', page.locator('#see-result'));

  // Read the verdict
  await page.locator('#see-result').click();
  await expect(page.locator('#verdict-h')).toHaveText('Verified');
  await checkStep(page, 'verdict', page.getByRole('button', { name: 'Done' }));
  const lines = page.getByTestId('evidence').getByRole('listitem');
  await expect(lines).toHaveCount(3);
  await expect(lines).toHaveText([/^You were \d+ m inside Plot 2$/, '2 new photos', 'Forest map: no trees cleared since 2021 (demo data)']);
  for (const [i, line] of (await lines.all()).entries()) {
    await expect(line).toBeVisible();
    await expect(line.locator('.ev-t'), `evidence line ${i + 1} has its text span`).toHaveCount(1);
    await expect(line.locator('.ev-t'), `evidence line ${i + 1}: text span visible`).toBeVisible();
    const m = await evidenceText(line.locator('.ev-t'));
    expect(m.texts, `evidence line ${i + 1}: text-bearing elements measured`).toBeGreaterThan(0);
    expect(m.problems, `evidence line ${i + 1}: text readable inside the viewport`).toEqual([]);
  }
});
