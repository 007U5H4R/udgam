// Upload limits at the capture boundary (technical-plan §22 TSK-19.2, §16 "upload abuse", TC-074).
// A camera photo is at most 10 MB; a capture carries 1–3 of them. The body cap leaves 256 KB for the
// payload, the signature and the multipart framing.

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS = 3;
export const MAX_BODY_BYTES = 3 * MAX_PHOTO_BYTES + 256 * 1024;

// The shape of the multipart body, checked on the raw bytes before it is parsed (SEC-002): the parser
// builds every part before parse.ts can refuse a duplicate or unknown one, so a body of many tiny parts
// cost seconds of event-loop time. Past any of these the body is refused as bad_form, unparsed.
/**
 * Parts in a capture form: payload, signature and staged, once each, and up to MAX_PHOTOS photos. One
 * photo too many still reaches parse.ts, which answers media_count as before.
 */
export const MAX_FORM_PARTS = 3 + MAX_PHOTOS;
/** Bytes of one non-file field: the signed payload is under 2 KB, the signature and staged list smaller. */
export const MAX_FIELD_BYTES = 16 * 1024;
/** Bytes of one part's header block (Content-Disposition with the photo's file name, Content-Type). */
export const MAX_PART_HEADER_BYTES = 2 * 1024;

/**
 * Capture requests buffered and processed at once, per process (TASK-20 fix round 1): each may hold a
 * body of up to MAX_BODY_BYTES in memory. Past it the route answers 503 with Retry-After, unread.
 * Eight (SEC-004, was 4), so one agent's share is a quarter of the pool: it takes four accounts trickling
 * bodies, not two, to hold every slot. At most 8 × 30 MB of bodies, held about three times over while
 * read and parsed: well under 1 GB of the 12 GB A1 instance.
 */
export const MAX_CAPTURES_IN_FLIGHT = 8;
/**
 * Of those, the most one signed-in agent may hold (TASK-20 fix round 2, N2): one agent's slow uploads,
 * or a stolen phone session, can never take every slot. Not 1: a phone's outbox sends its next capture
 * as soon as one is answered, while the server still holds that slot for the staging sweep after the
 * answer (pipeline.ts), so a share of one turned the next send into 503 busy (e2e TSK-11.3).
 */
export const MAX_CAPTURES_PER_AGENT = 2;
/**
 * How long a capture body may take to arrive once its slot is taken (TASK-20 fix round 2, N2). Past it
 * the read is cancelled, the slot is freed and the route answers 408 {t:"error", retryable:true}: the
 * phone keeps its outbox copy and sends it again. 30 MB in 60 s needs about 4 Mbit/s; a 3-photo capture
 * from a phone camera is usually 3–9 MB.
 */
export const BODY_READ_DEADLINE_MS = 60_000;
/** Seconds a phone waits before retrying a capture refused as busy. */
export const BUSY_RETRY_AFTER_SEC = 5;
