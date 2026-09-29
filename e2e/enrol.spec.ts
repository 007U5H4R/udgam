import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { SEED_PASSWORD, signIn } from './helpers/auth';
import { ownClientAddress, seedEnrolment } from './helpers/enrolment';
import { query } from './helpers/tracer';

// TC-022: enrolment makes a non-extractable key in IndexedDB and anchors device_enrolled.
// TC-025: the first-run language sheet (ಕನ್ನಡ / English) comes before the code screen, and the choice
// sets `lang` and persists across reloads.

/** axe's serious and critical violations on the page as it is now (TC-081). */
async function seriousAxe(page: Page): Promise<string[]> {
  return (await new AxeBuilder({ page }).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

/** A preference as the phone stored it in IndexedDB `udgam`/`prefs`, or null. */
async function storedPref(page: Page, name: string): Promise<string | null> {
  return page.evaluate(async (key) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('udgam');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      if (!db.objectStoreNames.contains('prefs')) return null;
      const rec = await new Promise<{ value?: string } | undefined>((resolve, reject) => {
        const r = db.transaction('prefs').objectStore('prefs').get(key);
        r.onsuccess = () => resolve(r.result as { value?: string } | undefined);
        r.onerror = () => reject(r.error);
      });
      return rec?.value ?? null;
    } finally {
      db.close();
    }
  }, name);
}

const languageSheet = (page: Page) => page.getByRole('dialog', { name: 'ಭಾಷೆ · Language' });

/** What the phone's IndexedDB holds after enrolment, read in the page. */
async function storedKey(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('udgam');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const get = (store: string, key: string) =>
      new Promise<unknown>((resolve, reject) => {
        const r = db.transaction(store).objectStore(store).get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    const keys = (await get('keys', 'device')) as { privateKey: CryptoKey; publicKey: CryptoKey };
    const device = (await get('device', 'current')) as { deviceId: string; nextSeq: number; lastEventHash: string };
    db.close();
    let exportRejected = false;
    try {
      await crypto.subtle.exportKey('jwk', keys.privateKey);
    } catch {
      exportRejected = true;
    }
    const pub = await crypto.subtle.exportKey('jwk', keys.publicKey);
    return {
      isCryptoKey: keys.privateKey instanceof CryptoKey,
      extractable: keys.privateKey.extractable,
      exportRejected,
      publicXY: { x: pub.x, y: pub.y },
      device,
    };
  });
}

test.describe('enrolment (TKT-05)', () => {
  test('TC-025 the language sheet comes first, sets lang, and is not shown again after a reload', async ({ page }) => {
    await ownClientAddress(page);
    const seed = seedEnrolment();
    await signIn(page, seed.agentEmail, SEED_PASSWORD);
    await page.goto('/enrol');
    const sheet = languageSheet(page);
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'ಕನ್ನಡ / Kannada' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'English' })).toBeVisible();

    await sheet.getByRole('button', { name: 'ಕನ್ನಡ / Kannada' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('lang', 'kn');
    await expect.poll(() => storedPref(page, 'lang')).toBe('kn'); // the phone's own copy, beside the cookie
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ಫೋನ್');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ಫೋನ್');
    await expect(languageSheet(page)).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('lang', 'kn');
    expect((await page.context().cookies()).find((c) => c.name === 'udgam_lang')?.value).toBe('kn');
    expect(await storedPref(page, 'lang')).toBe('kn');
  });

  test('TC-022 a code from the office enrols the phone with a non-extractable key and anchors device_enrolled', async ({ page }) => {
    await ownClientAddress(page);
    const seed = seedEnrolment();
    await signIn(page, seed.agentEmail, SEED_PASSWORD);
    await page.goto('/enrol');
    await languageSheet(page).getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // a wrong code says what to do and enrols nothing
    const field = page.getByLabel('Enter the 6-letter code from the office');
    await field.fill('ZZZZZZ');
    await page.getByRole('button', { name: 'Set up this phone' }).click();
    await expect(page.locator('#enrol-error')).toContainText('ask the office for a new code');
    expect(await seriousAxe(page)).toEqual([]); // the error state

    await field.fill(seed.testOnlyCode.toLowerCase());
    await page.getByRole('button', { name: 'Set up this phone' }).click();
    await expect(page.getByTestId('enrol-done')).toHaveText('This phone is ready');
    expect(await seriousAxe(page)).toEqual([]); // the done state

    const k = await storedKey(page);
    expect(k).toMatchObject({ isCryptoKey: true, extractable: false, exportRejected: true });
    expect(k.device).toMatchObject({ nextSeq: 1, lastEventHash: 'genesis' });
    expect(k.device.deviceId).toMatch(/^DV-[0-9A-Z]{8}$/);

    const [dev] = await query<{ agent_id: string; public_key_jwk: string; key_thumbprint: string; anchor_seq: number }>(
      'SELECT agent_id, public_key_jwk, key_thumbprint, anchor_seq FROM devices WHERE id = ?',
      [k.device.deviceId],
    );
    expect(dev).toBeDefined();
    expect(dev!.agent_id).toBe(seed.agentId);
    expect(JSON.parse(dev!.public_key_jwk)).toMatchObject(k.publicXY); // the server holds this phone's public key
    const [entry] = await query<{ kind: string; payload: string }>('SELECT kind, payload FROM ledger_entries WHERE seq = ?', [dev!.anchor_seq]);
    expect(entry!.kind).toBe('device_enrolled');
    expect(JSON.parse(entry!.payload)).toEqual({ deviceId: k.device.deviceId, agentId: seed.agentId, thumbprint: dev!.key_thumbprint });

    await page.getByRole('button', { name: 'Go to Home' }).click();
    await expect(page).toHaveURL(/\/field$/);
  });

  test('Fix 1: a phone that cannot keep the key after the server enrolled it says so and what to do', async ({ page }) => {
    await ownClientAddress(page);
    const seed = seedEnrolment();
    await signIn(page, seed.agentEmail, SEED_PASSWORD);
    // this browser's IndexedDB refuses to open (a full or blocked store)
    await page.addInitScript(() => {
      IDBFactory.prototype.open = function () {
        throw new DOMException('IndexedDB unavailable in this test', 'UnknownError');
      };
    });
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('/enrol');
    await languageSheet(page).getByRole('button', { name: 'English' }).click();
    await page.getByLabel('Enter the 6-letter code from the office').fill(seed.testOnlyCode);
    await page.getByRole('button', { name: 'Set up this phone' }).click();
    await expect(page.locator('#enrol-error')).toHaveText('Phone enrolled on the server but not saved here — ask the office for a new code.');
    expect(errors.some((e) => e.includes('enrol.save_failed'))).toBe(true);
    expect(await query('SELECT id FROM devices WHERE agent_id = ?', [seed.agentId])).toHaveLength(1);
    expect(await seriousAxe(page)).toEqual([]);
  });

  test('no horizontal scroll and no serious axe violations on /enrol, sheet open or closed (TC-080, TC-081)', async ({ page }) => {
    await ownClientAddress(page);
    const seed = seedEnrolment();
    await signIn(page, seed.agentEmail, SEED_PASSWORD);
    await page.goto('/enrol');
    // against the project's viewport: an emulated phone widens innerWidth to fit overflowing content
    const noScroll = async () => (await page.evaluate(() => document.documentElement.scrollWidth)) <= page.viewportSize()!.width;
    await expect(languageSheet(page)).toBeVisible();
    expect(await noScroll()).toBe(true);
    expect(await seriousAxe(page)).toEqual([]);
    await languageSheet(page).getByRole('button', { name: 'English' }).click();
    await expect(languageSheet(page)).toBeHidden();
    expect(await noScroll()).toBe(true);
    expect(await seriousAxe(page)).toEqual([]);
  });
});
