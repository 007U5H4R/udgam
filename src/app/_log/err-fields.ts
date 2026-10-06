// What a failure log in the web area says about the error (CR-106; technical-plan §15): its class and,
// when it carries one, its code as `errCode` (the field name shared with core's CR-007). A libSQL failure
// is always a LibsqlError, so the code is what tells SQLITE_BUSY from a missing table. Never the
// message or any value: a message can carry SQL text or user data. A code that is not a short plain
// identifier is dropped for the same reason.

const CODE = /^[A-Za-z0-9_.-]{1,64}$/;

export type ErrFields = { errClass: string; errCode?: string };

export function errFields(err: unknown): ErrFields {
  const cls = err instanceof Error ? err.constructor.name : typeof err;
  const code = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return typeof code === 'string' && CODE.test(code) ? { errClass: cls, errCode: code } : { errClass: cls };
}
