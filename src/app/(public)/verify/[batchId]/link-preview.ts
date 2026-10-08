import type { Metadata } from 'next';
import { certCopy, kgShort } from '../../../../lib/certificate/copy';
import { OG_SIZE, ogVariant } from '../../../../lib/certificate/og-image';
import type { CertificateView } from '../../../../lib/certificate/view-model';

// The certificate's link-preview metadata (TSK-17.5, TC-072, EVAL-090; technical-plan §12, Design.md §25,
// web-deliverables §4): title, description, canonical URL, Open Graph and Twitter tags with the approved
// link-preview artwork in the batch's own words (1200 × 630, DES-202), every URL absolute from PUBLIC_BASE_URL (metadataBase). Public per batch but
// not for search: noindex, nofollow (§8.4). The words come from the view model, which comes from the
// proof feed (TP16). A link that resolves to no batch gets the generic metadata, with no batch data in it.

/**
 * The batch's link-preview image (DES-202, EXE43): the approved artwork (.design/exploration/og/) with its
 * words for the headline's district and crop, or the neutral "Coffee, verified at origin" variant; only the
 * district and crop reach it. The alt text says the image's words.
 */
export function ogImage(view: CertificateView): { url: string; width: number; height: number; alt: string } {
  const v = ogVariant(view.headline.district, view.headline.crop);
  return { url: v.url, ...OG_SIZE, alt: v.alt };
}

export const SITE_NAME = 'Udgam';

/** For an unknown batch, a missing h or a wrong h: no batch data, not for search. */
export const GENERIC_METADATA: Metadata = { title: 'Certificate · Udgam', robots: { index: false, follow: false } };

/** "Kodagu Arabica, verified at origin — Udgam" (Design.md §25). */
export function certificateTitle(view: CertificateView): string {
  return `${view.headline.district} ${view.headline.crop || 'coffee'}, verified at origin — ${SITE_NAME}`;
}

export function certificateMetadata(view: CertificateView, baseUrl: string): Metadata {
  const title = certificateTitle(view);
  const h = view.headline;
  const description = `${certCopy.headline(kgShort(h.quantityKg), h.crop || 'coffee', h.farmCount, h.district)}. Every picking checked at the plot, and checked again in your browser.`;
  const url = `/verify/${encodeURIComponent(view.batchId)}?h=${encodeURIComponent(view.shortHash)}`;
  const image = ogImage(view);
  return {
    metadataBase: new URL(baseUrl),
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: { index: false, follow: false },
    openGraph: { type: 'website', siteName: SITE_NAME, title, description, url, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [{ url: image.url, alt: image.alt }] },
  };
}
