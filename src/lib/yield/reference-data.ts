// The season yield reference values (technical-plan §6.6, TP6 — resolves GAP-3; TKT-09). Pure data (no
// database import), so the eval harness can print what the app seeds. Bump the version whenever a value
// or its source changes.

export const YIELD_REFERENCE_VERSION = 'coffee-board-2024-07.r1';

export const YIELD_SOURCE_URL = 'https://coffeeboard.gov.in/Database/DATABASE3_JULY2024.pdf';

/** Fresh ripe cherry to clean coffee, 6:1 (TP6): the conservative end of the 5–6:1 industry range. */
export const CHERRY_TO_CLEAN_RATIO = 1 / 6;

const TABLES = 'Coffee Board of India, Database on Coffee, July 2024, Tables 1.10–1.11 (clean coffee, kg/ha of bearing area)';

const RATIO_NOTE =
  'Cherry-to-clean 1/6 (fresh ripe cherry, 6:1) is an industry estimate, unverified: the conservative end of the 5–6:1 range, ' +
  'consistent with a measured 6.2–6.3:1; the Coffee Board publishes only dry-cherry outturn (Arabica 53.5 %, Robusta 52.7 %; Annual Report 2022-23).';

export const YIELD_REFERENCE_ROWS = [
  {
    crop: 'arabica',
    variety: 'all',
    minKgHa: null,
    maxKgHa: 783,
    cherryToCleanRatio: CHERRY_TO_CLEAN_RATIO,
    source: `${TABLES}: highest Kodagu/Chikkamagaluru district average 2018-19 to 2023-24, Arabica 783 kg/ha (Chikkamagaluru 2023-24). ${RATIO_NOTE}`,
    sourceUrl: YIELD_SOURCE_URL,
    version: YIELD_REFERENCE_VERSION,
  },
  {
    crop: 'robusta',
    variety: 'all',
    minKgHa: null,
    maxKgHa: 1494,
    cherryToCleanRatio: CHERRY_TO_CLEAN_RATIO,
    source: `${TABLES}: highest Kodagu/Chikkamagaluru district average 2018-19 to 2023-24, Robusta 1,494 kg/ha (Kodagu 2023-24). ${RATIO_NOTE}`,
    sourceUrl: YIELD_SOURCE_URL,
    version: YIELD_REFERENCE_VERSION,
  },
] as const;
