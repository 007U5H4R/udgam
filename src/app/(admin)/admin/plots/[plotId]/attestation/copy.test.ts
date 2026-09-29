import { describe, expect, it } from 'vitest';
import { outcomeOf, REASON_TEXT, STATUS_OF } from './copy';

// The attestation form reads the route's answer by its HTTP status first, then by its reason: an expired
// session, a front proxy's size refusal and a server failure each get their own plain instruction, never
// "Fill in the issuer…" (Design.md §18).

const SIGNED_OUT = 'Your session has ended. Sign in again, then attach the certificate.';
const SERVER = 'The server could not store the certificate. Try again in a moment.';

describe('outcomeOf', () => {
  it('201 with an ID is saved', () => {
    expect(outcomeOf(201, { ok: true, id: 'AT-12345678' })).toEqual({ ok: true, id: 'AT-12345678' });
  });

  it('401 (the session expired) asks to sign in again, whatever the body', () => {
    expect(outcomeOf(401, { error: 'unauthenticated' })).toEqual({ ok: false, message: SIGNED_OUT });
    expect(outcomeOf(401, null)).toEqual({ ok: false, message: SIGNED_OUT });
  });

  it('413 is too large, even from a front proxy that answers with an HTML page', () => {
    expect(outcomeOf(413, null)).toEqual({ ok: false, message: 'The file is larger than 10 MB. Choose a smaller PDF.' });
    expect(outcomeOf(413, { ok: false, reason: 'too_large' })).toEqual({ ok: false, message: REASON_TEXT.too_large });
  });

  it('a 5xx, or a body that is not the route’s JSON, is a failure to store: try again', () => {
    expect(outcomeOf(500, null)).toEqual({ ok: false, message: SERVER });
    expect(outcomeOf(502, null)).toEqual({ ok: false, message: SERVER });
    expect(outcomeOf(503, { ok: false, reason: 'invalid_input' })).toEqual({ ok: false, message: SERVER });
    expect(outcomeOf(200, null)).toEqual({ ok: false, message: SERVER });
    expect(outcomeOf(201, { ok: true })).toEqual({ ok: false, message: SERVER });
    expect(outcomeOf(422, null)).toEqual({ ok: false, message: SERVER });
  });

  it('a refusal with a known reason shows that reason’s words', () => {
    for (const reason of Object.keys(STATUS_OF) as (keyof typeof STATUS_OF)[]) {
      if (reason === 'too_large') continue;
      expect(outcomeOf(STATUS_OF[reason], { ok: false, reason }), reason).toEqual({ ok: false, message: REASON_TEXT[reason] });
    }
    expect(outcomeOf(422, { ok: false, reason: 'issuer_invalid' })).toEqual({
      ok: false,
      message: 'Enter only the issuer’s name, in plain text: no hidden characters, and no wording about verification.',
    });
  });

  it('a 403 without a reason (another role) is not allowed; an unknown reason falls back to the fill-in hint', () => {
    expect(outcomeOf(403, { error: 'forbidden' })).toEqual({ ok: false, message: REASON_TEXT.not_allowed });
    expect(outcomeOf(422, { ok: false, reason: 'something_new' })).toEqual({ ok: false, message: REASON_TEXT.invalid_input });
    expect(outcomeOf(400, { ok: false, reason: '__proto__' })).toEqual({ ok: false, message: REASON_TEXT.invalid_input });
  });

  it('the date refusal names the allowed range', () => {
    expect(REASON_TEXT.bad_dates).toBe(
      'Check the dates: each must be a real date from 2000 on and no more than 10 years ahead, and “Valid until” cannot be before “Valid from”.',
    );
  });
});
