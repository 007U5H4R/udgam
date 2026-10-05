// The proof feed's error answers, shared by GET /api/verify/[batchId] and its EUDR map file
// (GET /api/verify/[batchId]/geojson) so an unknown batch, a missing h and a wrong h stay byte for byte
// the same on both (TP8). A route file may export only its handlers and config, hence this module.

export const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } as const;

/** 404 for an unknown batch, a missing h and a wrong h alike (TP8, GAP-6). */
export const notFound = (): Response => new Response('{"error":"not_found"}', { status: 404, headers: JSON_HEADERS });

/** 503 when the feed cannot be built; the caller logs only the error class. */
export const unavailable = (): Response => new Response('{"error":"unavailable"}', { status: 503, headers: JSON_HEADERS });
