// Which processes' mass-balance bands are placeholders, per signed config version (TKT-26 quality review
// nit 6, follow-up 2). Structured data, so the certificate decides "placeholder band" from a signed step's
// own `configVersion` and `process`, never by matching the English evidence sentence. Pure, with no
// imports, so the isomorphic certificate view model can read it. config.test.ts checks that the entry
// for the current version agrees with MB_CONFIG's sources. A new config version adds its own entry.

export const PLACEHOLDER_PROCESSES: Readonly<Record<string, readonly string[]>> = {
  'mb-1': ['pulping', 'drying'],
};

/** True when the step's band was a placeholder under the config version it was signed with. Unknown version → false (no claim). */
export function isPlaceholderStep(configVersion: unknown, process: unknown): boolean {
  if (typeof configVersion !== 'string' || typeof process !== 'string') return false;
  return Object.hasOwn(PLACEHOLDER_PROCESSES, configVersion) && PLACEHOLDER_PROCESSES[configVersion]!.includes(process);
}
