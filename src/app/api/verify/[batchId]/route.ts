import { getDbReady } from '../../../../lib/db/client';
import { resolveFeed } from '../../../../lib/ledger/feed';
import { log } from '../../../../lib/log';

// GET /api/verify/[batchId]?h= — the batch's proof feed v1 (technical-plan §8.3, docs/proof-feed.md).
// Public, no session. Unknown batch, missing h and wrong h answer the same 404 (TP8, GAP-6).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const NOT_FOUND = '{"error":"not_found"}';

export async function GET(req: Request, ctx: { params: Promise<{ batchId: string }> }): Promise<Response> {
  const { batchId } = await ctx.params;
  const h = new URL(req.url).searchParams.get('h');
  try {
    const feed = await resolveFeed(await getDbReady(), batchId, h);
    if (!feed) return new Response(NOT_FOUND, { status: 404, headers: HEADERS });
    return new Response(JSON.stringify(feed), { status: 200, headers: HEADERS });
  } catch (err) {
    log.error({ errClass: err instanceof Error ? err.constructor.name : 'unknown' }, 'proof_feed.failed');
    return new Response('{"error":"unavailable"}', { status: 503, headers: HEADERS });
  }
}
