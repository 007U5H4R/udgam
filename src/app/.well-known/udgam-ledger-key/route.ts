import { publishedKeys } from '../../../lib/ledger/keys';
import { log } from '../../../lib/log';

// The ledger's public key (technical-plan §8.2): the trust anchor a proof-feed verifier checks
// checkpoint signatures against. Public; the private member is never part of the response.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    return Response.json(await publishedKeys(), { headers: { 'cache-control': 'public, max-age=300' } });
  } catch (err) {
    log.error({ errClass: err instanceof Error ? err.constructor.name : 'unknown' }, 'ledger.key_unavailable');
    return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
