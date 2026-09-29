// RFC 8785 JSON Canonicalization Scheme, hand-written from docs/proof-feed.md §3.1.

export class JcsError extends Error {}

const SHORT_ESCAPES: Record<number, string> = {
  0x08: '\\b',
  0x09: '\\t',
  0x0a: '\\n',
  0x0c: '\\f',
  0x0d: '\\r',
  0x22: '\\"',
  0x5c: '\\\\',
};

function serialiseString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const unit = s.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : -1;
      if (next < 0xdc00 || next > 0xdfff) throw new JcsError('lone high surrogate');
      out += s[i]! + s[i + 1]!;
      i++;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) throw new JcsError('lone low surrogate');
    const short = SHORT_ESCAPES[unit];
    if (short !== undefined) out += short;
    else if (unit < 0x20) out += '\\u' + unit.toString(16).padStart(4, '0');
    else out += s[i]!;
  }
  return out + '"';
}

function serialiseNumber(n: number): string {
  if (!Number.isFinite(n)) throw new JcsError('NaN and Infinity are not JSON');
  // ECMAScript Number.prototype.toString is exactly the RFC 8785 number form; it writes -0 as "0".
  return String(n);
}

/** Canonical JSON text of a JSON value (objects, arrays, strings, finite numbers, booleans, null). */
export function jcs(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return serialiseNumber(value);
    case 'string':
      return serialiseString(value);
    case 'object': {
      if (Array.isArray(value)) return '[' + value.map((v) => jcs(v)).join(',') + ']';
      const proto = Object.getPrototypeOf(value) as unknown;
      if (proto !== Object.prototype && proto !== null) throw new JcsError('not a plain JSON object');
      // Own enumerable string keys, including an own "__proto__" member produced by JSON.parse.
      const keys = Object.keys(value).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); // UTF-16 code units
      const obj = value as Record<string, unknown>;
      const members = keys.map((k) => {
        const desc = Object.getOwnPropertyDescriptor(obj, k);
        return serialiseString(k) + ':' + jcs(desc?.value);
      });
      return '{' + members.join(',') + '}';
    }
    default:
      throw new JcsError(`not a JSON value: ${typeof value}`);
  }
}
