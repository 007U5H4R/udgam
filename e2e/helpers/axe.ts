import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * axe for a settled page: every spec builds its axe run here (eslint keeps @axe-core/playwright out of
 * the specs). Next 16 streams page metadata: the <title> is rendered in its own Suspense boundary
 * ("Next.Metadata", next/dist/lib/metadata/metadata.js) that commits after the page body whenever the
 * router applies a new tree, on a client navigation, a router.refresh() or a Server Action that
 * revalidates. For those few frames the document has no <title> at all, and axe run then reports
 * "document-title: html" (CI: m2-agreements T2 after a header link, m2-processing EVAL-101 after
 * "Sign and hand on"). So wait for a non-empty document.title first. Nothing is hidden by the wait: a page
 * that never gets a title still fails, here.
 */
export async function axeOn(page: Page): Promise<AxeBuilder> {
  await expect(page, 'the page has its <title> before axe runs').toHaveTitle(/\S/);
  return new AxeBuilder({ page });
}
