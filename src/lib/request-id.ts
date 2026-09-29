import { randomUUID } from 'node:crypto';

/** A client request id short and plain enough to put on log lines as given. */
const CLIENT_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * The request id for a request's log lines: the client's `x-request-id` when it matches
 * `^[A-Za-z0-9._-]{1,64}$`, else a generated UUID (an attacker-chosen value never reaches the audit logs
 * unbounded).
 */
export function requestIdFrom(header: string | null | undefined): string {
  return header && CLIENT_REQUEST_ID.test(header) ? header : randomUUID();
}
