import { jcs, sha256Hex } from '../crypto';
import { CONFIG, CONFIG_HASH, type VerifyConfig } from './config';
import { evidence } from './evidence';
import { REGISTRY, type Check } from './registry';
import { score } from './score';
import type { CheckResult, Submission, VerifyContext, VerifyOptions, VerifyResult } from './types';

function errorClass(err: unknown): string {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) return err.name; // e.g. TimeoutError
  if (err instanceof Error) return err.constructor.name;
  return typeof err;
}

function unavailable(check: Check, config: VerifyConfig, sentence: string): CheckResult {
  return {
    id: check.id,
    status: 'unavailable',
    score: 0,
    weight: config.weights[check.id],
    hardFail: false,
    evidence: sentence,
    ...(check.provider ? { provider: check.provider } : {}),
  };
}

/** Run one check. A throw becomes `unavailable` with "Check could not run: <ErrorClass>" (§7 rule 4). */
export async function runCheck(
  check: Check,
  sub: Submission,
  ctx: VerifyContext,
  config: VerifyConfig,
  opts?: { signal?: AbortSignal },
): Promise<CheckResult> {
  try {
    const out = await check.run(sub, ctx, config, opts);
    return {
      ...out,
      id: check.id,
      weight: config.weights[check.id],
      score: out.status === 'unavailable' ? 0 : config.statusScore[out.status],
    };
  } catch (err) {
    return unavailable(check, config, evidence.threw(errorClass(err)));
  }
}

function notify(opts: VerifyOptions | undefined, r: CheckResult): void {
  try {
    opts?.onCheck?.(r);
  } catch {
    // A progress listener must never change the verdict.
  }
}

/**
 * verify() over an explicit registry and config. Used by verify() and by tests/harness fault
 * injection (EVAL-018 `check_throws`). Local checks run concurrently, then remote checks with
 * Promise.allSettled under the remote phase cap (TP12); anything still running at the cap is
 * unavailable ("no answer within 10 s") and its provider calls are aborted. Never throws.
 */
export async function verifyWith(
  registry: readonly Check[],
  sub: Submission,
  ctx: VerifyContext,
  opts?: VerifyOptions,
  config: VerifyConfig = CONFIG,
): Promise<VerifyResult> {
  const enabled = opts?.enabled ? new Set(opts.enabled) : null;
  const active = registry.filter((c) => !enabled || enabled.has(c.id));
  const results = new Map<Check, CheckResult>();
  const finish = (c: Check, r: CheckResult) => {
    results.set(c, r);
    notify(opts, r);
  };

  const local = active.filter((c) => c.kind === 'local');
  await Promise.all(local.map(async (c) => finish(c, await runCheck(c, sub, ctx, config))));

  const remote = active.filter((c) => c.kind === 'remote');
  if (remote.length > 0) {
    // Every remote check gets the phase's signal and hands it to its provider calls: at the cap the
    // in-flight requests are aborted, not left running (S3 budget, TP12).
    const phase = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cap = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, config.providers.remotePhaseCapMs);
    });
    const all = Promise.allSettled(
      remote.map(async (c) => {
        const r = await runCheck(c, sub, ctx, config, { signal: phase.signal });
        if (!results.has(c)) finish(c, r);
      }),
    );
    await Promise.race([all, cap]);
    clearTimeout(timer);
    for (const c of remote) if (!results.has(c)) finish(c, unavailable(c, config, evidence.noAnswer(c.id, config.providers.remotePhaseCapMs)));
    phase.abort();
  }

  const checks = active.map((c) => results.get(c)!);
  const { verdict, score: s, capReasons } = score(checks, config);
  const unavailableProviders = [...new Set(checks.filter((c) => c.status === 'unavailable' && c.provider).map((c) => c.provider!))];
  return {
    verdict,
    score: s,
    checks,
    unavailableProviders,
    capReasons,
    config: { version: config.version, hash: config === CONFIG ? CONFIG_HASH : await sha256Hex(jcs(config)) },
  };
}

/** technical-plan §6.1: verify a submission against the registry under cfg-1. Never throws. */
export function verify(sub: Submission, ctx: VerifyContext, opts?: VerifyOptions): Promise<VerifyResult> {
  return verifyWith(REGISTRY, sub, ctx, opts, CONFIG);
}
