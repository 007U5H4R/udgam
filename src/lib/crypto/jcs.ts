import canonicalize from 'canonicalize';

// RFC 8785 JSON Canonicalization Scheme (technical-plan §5.1). `canonicalize` does the RFC work;
// the pre-walk refuses anything JSON cannot carry exactly, instead of silently dropping or
// coercing it (JSON.stringify drops `undefined`, turns NaN into null and Dates into strings).

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

function reject(path: string, what: string): never {
  throw new TypeError(`jcs: ${what} at ${path} cannot be canonicalised`);
}

function walk(v: unknown, path: string, seen: Set<object>): void {
  switch (typeof v) {
    case 'string':
      if (!v.isWellFormed()) reject(path, 'a lone surrogate');
      return;
    case 'number':
      if (!Number.isFinite(v)) reject(path, String(v));
      return;
    case 'boolean':
      return;
    case 'object': {
      if (v === null) return;
      if (seen.has(v)) reject(path, 'a circular reference');
      seen.add(v);
      if (Array.isArray(v)) {
        // Sparse holes read as undefined and are rejected like explicit undefined.
        for (let i = 0; i < v.length; i++) walk(v[i], `${path}[${i}]`, seen);
      } else if (isPlainObject(v)) {
        for (const key of Object.keys(v)) {
          if (!key.isWellFormed()) reject(path, 'a lone surrogate key');
          walk((v as Record<string, unknown>)[key], `${path}.${key}`, seen);
        }
        if (Object.getOwnPropertySymbols(v).length > 0) reject(path, 'a symbol key');
      } else {
        reject(path, `a non-plain object (${v.constructor?.name ?? 'unknown'})`);
      }
      seen.delete(v);
      return;
    }
    default:
      // undefined, function, symbol, bigint
      reject(path, typeof v);
  }
}

/** Canonical JSON (RFC 8785) of a plain JSON value. Throws TypeError on anything else. */
export function jcs(value: unknown): string {
  walk(value, '$', new Set());
  const out = canonicalize(value);
  if (out === undefined) reject('$', 'a value with no JSON form');
  return out;
}
