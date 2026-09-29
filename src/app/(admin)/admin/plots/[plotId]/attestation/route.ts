import { z } from 'zod';
import { AttestationError, attachAttestation, MAX_ATTESTATION_BYTES } from '../../../../../../lib/attestations/attach';
import { AuthError, authErrorResponse } from '../../../../../../lib/auth/guards';
import { getDbReady } from '../../../../../../lib/db/client';
import { requireSession, type Guarded } from '../../../../../_auth/require';
import { STATUS_OF, type AttestationReason, type AttestationResult } from './copy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /admin/plots/[plotId]/attestation (TKT-13): attach an organic certificate (a PDF up to 10 MB) to
// one of the org's plots. This is a route handler, not a Server Action, because Next's Server Action body
// cap is 3 MB for every action and is read before the guard runs (next.config.ts); here the guard runs
// first and the body cap is this route's own. Admin only; the org comes from the session, never from input.

const PLOT_ID = z.string().regex(/^PL-[0-9A-Z]{8}$/);
/** Room for the multipart envelope and the three text fields around the file. */
const ENVELOPE_BYTES = 64 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };

const answer = (r: AttestationResult): Response => Response.json(r, { status: r.ok ? 201 : STATUS_OF[r.reason], headers: NO_STORE });
const refuse = (reason: AttestationReason): Response => answer({ ok: false, reason });

const field = (form: FormData, key: string): string => {
  const v = form.get(key);
  return typeof v === 'string' ? v : '';
};

export async function POST(req: Request, ctx: { params: Promise<{ plotId: string }> }): Promise<Response> {
  let admin: Guarded;
  try {
    admin = await requireSession('admin', { request: req });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
  // A cookie-authenticated POST from another site is not ours (a browser always says where it came from).
  const site = req.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && site !== 'none') return refuse('not_allowed');

  const { plotId } = await ctx.params;
  if (!PLOT_ID.safeParse(plotId).success) return refuse('plot_not_found');

  // The size is checked before the body is read.
  const declared = req.headers.get('content-length');
  const length = declared === null ? Number.NaN : Number(declared);
  if (!Number.isInteger(length) || length < 0) return Response.json({ ok: false, reason: 'invalid_input' }, { status: 411, headers: NO_STORE });
  if (length > MAX_ATTESTATION_BYTES + ENVELOPE_BYTES) return refuse('too_large');

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return refuse('invalid_input');
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return refuse('no_file');
  if (file.size > MAX_ATTESTATION_BYTES) return refuse('too_large');

  try {
    const db = await getDbReady();
    const { id } = await attachAttestation(db, {
      orgId: admin.orgId,
      plotId,
      file: new Uint8Array(await file.arrayBuffer()),
      issuer: field(form, 'issuer'),
      validFrom: field(form, 'validFrom'),
      validTo: field(form, 'validTo'),
    });
    return answer({ ok: true, id });
  } catch (err) {
    if (err instanceof AttestationError) return refuse(err.code);
    throw err;
  }
}
