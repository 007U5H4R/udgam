import { AuthError, authErrorResponse } from '../../../../../lib/auth/guards';
import { env } from '../../../../../lib/config/env';
import { getDbReady } from '../../../../../lib/db/client';
import { errFields, log } from '../../../../../lib/log';
import { canReadMedia } from '../../../../../lib/media/access';
import { thumbnail } from '../../../../../lib/media/thumbs';
import { requireSession, type Guarded } from '../../../../_auth/require';

// GET /api/media/[mediaId]/thumb (technical-plan §3.2, TSK-10.13): a photo's thumbnail — never the
// original — for the agent who took it or an admin of the plot's organisation; used by Pickings
// (TKT-11) and the admin review (TKT-12). Anyone else gets the same 404 as an unknown photo.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_FOUND = () => Response.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
/** A database, disk or path-guard failure: an outage is not hidden as "no such photo" (CF-10's 404 is for access only). */
const FAILED = () => Response.json({ error: 'thumb_failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: Request, ctx: { params: Promise<{ mediaId: string }> }): Promise<Response> {
  let who: Guarded;
  try {
    who = await requireSession('agent', { request: req, alsoRoles: ['admin'] });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
  const { mediaId } = await ctx.params;
  try {
    const m = await canReadMedia(await getDbReady(), who, mediaId);
    if (!m) return NOT_FOUND();
    const bytes = await thumbnail(env.DATA_DIR, m);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (err) {
    log.error(errFields(err), 'media.thumb_failed');
    return FAILED();
  }
}
