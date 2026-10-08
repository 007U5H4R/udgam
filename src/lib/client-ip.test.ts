import { describe, expect, it } from 'vitest';
import { clientIp } from './client-ip';

// TASK-20 fix round 2 (N3): one IPv6 host holds a whole /64, so the per-address keys (sign-in, capture,
// enrolment) take an IPv6 client by its /64 prefix; IPv4 (and IPv4 carried in IPv6) by its address.
const ip = (xff?: string) => clientIp(new Headers(xff === undefined ? {} : { 'x-forwarded-for': xff }));

describe('clientIp', () => {
  it('takes the last X-Forwarded-For hop, the one the reverse proxy sets', () => {
    expect(ip('10.9.9.9, 203.0.113.5')).toBe('203.0.113.5');
    expect(ip(' 203.0.113.5 ')).toBe('203.0.113.5');
    expect(ip()).toBe('unknown');
    expect(ip('')).toBe('unknown');
    expect(ip('10.0.0.1, ')).toBe('unknown');
  });

  it('keeps an IPv4 address as it is', () => {
    expect(ip('203.0.113.5')).toBe('203.0.113.5');
    expect(ip('0.0.0.0')).toBe('0.0.0.0');
    expect(ip('255.255.255.255')).toBe('255.255.255.255');
  });

  it('reduces an IPv6 address to its /64 prefix', () => {
    expect(ip('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(ip('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64');
    expect(ip('2001:0DB8:0001:0002:0:0:0:ffff')).toBe('2001:db8:1:2::/64'); // case and leading zeros
    expect(ip('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ip('2001:db8::')).toBe('2001:db8:0:0::/64');
    expect(ip('::1')).toBe('0:0:0:0::/64');
    expect(ip('::')).toBe('0:0:0:0::/64');
    expect(ip('fe80::1%eth0')).toBe('fe80:0:0:0::/64'); // a zone id is dropped
    expect(ip('[2001:db8:1:2::9]')).toBe('2001:db8:1:2::/64'); // brackets are dropped
    expect(ip('1:2:3:4:5:6:7::')).toBe('1:2:3:4::/64');
    expect(ip('::2:3:4:5:6:7:8')).toBe('0:2:3:4::/64');
  });

  it('every address of one /64 shares a key; the next /64 does not', () => {
    const a = ip('2001:db8:aa:bb:1::1');
    expect(ip('2001:db8:aa:bb:ffff:ffff:ffff:fffe')).toBe(a);
    expect(ip('2001:db8:aa:bb::')).toBe(a);
    expect(ip('2001:db8:aa:bc::1')).not.toBe(a);
  });

  it('an IPv4-mapped IPv6 address is its IPv4 address', () => {
    expect(ip('::ffff:203.0.113.5')).toBe('203.0.113.5');
    expect(ip('::FFFF:203.0.113.5')).toBe('203.0.113.5');
    expect(ip('0:0:0:0:0:ffff:203.0.113.5')).toBe('203.0.113.5');
    expect(ip('::ffff:cb00:7105')).toBe('203.0.113.5'); // the hex spelling of the same address
  });

  it('other IPv6 forms that embed an IPv4 tail are still IPv6 (/64)', () => {
    expect(ip('64:ff9b::203.0.113.5')).toBe('64:ff9b:0:0::/64'); // NAT64
    expect(ip('::203.0.113.5')).toBe('0:0:0:0::/64'); // deprecated IPv4-compatible
  });

  it('a value that is not an address is kept (trimmed, at most 64 characters), never merged into another key', () => {
    expect(ip('garbage')).toBe('garbage');
    expect(ip('2001:db8:::1')).toBe('2001:db8:::1');
    expect(ip('1:2:3:4:5:6:7:8:9')).toBe('1:2:3:4:5:6:7:8:9');
    expect(ip('2001:db8::1::2')).toBe('2001:db8::1::2');
    expect(ip('12345::1')).toBe('12345::1');
    expect(ip('::ffff:203.0.113.256')).toBe('::ffff:203.0.113.256');
    expect(ip('x'.repeat(100))).toBe('x'.repeat(64));
  });
});
