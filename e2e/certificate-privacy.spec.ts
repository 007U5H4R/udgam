import { expect, test } from '@playwright/test';
import { certificateUrl, proofFinalState, seedCertificate, SENTINELS, type SeededCertificate } from './helpers/certificate';

// TSK-16.9 · TC-067 (page and feed part) · @eval EVAL-084 · EV16: seed farmers whose name, identifier and
// the FPO's phone are sentinels, build and transfer a batch through the real writers, then search the
// certificate's HTML (as served and as rendered) and the proof feed: no sentinel appears, producer IDs do.

let seeded: SeededCertificate;
test.beforeAll(() => {
  seeded = seedCertificate({ events: 3, plots: 2, sentinel: true });
});

const SENTINEL_VALUES = [SENTINELS.name, SENTINELS.identifier, SENTINELS.phone];

test('the certificate and its proof feed carry no farmer personal data (@eval EVAL-084)', async ({ page }) => {
  const res = await page.goto(certificateUrl(seeded));
  expect(res?.status()).toBe(200);
  const served = await res!.text();
  expect(await proofFinalState(page)).toBe('verified');
  const rendered = await page.content();
  const feed = await (await page.request.get(`/api/verify/${seeded.batchId}?h=${seeded.shortHash}`)).text();

  for (const [name, text] of [
    ['served HTML', served],
    ['rendered HTML', rendered],
    ['proof feed', feed],
  ] as const) {
    for (const s of SENTINEL_VALUES) expect(text, `${name} contains ${s}`).not.toContain(s);
    expect(text.toLowerCase(), name).not.toContain('zzsentinel');
    for (const p of seeded.producerIds) expect(text, `${name} lacks ${p}`).toContain(p);
    expect(text, name).toMatch(/PR-[0-9A-Z]{8}/);
  }
});
