import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Fix round 1, Q10: everything the instance pulls or installs to build and run the stack is pinned by
// digest or hash. A bump is a deliberate edit (docs/ops/deploy.md, "Bumping a pinned image").

const DIGEST = /@sha256:[0-9a-f]{64}$/;
const dockerfiles = ['deploy/Dockerfile', 'deploy/anvil.Dockerfile'];

describe('pinned images', () => {
  it.each(dockerfiles)('%s pins its Dockerfile frontend by digest', (f) => {
    const first = readFileSync(f, 'utf8').split('\n')[0]!;
    expect(first).toMatch(/^# syntax=docker\/dockerfile:1@sha256:[0-9a-f]{64}$/);
  });

  it.each(dockerfiles)('%s pins every base image by digest', (f) => {
    const text = readFileSync(f, 'utf8');
    const defaults = [...text.matchAll(/^ARG (?:NODE_IMAGE|BASE_IMAGE)=(\S+)$/gm)].map((m) => m[1]!);
    expect(defaults.length).toBeGreaterThan(0);
    for (const d of defaults) expect(d).toMatch(DIGEST);
    // every FROM is a pinned default, an earlier stage, or scratch
    const stages = [...text.matchAll(/^FROM .* AS (\S+)$/gm)].map((m) => m[1]!);
    for (const [, from] of text.matchAll(/^FROM (\S+)/gm)) {
      const ok = from === 'scratch' || from!.startsWith('${') || stages.some((s) => from === s || from!.startsWith('foundry-'));
      expect(ok, `FROM ${from}`).toBe(true);
    }
  });

  it('compose pins Caddy to a 2.x minor and its digest; app and anvil are built locally', () => {
    const compose = readFileSync('deploy/docker-compose.yml', 'utf8');
    const images = [...compose.matchAll(/^\s+image: (\S+)$/gm)].map((m) => m[1]!);
    expect(images.filter((i) => i.startsWith('caddy:'))).toEqual([expect.stringMatching(/^caddy:2\.\d+@sha256:[0-9a-f]{64}$/)]);
    for (const i of images.filter((i) => !i.startsWith('caddy:'))) expect(i).toMatch(/^udgam-(app|anvil):/);
  });
});

describe('pinned Python packages', () => {
  it('installs oci-cli from a fully hashed requirements file', () => {
    const req = readFileSync('deploy/oci-cli-requirements.txt', 'utf8');
    const pkgs = [...req.matchAll(/^([a-z0-9][a-z0-9._-]*)==(\S+) \\$/gm)];
    expect(pkgs.map((m) => m[1])).toContain('oci-cli');
    const blocks = req.split(/\n(?=[a-z0-9])/).filter((b) => /^[a-z0-9]/.test(b));
    expect(blocks.length).toBe(pkgs.length);
    for (const b of blocks) expect(b, b.split('\n')[0]).toMatch(/--hash=sha256:[0-9a-f]{64}/);
    const boot = readFileSync('deploy/bootstrap.sh', 'utf8');
    expect(boot).toMatch(/pip" install [^\n]*--require-hashes -r "\$REPO\/deploy\/oci-cli-requirements\.txt"/);
  });
});
