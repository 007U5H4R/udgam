import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Fix round 1, S3 (EXE14, SEC-006): every route to the app (capture, attestation, admin, the rest) must
// overwrite X-Forwarded-For with the address Caddy saw and drop X-Real-IP.
//   1. A text check on deploy/Caddyfile, always run.
//   2. The real thing: `caddy adapt` in the pinned Caddy image turns the Caddyfile into Caddy's JSON, and
//      every reverse_proxy handler in it is checked. Needs Docker and the pinned image present locally
//      (it never pulls); skipped otherwise.

const CADDYFILE = readFileSync('deploy/Caddyfile', 'utf8');
const IMAGE = /^\s+image: (caddy:\S+)$/m.exec(readFileSync('deploy/docker-compose.yml', 'utf8'))![1]!;

describe('deploy/Caddyfile, as text', () => {
  it('defines the client_ip snippet with both header lines', () => {
    const snippet = /\(client_ip\) \{([\s\S]*?)\n\}/.exec(CADDYFILE)?.[1] ?? "";
    expect(snippet).toMatch(/^\s*header_up X-Forwarded-For \{remote_host\}$/m);
    expect(snippet).toMatch(/^\s*header_up -X-Real-IP$/m);
  });

  it('imports it in every reverse_proxy block, and has no trusted_proxies', () => {
    const blocks = [...CADDYFILE.matchAll(/reverse_proxy app:3000 \{([^}]*)\}/g)].map((m) => m[1]!);
    expect(blocks.length).toBe((CADDYFILE.match(/reverse_proxy /g) ?? []).length);
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    for (const b of blocks) expect(b).toMatch(/^\s*import client_ip$/m);
    expect(CADDYFILE).not.toMatch(/^\s*trusted_proxies/m);
  });
});

const docker = spawnSync('docker', ['image', 'inspect', '--format', '{{.Id}}', IMAGE], { encoding: 'utf8' });
const hasImage = docker.status === 0;

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;
function proxies(node: Json, path = '', out: { path: string; h: Record<string, unknown> }[] = []) {
  if (Array.isArray(node)) node.forEach((n, i) => proxies(n as Json, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') {
    if ((node as Record<string, unknown>).handler === 'reverse_proxy') out.push({ path, h: node as Record<string, unknown> });
    for (const [k, v] of Object.entries(node)) proxies(v as Json, `${path}.${k}`, out);
  }
  return out;
}

describe.skipIf(!hasImage)(`deploy/Caddyfile through \`caddy adapt\` (${IMAGE})`, () => {
  it('sets X-Forwarded-For to the remote host and deletes X-Real-IP on every reverse_proxy', () => {
    const r = spawnSync(
      'docker',
      ['run', '--rm', '--network', 'none', '-e', 'UDGAM_DOMAIN=udgam.example.org', '-v', `${resolve('deploy/Caddyfile')}:/etc/caddy/Caddyfile:ro`, IMAGE, 'caddy', 'adapt', '--config', '/etc/caddy/Caddyfile'],
      { encoding: 'utf8', timeout: 60_000 },
    );
    expect(r.status, r.stderr).toBe(0);
    const found = proxies(JSON.parse(r.stdout) as Json);
    expect(found.length).toBeGreaterThanOrEqual(4); // capture, attestation, admin, the rest
    for (const { path, h } of found) {
      const req = ((h.headers as Record<string, unknown> | undefined)?.request ?? {}) as { set?: Record<string, string[]>; delete?: string[] };
      expect(req.set?.['X-Forwarded-For'], path).toEqual(['{http.request.remote.host}']);
      expect((req.delete ?? []).map((d) => d.toLowerCase()), path).toContain('x-real-ip');
    }
  });
});
