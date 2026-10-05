import { getDbReady } from '../../../../../lib/db/client';
import { buildEudrGeoJson, serializeEudrGeoJson } from '../../../../../lib/eudr/geojson';
import { resolveFeed } from '../../../../../lib/ledger/feed';
import { log } from '../../../../../lib/log';
import { notFound, unavailable } from '../responses';

// GET /api/verify/[batchId]/geojson?h= — the batch's EUDR map file (TSK-17.2, technical-plan §12, TP24;
// docs/eudr-geojson.md). Public, no session, behind the same hash as the certificate: resolveFeed decides,
// so an unknown batch, a missing h and a wrong h answer the feed route's 404, byte for byte (TP8). The
// file is built from the feed alone (TP16) and carries producer IDs, never names (EV16).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ batchId: string }> }): Promise<Response> {
  const { batchId } = await ctx.params;
  const h = new URL(req.url).searchParams.get('h');
  try {
    const feed = await resolveFeed(await getDbReady(), batchId, h);
    if (!feed) return notFound(); // the feed route's own 404 (../responses.ts)
    const body = serializeEudrGeoJson(buildEudrGeoJson(feed));
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'application/geo+json',
        // feed.batchId is the anchored ID (B- + Crockford base32), so it needs no quoting beyond this
        'content-disposition': `attachment; filename="udgam-${feed.batchId}-eudr.geojson"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    log.error({ errClass: err instanceof Error ? err.constructor.name : 'unknown' }, 'eudr_geojson.failed');
    return unavailable();
  }
}
