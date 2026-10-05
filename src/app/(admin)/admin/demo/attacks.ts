import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, desc, eq } from 'drizzle-orm';
import { createAuth } from '../../../../lib/auth/auth';
import type { Env } from '../../../../lib/config/env';
import type { Db } from '../../../../lib/db/client';
import { isAttackId, type AttackId, type AttackManifest } from '../../../../lib/demo/manifest';
import { farmers, harvestEvents, plots, user, verificationRuns } from '../../../../lib/db/schema';
import { log } from '../../../../lib/log';
import type { CheckResult, Verdict } from '../../../../lib/verification/types';
import { POST as capturePost } from '../../../api/capture/route';

// The demo attack page's server side (technical-plan TSK-20.3, TP27, EVAL-074). The four attacks are
// staged by `pnpm seed` in DATA_DIR/demo/attacks (scripts/seed/attacks.ts): each one's exact signed
// payload, its signature and its photos, signed by agent 2's seeded phone. Submitting one sends those
// bytes through the very /api/capture handler a phone uses, under that agent's own session, so the
// verdict and evidence are the capture pipeline's, nothing staged.
//
// Test-only: the page and its action exist only with DEMO_MODE=1 on the Playwright server (E2E=1) or a
// development server; a production build without E2E answers 404 (technical-plan §1, EXE12).

export type DemoEnv = Pick<Env, 'NODE_ENV' | 'E2E' | 'DEMO_MODE'>;

/** Is the demo attack surface on? DEMO_MODE=1, and never in a real production deployment. */
export function demoEnabled(e: DemoEnv): boolean {
  return e.DEMO_MODE === '1' && (e.E2E === '1' || e.NODE_ENV !== 'production');
}

export { isAttackId, type AttackId, type AttackManifest };

const attacksDir = (dataDir: string) => join(dataDir, 'demo', 'attacks');
const SAFE_NAME = /^photo\d\.jpg$/;

/** The staged attacks, or null when the seed has not staged them (or the file is not one we wrote). */
export async function readManifest(dataDir: string): Promise<AttackManifest | null> {
  let m: AttackManifest;
  try {
    m = JSON.parse(await readFile(join(attacksDir(dataDir), 'manifest.json'), 'utf8')) as AttackManifest;
  } catch {
    return null;
  }
  if (m?.v !== 1 || !Array.isArray(m.attacks)) return null;
  if (!m.attacks.every((a) => isAttackId(a.id) && Array.isArray(a.photos) && a.photos.every((p) => SAFE_NAME.test(p)))) return null;
  return m;
}

export type AttackStatus = {
  id: AttackId;
  submitted: { eventId: string; runId: string; verdict: Verdict; catching: { id: string; status: string; evidence: string } | null } | null;
};

/**
 * Where each staged attack stands in this organisation: not yet submitted, or its capture's latest run
 * (verdict, and the expected check's result and evidence). Read by payload hash: a submitted attack is
 * the accepted capture of exactly those signed bytes.
 */
export async function attackStatuses(db: Db, orgId: string, m: AttackManifest): Promise<AttackStatus[]> {
  const out: AttackStatus[] = [];
  for (const a of m.attacks) {
    const [run] = await db
      .select({ eventId: harvestEvents.id, runId: verificationRuns.id, verdict: verificationRuns.verdict, checks: verificationRuns.checks })
      .from(harvestEvents)
      .innerJoin(plots, eq(plots.id, harvestEvents.plotId))
      .innerJoin(farmers, eq(farmers.id, plots.farmerId))
      .innerJoin(verificationRuns, eq(verificationRuns.eventId, harvestEvents.id))
      .where(and(eq(harvestEvents.payloadHash, a.payloadHash), eq(harvestEvents.boundaryStatus, 'accepted'), eq(farmers.orgId, orgId)))
      .orderBy(desc(verificationRuns.runNo))
      .limit(1);
    if (!run) {
      out.push({ id: a.id, submitted: null });
      continue;
    }
    const c = (JSON.parse(run.checks) as CheckResult[]).find((k) => k.id === a.expected.check);
    out.push({
      id: a.id,
      submitted: { eventId: run.eventId, runId: run.runId, verdict: run.verdict, catching: c ? { id: c.id, status: c.status, evidence: c.evidence } : null },
    });
  }
  return out;
}

/** The staging agent's password from DATA_DIR/seed-credentials.txt (written by the seed, 0600). */
async function seededPassword(dataDir: string, email: string): Promise<string | null> {
  try {
    const lines = (await readFile(join(dataDir, 'seed-credentials.txt'), 'utf8')).split('\n');
    for (const l of lines) {
      const [, e, p] = l.split('\t');
      if (e === email && p) return p;
    }
  } catch {
    // no credentials file: the seed did not run here
  }
  return null;
}

/** A Cookie header from a Better Auth response's Set-Cookie lines. */
const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0]!)
    .join('; ');

const SUBMIT_FAILURES = ['not_staged', 'no_session', 'refused', 'failed'] as const;
export type SubmitFailure = (typeof SUBMIT_FAILURES)[number];

export type SubmitResult =
  | { ok: true; verdict: Verdict; eventId: string; checks: { id: string; status: string; evidence: string }[]; idempotent: boolean }
  | { ok: false; reason: SubmitFailure; status: number; detail?: string };

/** A `?error=` value the page may show: one of the known failure codes, else nothing (never echoed text). */
export const failureOf = (v: unknown): SubmitFailure | null => (typeof v === 'string' && (SUBMIT_FAILURES as readonly string[]).includes(v) ? (v as SubmitFailure) : null);

/** One NDJSON line of the capture answer. */
type Line = { t: string; verdict?: Verdict; eventId?: string; checks?: { id: string; status: string; evidence: string }[]; idempotent?: boolean; reason?: string; status?: number };

/**
 * Submit staged attack `id` for an admin of `orgId`: sign in as the staging phone's agent (a server-side
 * session of its own, never the admin's cookie), POST the staged payload, signature and photos to
 * /api/capture's handler and read its NDJSON answer to the verdict, then sign that session out again.
 * Resubmitting gets the original verdict back (TP7). Refused as not staged when the staging agent is not
 * in the admin's organisation.
 */
export async function submitStaged(db: Db, dataDir: string, id: AttackId, orgId: string): Promise<SubmitResult> {
  const m = await readManifest(dataDir);
  const a = m?.attacks.find((x) => x.id === id);
  if (!m || !a) return { ok: false, reason: 'not_staged', status: 404 };
  const [agent] = await db.select({ orgId: user.orgId }).from(user).where(eq(user.email, m.agentEmail)).limit(1);
  if (!agent || agent.orgId !== orgId) return { ok: false, reason: 'not_staged', status: 404 };
  const dir = join(attacksDir(dataDir), a.id);
  let payload: string;
  let signature: string;
  let photos: Uint8Array<ArrayBuffer>[];
  try {
    payload = await readFile(join(dir, 'payload.json'), 'utf8');
    signature = (await readFile(join(dir, 'signature.txt'), 'utf8')).trim();
    photos = await Promise.all(a.photos.map(async (p) => new Uint8Array(await readFile(join(dir, p)))));
  } catch {
    return { ok: false, reason: 'not_staged', status: 404 };
  }

  const password = await seededPassword(dataDir, m.agentEmail);
  if (!password) return { ok: false, reason: 'no_session', status: 401 };
  // A plain instance (no Next cookie plugin): the agent's session must never be set on the admin's browser.
  const auth = createAuth(db);
  const signIn = await auth.api.signInEmail({ body: { email: m.agentEmail, password }, asResponse: true });
  const cookie = cookieOf(signIn);
  if (!signIn.ok || !cookie) return { ok: false, reason: 'no_session', status: 401 };
  try {
    return await postStaged(payload, signature, photos, cookie);
  } finally {
    // Revoke the agent's session at once: it existed only for this one submission. A failure here is
    // logged (the error's class only, never the cookie) and does not replace the capture's own result.
    try {
      await auth.api.signOut({ headers: new Headers({ cookie }) });
    } catch (err) {
      log.warn({ errClass: err instanceof Error ? err.constructor.name : typeof err }, 'demo.agent_signout_failed');
    }
  }
}

/** POST one staged capture to /api/capture's handler under `cookie`, and read its answer. */
async function postStaged(payload: string, signature: string, photos: Uint8Array<ArrayBuffer>[], cookie: string): Promise<SubmitResult> {
  const form = new FormData();
  form.set('payload', payload);
  form.set('signature', signature);
  photos.forEach((b, i) => form.set(`photo${i}`, new File([b], `photo${i}.jpg`, { type: 'image/jpeg' })));
  const encoded = new Request('http://demo.invalid/api/capture', { method: 'POST', body: form });
  const body = await encoded.arrayBuffer();
  const res = await capturePost(
    new Request('http://demo.invalid/api/capture', {
      method: 'POST',
      body,
      headers: {
        'content-type': encoded.headers.get('content-type')!,
        'content-length': String(body.byteLength),
        cookie,
        // The demo page's own rate-limit bucket (198.18.0.0/15 is for testing, RFC 2544).
        'x-forwarded-for': '198.18.20.20',
      },
    }),
  );
  const lines = (await res.text())
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Line);
  const last = lines.at(-1);
  if (last?.t === 'verdict' && last.verdict && last.eventId) {
    return { ok: true, verdict: last.verdict, eventId: last.eventId, checks: last.checks ?? [], idempotent: last.idempotent === true };
  }
  if (last?.t === 'rejected') return { ok: false, reason: 'refused', status: last.status ?? res.status, ...(last.reason ? { detail: last.reason } : {}) };
  return { ok: false, reason: 'failed', status: res.status };
}
