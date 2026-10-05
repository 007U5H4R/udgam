// Display helpers shared across screens (final branch review finding 4: parallel tickets had each
// written their own). ISOMORPHIC and pure: server pages, client components and the verification
// checks all use them. Dates are IST by explicit offset arithmetic, never the host zone (technical-plan
// §1 Time).

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** Calendar date in IST, `YYYY-MM-DD`. */
export const istDate = (iso: string): string => new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Calendar month in IST, `YYYY-MM`. */
export const istMonth = (iso: string): string => istDate(iso).slice(0, 7);

/** Kilograms with one decimal, rounded to the tenth ("612.0", "38.5"). */
export const kg1 = (kg: number): string => (Math.round(kg * 10) / 10).toFixed(1);

/** A 0–100 score: whole numbers bare, otherwise one decimal. */
export const formatScore = (score: number): string => (Number.isInteger(score) ? String(score) : (Math.round(score * 10) / 10).toFixed(1));
