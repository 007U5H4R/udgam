import { DISTRICT_AREAS, STATE } from './district';

// The certificate's link-preview image (DES-202, EXE43; Design.md §25, web-deliverables §4). The approved
// artwork (.design/exploration/og/index.html → verify.png) keeps its layout, mark, typography and colours;
// only its words follow the batch, as the certificate title does: "<District> <crop>, verified at origin".
// One pre-rendered PNG per district districtOf() can name (each listed district, or the state) × crop, made
// by scripts/og/render.ts and committed under public/og/. A batch whose district or crop is anything else
// (two districts, an unlisted crop, none) gets the neutral "Coffee, verified at origin", which claims no
// place or variety. Pure and framework-free: the render script imports it too.

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** The districts districtOf() can return on its own, then the state it falls back to. */
export const OG_DISTRICTS: readonly string[] = [...DISTRICT_AREAS.map((a) => a.name), STATE];
/** The crops as the view model words them (cropLabel). */
export const OG_CROPS: readonly string[] = ['Arabica', 'Robusta'];

export type OgVariant = {
  /** "Kodagu Arabica" or "Coffee": the first part of the headline, before ", verified at origin". */
  subject: string;
  /** The image's words: "Kodagu Arabica, verified at origin". */
  words: string;
  /** The site-relative image URL; metadataBase makes it absolute. */
  url: string;
  alt: string;
};

function variant(subject: string): OgVariant {
  const words = `${subject}, verified at origin`;
  const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return { subject, words, url: `/og/verify-${slug}.png`, alt: `The Udgam coffee-cherry mark beside the words “${words}”` };
}

export const NEUTRAL_OG: OgVariant = variant('Coffee');

export const OG_VARIANTS: readonly OgVariant[] = [...OG_DISTRICTS.flatMap((d) => OG_CROPS.map((c) => variant(`${d} ${c}`))), NEUTRAL_OG];

/** The image for a batch's headline district and crop (CertificateView.headline). */
export function ogVariant(district: string, crop: string): OgVariant {
  if (!OG_DISTRICTS.includes(district) || !OG_CROPS.includes(crop)) return NEUTRAL_OG;
  return OG_VARIANTS.find((v) => v.subject === `${district} ${crop}`) ?? NEUTRAL_OG;
}
