import { describe, expect, it } from 'vitest';
import { requestIdFrom } from './request-id';

// TKT-09 fix round 1 (quality review #6): the client's x-request-id rides on every capture log line, so
// only a short, plain token is taken as given; anything else is replaced by a generated one.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('requestIdFrom', () => {
  it.each(['req-retry-1', 'a', 'A.b_c-9', 'x'.repeat(64)])('keeps a client id matching ^[A-Za-z0-9._-]{1,64}$: %s', (id) => {
    expect(requestIdFrom(id)).toBe(id);
  });

  it.each([null, '', 'x'.repeat(65), 'has space', 'new\nline', 'semi;colon', '{"json":1}', 'ünïcode'])('generates a UUID for %j', (id) => {
    const got = requestIdFrom(id);
    expect(got).toMatch(UUID);
    expect(got).not.toBe(id);
  });
});
