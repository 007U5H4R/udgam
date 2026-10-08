import { readFile } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';
import { z } from 'zod';
import { getAttestation } from '../../../../../../../lib/attestations/attach';
import { AuthError, authErrorResponse } from '../../../../../../../lib/auth/guards';
import { env } from '../../../../../../../lib/config/env';
import { runtimePath } from '../../../../../../../lib/config/runtime-path';
import { sha256Hex } from '../../../../../../../lib/crypto';
import { getDbReady } from '../../../../../../../lib/db/client';
import { log } from '../../../../../../../lib/log';
import { requireSession, type Guarded } from '../../../../../../_auth/require';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /admin/plots/[plotId]/attestation/[attestationId] (TKT-13): download the certificate file, admin
// only. An unknown attestation, another org's and one on another plot answer the same 404 (EVAL-080).
// The bytes are hashed against the anchored file hash before they are sent: a file that changed on disk
// is never served as the recorded certificate.

const PLOT_ID = z.string().regex(/^PL-[0-9A-Z]{8}$/);
const ATTESTATION_ID = z.string().regex(/^AT-[0-9A-Z]{8}$/);
const NO_STORE = { 'Cache-Control': 'no-store' };

const notFound = () => Response.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });

export async function GET(req: Request, ctx: { params: Promise<{ plotId: string; attestationId: string }> }): Promise<Response> {
  let admin: Guarded;
  try {
    admin = await requireSession('admin', { request: req });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    throw err;
  }
  const { plotId, attestationId } = await ctx.params;
  if (!PLOT_ID.safeParse(plotId).success || !ATTESTATION_ID.safeParse(attestationId).success) return notFound();

  const db = await getDbReady();
  const row = await getAttestation(db, admin.orgId, plotId, attestationId);
  if (!row) return notFound();

  const root = runtimePath(env.DATA_DIR); // EXE39, CR-102: a run-time path, never traced
  const abs = runtimePath(root, row.filePath);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) return notFound();

  let bytes: Buffer;
  try {
    bytes = await readFile(abs);
  } catch {
    log.error({ attestationId }, 'attestation.file_missing');
    return Response.json({ error: 'file_unavailable' }, { status: 500, headers: NO_STORE });
  }
  if ((await sha256Hex(bytes)) !== row.fileHash) {
    log.error({ attestationId }, 'attestation.file_hash_mismatch');
    return Response.json({ error: 'file_changed' }, { status: 500, headers: NO_STORE });
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="certificate-${attestationId}.pdf"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    },
  });
}
