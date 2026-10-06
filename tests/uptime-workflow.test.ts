import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDirs } from './helpers/tmp';

// TSK-28.3 (TC-090) and SEC-003: .github/workflows/uptime.yml. The probe step's script runs here for
// real (bash + jq), with a stand-in `curl` on PATH that answers each fixture body from
// tests/fixtures/uptime/health-bodies.json, so the alert rules are tested, not just read.

const WORKFLOW = readFileSync('.github/workflows/uptime.yml', 'utf8');
const BODIES = JSON.parse(readFileSync('tests/fixtures/uptime/health-bodies.json', 'utf8')) as Record<string, unknown>;
const tempDir = tempDirs();

/** The `run: |` block of the step named `name`, de-indented as YAML does for a literal block scalar. */
function stepScript(name: string): string {
  const lines = WORKFLOW.split('\n');
  const at = lines.findIndex((l) => l.trim() === `- name: ${name}`);
  expect(at, `step "${name}"`).toBeGreaterThanOrEqual(0);
  const runAt = lines.findIndex((l, i) => i > at && /^\s+run: \|$/.test(l));
  const indent = lines[runAt]!.search(/\S/);
  const block: string[] = [];
  for (const l of lines.slice(runAt + 1)) {
    if (l.trim() !== '' && l.search(/\S/) <= indent) break;
    block.push(l);
  }
  const strip = Math.min(...block.filter((l) => l.trim() !== '').map((l) => l.search(/\S/)));
  return block.map((l) => l.slice(strip)).join('\n');
}

const SCRIPT = stepScript('Probe /api/health');

/**
 * Run the probe with a fake curl: it writes `body` to the --output file and exits `curlExit` (22 is
 * curl's "HTTP error" with --fail-with-body). It records the URL it was given.
 */
function probe(opts: { domain?: string; body?: string; curlExit?: number }) {
  const dir = tempDir('udgam-uptime-');
  const bin = join(dir, 'bin');
  spawnSync('mkdir', ['-p', bin]);
  writeFileSync(
    join(bin, 'curl'),
    `#!/usr/bin/env bash
out=""; url=""
while [ $# -gt 0 ]; do case "$1" in --output) out="$2"; shift 2;; --*) [ "$1" = --max-time ] || [ "$1" = --retry ] || [ "$1" = --retry-delay ] && shift; shift;; *) url="$1"; shift;; esac; done
printf '%s' "$url" > "${dir}/url"
if [ -n "$FAKE_BODY" ]; then printf '%s' "$FAKE_BODY" > "$out"; fi
exit "\${FAKE_EXIT:-0}"
`,
  );
  chmodSync(join(bin, 'curl'), 0o755);
  const r = spawnSync('bash', ['-c', SCRIPT], {
    encoding: 'utf8',
    env: { NODE_ENV: 'test', PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: dir, UDGAM_DOMAIN: opts.domain ?? 'udgam.example', FAKE_BODY: opts.body ?? '', FAKE_EXIT: String(opts.curlExit ?? 0) },
  });
  let url = '';
  try {
    url = readFileSync(join(dir, 'url'), 'utf8');
  } catch {
    // curl never ran
  }
  return { code: r.status, out: r.stdout + r.stderr, url };
}
const body = (name: string) => JSON.stringify(BODIES[name]);

describe('uptime.yml: triggers, permissions and pinning', () => {
  it('runs every 15 minutes and on demand', () => {
    expect(WORKFLOW).toMatch(/^on:\n {2}schedule:\n {4}- cron: '\*\/15 \* \* \* \*'\n {2}workflow_dispatch:\n/m);
  });

  it('has no token scopes, no checkout and every action (if any) pinned to a full commit SHA (SEC-202)', () => {
    expect(WORKFLOW).toMatch(/^permissions: \{\}$/m);
    for (const u of WORKFLOW.match(/uses:\s*\S+/g) ?? []) expect(u).toMatch(/@[0-9a-f]{40}$/);
    expect(WORKFLOW).not.toMatch(/actions\/checkout/);
  });

  it('takes the domain from the repository variable through env, never interpolated into the script', () => {
    expect(WORKFLOW).toContain('UDGAM_DOMAIN: ${{ vars.UDGAM_DOMAIN }}');
    expect(SCRIPT).not.toContain('${{');
  });

  it('curls /api/health with --fail and a 20 s limit', () => {
    expect(SCRIPT).toMatch(/curl --fail-with-body .*--max-time 20/);
  });
});

describe('uptime.yml: the probe script', () => {
  it('skips with a notice, not a failure, while UDGAM_DOMAIN is empty (no email every 15 minutes)', () => {
    const r = probe({ domain: '' });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^::notice title=Uptime probe skipped::/m);
    expect(r.url).toBe('');
  });

  it('refuses a domain that is not a bare host name', () => {
    for (const d of ['https://udgam.example', 'udgam.example/api', 'udgam.example:443', 'a b', '-x.example']) {
      const r = probe({ domain: d, body: body('healthy') });
      expect(r.code, d).toBe(1);
      expect(r.out).toMatch(/::error title=Uptime probe misconfigured::/);
      expect(r.url).toBe('');
    }
  });

  it('passes on a healthy answer, probing https://<domain>/api/health', () => {
    const r = probe({ body: body('healthy') });
    expect(r.out).not.toContain('::error');
    expect(r.code).toBe(0);
    expect(r.url).toBe('https://udgam.example/api/health');
    expect(r.out).toMatch(/^Healthy: \{"db":"ok","disk":"ok","lastSeq":42/m);
  });

  it('passes with an empty ledger, entries not yet checkpointed, and a checkpoint exactly 24 h old', () => {
    for (const name of ['emptyLedger', 'entriesNoCheckpointYet', 'checkpointExactly24h', 'staleButNoEntries']) expect(probe({ body: body(name) }).code, name).toBe(0);
  });

  it('fails when the last checkpoint is over 24 h old while the ledger has entries (TC-090)', () => {
    const r = probe({ body: body('checkpointStale') });
    expect(r.code).toBe(1);
    expect(r.out).toContain('::error title=Production degraded::ledger: the last checkpoint is 86401 s old (over 24 h) with 42 entries');
  });

  it('fails when disk is low, unknown or not reported (SEC-003)', () => {
    for (const [name, says] of [
      ['diskLow', 'disk is low'],
      ['diskUnknown', 'disk is unknown'],
      ['diskNotReported', 'disk is not reported'],
    ] as const) {
      const r = probe({ body: body(name) });
      expect(r.code, name).toBe(1);
      expect(r.out).toContain(`::error title=Production degraded::${says}`);
    }
  });

  it('fails when curl fails (down, 5xx such as 503 config:"error", TLS), showing the body when there is one (QA-P5-4)', () => {
    const r = probe({ body: body('configError'), curlExit: 22 });
    expect(r.code).toBe(1);
    expect(r.out).toContain('::error title=Production health check failed::GET https://udgam.example/api/health failed (curl exit 22).');
    expect(r.out).toContain('"config":"error"');
    const down = probe({ curlExit: 7 });
    expect(down.code).toBe(1);
    expect(down.out).toContain('(curl exit 7)');
  });

  it('fails on a 2xx answer that is not JSON (a parked domain, a captive page)', () => {
    const r = probe({ body: '<html>parked</html>' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('did not answer JSON');
  });

  it('a provider outage is a warning, not an alert (external, not actionable at 3 AM)', () => {
    const r = probe({ body: body('providersDown') });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^::warning title=Remote-sensing provider check::gfw=error sentinelHub=error/m);
  });

  it('never lets the server write workflow commands: a raw body or a field value cannot start a "::" line (review item 14)', () => {
    const ours = /^::(notice|error|warning) title=(Uptime probe skipped|Uptime probe misconfigured|Production health check failed|Production degraded|Remote-sensing provider check)::/;
    const foreign = (out: string) => out.split('\n').filter((l) => l.startsWith('::') && !ours.test(l));
    const raw = probe({ body: 'oops\n::add-mask::hidden\n::error::forged alert\n::stop-commands::x', curlExit: 22 });
    expect(raw.code).toBe(1);
    expect(foreign(raw.out)).toEqual([]);
    expect(raw.out).not.toContain('forged alert');
    const fields = probe({ body: JSON.stringify({ ...(BODIES.healthy as object), db: 'down\n::warning::injected', providers: { gfw: 'x\n::error::injected too', sentinelHub: 'ok' } }) });
    expect(fields.code).toBe(1);
    expect(foreign(fields.out)).toEqual([]);
    const jsonBody = probe({ body: JSON.stringify({ config: 'error', db: 'unchecked', note: '\n::error::in json' }), curlExit: 22 });
    expect(foreign(jsonBody.out)).toEqual([]);
    expect(jsonBody.out).toContain('"config":"error"'); // a JSON body is still shown, on one line
  });
});
