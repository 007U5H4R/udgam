// Prefixed random IDs: `PR-7K2M9Q4D` style (technical-plan §4.1). Crockford base32 (no I, L, O, U).
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `prefix` + `length` random Crockford base32 characters (5 bits each, from WebCrypto). */
export function newId(prefix: string, length = 8): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  return prefix + Array.from(bytes, (b) => CROCKFORD[b & 31]).join('');
}
