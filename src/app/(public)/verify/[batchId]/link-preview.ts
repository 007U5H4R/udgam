import type { Metadata } from 'next';
import { certCopy, kgShort } from '../../../../lib/certificate/copy';
import type { CertificateView } from '../../../../lib/certificate/view-model';

// The certificate's link-preview metadata (TSK-17.5, TC-072, EVAL-090; technical-plan §12, Design.md §25,
// web-deliverables §4): title, description, canonical URL, Open Graph and Twitter tags with the approved
// og/verify.png (1200 × 630), every URL absolute from PUBLIC_BASE_URL (metadataBase). Public per batch but
// not for search: noindex, nofollow (§8.4). The words come from the view model, which comes from the
// proof feed (TP16). A link that resolves to no batch gets the generic metadata, with no batch data in it.

/** The approved link-preview image (Design.md freeze: .design/exploration/og/verify.png, copied to public/og/). */
export const OG_IMAGE = {
  url: '/og/verify.png',
  width: 1200,
  height: 630,
  alt: 'The Udgam coffee-cherry mark beside the words “Kodagu Arabica, verified at origin”',
} as const;

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
  return {
    metadataBase: new URL(baseUrl),
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: { index: false, follow: false },
    openGraph: { type: 'website', siteName: SITE_NAME, title, description, url, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }] },
  };
}
