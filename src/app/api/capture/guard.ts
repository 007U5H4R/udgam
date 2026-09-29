/**
 * TODO(TKT-04): replace with `requireSession('agent')` and check that the signing device belongs to
 * that agent (technical-plan §10). Until then /api/capture accepts the TKT-02 tracer's seeded device
 * without a session; the device signature is still verified at the boundary.
 *
 * route.int.test.ts asserts that this stub is present and called; TKT-04 replaces it and must change
 * that test, so the stub cannot be forgotten.
 */
export const CAPTURE_SESSION_GUARD_IS_STUB = true;

export async function captureSessionGuard(req: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  void req; // TKT-04 reads the session cookie from it
  return { ok: true };
}
