// Upload limits at the capture boundary (technical-plan §22 TSK-19.2, §16 "upload abuse", TC-074).
// A camera photo is at most 10 MB; a capture carries 1–3 of them. The body cap leaves 256 KB for the
// payload, the signature and the multipart framing.

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS = 3;
export const MAX_BODY_BYTES = 3 * MAX_PHOTO_BYTES + 256 * 1024;

/**
 * Capture requests buffered and processed at once, per process (TASK-20 fix round 1): each may hold a
 * body of up to MAX_BODY_BYTES in memory. Past it the route answers 503 with Retry-After, unread.
 */
export const MAX_CAPTURES_IN_FLIGHT = 4;
/** Seconds a phone waits before retrying a capture refused as busy. */
export const BUSY_RETRY_AFTER_SEC = 5;
