import { jcs, sha256Hex } from '../crypto';

// Mass-balance bands `mb-1` (technical-plan TSK-26.1, F18, Design.md §28.7 and §28.10). Data, with a
// version, a source per process and the SHA-256 of its RFC 8785 form (printed in eval provenance and
// signed into every processing step as `configVersion`). A band is the expected output as a percentage
// of input, inclusive at both edges. Outside it a step is FLAGGED with an evidence sentence; nothing is
// ever refused (TSK-26.2).
//
// Sources:
//  - Hulling: Coffee Board of India, Annual Report 2022-23, outturn figures from the Central Coffee
//    Research Institute (CCRI): clean coffee is about 80 % (Arabica) / 85 % (Robusta) of dry parchment
//    and 53.5 % / 52.7 % of dry cherry. The band is that figure ±5 percentage points.
//  - Pulping (fresh cherry → wet parchment) and drying: Stage 6 found no Coffee Board figure. These
//    bands are PLACEHOLDERS (owner item, Design.md §28.10 item 1): the UI and the evidence sentence say
//    "placeholder range, to be confirmed" until the owner confirms or replaces them. Changing any value
//    here is a new version (mb-2) and a new pinned hash in config.test.ts.

export const PROCESSES = ['pulping', 'drying', 'hulling_parchment', 'hulling_dry_cherry'] as const;
export type Process = (typeof PROCESSES)[number];
export type MbCrop = 'arabica' | 'robusta';
/** [min, max] output as % of input, inclusive. */
export type Band = readonly [number, number];

export type MassBalanceConfig = {
  readonly version: string;
  readonly bands: Readonly<Record<Process, Readonly<Record<MbCrop, Band>>>>;
  readonly source: Readonly<Record<Process, string>>;
};

const PLACEHOLDER = 'placeholder — owner to confirm';

export const MB_CONFIG = {
  version: 'mb-1',
  bands: {
    pulping: { arabica: [35, 50], robusta: [35, 50] },
    drying: { arabica: [40, 60], robusta: [40, 60] },
    hulling_parchment: { arabica: [75, 85], robusta: [80, 90] },
    hulling_dry_cherry: { arabica: [48.5, 58.5], robusta: [47.7, 57.7] },
  },
  source: {
    pulping: `${PLACEHOLDER} (no Coffee Board figure for fresh cherry to wet parchment was found in Stage 6)`,
    drying: `${PLACEHOLDER} (no Coffee Board figure for drying was found in Stage 6)`,
    hulling_parchment: 'Coffee Board of India, Annual Report 2022-23 (CCRI outturn): clean coffee 80 % (Arabica) / 85 % (Robusta) of dry parchment; band ±5 points',
    hulling_dry_cherry: 'Coffee Board of India, Annual Report 2022-23 (CCRI outturn): clean coffee 53.5 % (Arabica) / 52.7 % (Robusta) of dry cherry; band ±5 points',
  },
} as const satisfies MassBalanceConfig;

/** SHA-256 of the RFC 8785 form of MB_CONFIG (computed once at module load). */
export const MB_CONFIG_HASH: string = await sha256Hex(jcs(MB_CONFIG));

export const isProcess = (v: unknown): v is Process => typeof v === 'string' && (PROCESSES as readonly string[]).includes(v);

/** True while the process's band is a placeholder the owner has not confirmed (pulping, drying in mb-1). */
export const isPlaceholderBand = (p: Process): boolean => MB_CONFIG.source[p].startsWith(PLACEHOLDER);

/** The band for a process and crop. */
export const bandFor = (p: Process, crop: MbCrop): Band => MB_CONFIG.bands[p][crop];
