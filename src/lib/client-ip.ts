/**
 * The client address for per-IP rate limits (enrolment §10, capture and sign-in TKT-19): the LAST
 * X-Forwarded-For hop, the one the reverse proxy sets or appends. Earlier hops and X-Real-IP are
 * client-controlled and never trusted. Deployment assumption (TKT-27, documented in .env.example): the
 * app port is never published and Caddy, with `trusted_proxies` unset, overwrites X-Forwarded-For with
 * the connecting address. Without the header (the app reached directly) every client shares one bucket.
 *
 * The result is a rate-limit key, not an address to connect to (TASK-20 fix round 2, N3): one IPv6 host
 * is routinely given a whole /64 and can pick any address in it, so an IPv6 client is keyed by its /64
 * (`2001:db8:1:2::/64`); an IPv4 address, and IPv4 carried in an IPv4-mapped IPv6 address
 * (`::ffff:203.0.113.5`), is keyed by the IPv4 address. Anything else is kept as it is.
 */
export function clientIp(headers: Headers): string {
  const hops = headers.get('x-forwarded-for')?.split(',') ?? [];
  const raw = hops.at(-1)?.trim().slice(0, 64) || 'unknown';
  return ipv6Key(raw) ?? raw;
}

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const HEXTET = /^[0-9a-f]{1,4}$/i;

/** The rate-limit key of an IPv6 address (its /64, or its IPv4 when IPv4-mapped); null when `s` is not IPv6. */
function ipv6Key(s: string): string | null {
  if (!s.includes(':')) return null;
  const groups = ipv6Groups(s.replace(/^\[(.*)\]$/, '$1').replace(/%.*$/, ''));
  if (!groups) return null;
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return [groups[6]! >> 8, groups[6]! & 0xff, groups[7]! >> 8, groups[7]! & 0xff].join('.');
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}

/** The eight 16-bit groups of an IPv6 address (one `::`, an optional dotted IPv4 tail), or null. */
function ipv6Groups(s: string): number[] | null {
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string, last: boolean): number[] | null => {
    if (part === '') return [];
    const out: number[] = [];
    const items = part.split(':');
    for (const [i, item] of items.entries()) {
      if (last && i === items.length - 1 && item.includes('.')) {
        if (!IPV4.test(item)) return null;
        const [a, b, c, d] = item.split('.').map(Number) as [number, number, number, number];
        out.push((a << 8) | b, (c << 8) | d);
      } else if (HEXTET.test(item)) {
        out.push(parseInt(item, 16));
      } else {
        return null;
      }
    }
    return out;
  };
  if (halves.length === 1) {
    const all = parse(s, true);
    return all && all.length === 8 ? all : null;
  }
  const head = parse(halves[0]!, false);
  const tail = parse(halves[1]!, true);
  if (!head || !tail || head.length + tail.length > 7) return null;
  return [...head, ...Array<number>(8 - head.length - tail.length).fill(0), ...tail];
}
