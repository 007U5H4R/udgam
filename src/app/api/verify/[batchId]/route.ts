import { getDbReady } from '../../../../lib/db/client';
import { resolveFeed } from '../../../../lib/ledger/feed';
import { errFields, log } from '../../../../lib/log';
import { JSON_HEADERS, notFound, unavailable } from './responses';

// GET /api/verify/[batchId]?h= — the batch's proof feed v1 (technical-plan §8.3, docs/proof-feed.md).
// Public, no session. Unknown batch, missing h and wrong h answer the same 404 (TP8, GAP-6).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ batchId: string }> }): Promise<Response> {
  const { batchId } = await ctx.params;
  const h = new URL(req.url).searchParams.get('h');
  try {
    const feed = await resolveFeed(await getDbReady(), batchId, h);
    if (!feed) return notFound();
    return new Response(JSON.stringify(feed), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    log.error(errFields(err), 'proof_feed.failed');
    return unavailable();
  }
}
