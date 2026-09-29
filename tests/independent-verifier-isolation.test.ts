// TC-073 (static part) · TSK-18.1: the clean-room proof checker shares no code with the app.
// Every import in evals/scorers/independent-verifier/** must be relative and resolve inside that
// folder, or be a `node:` built-in. Test files may also import the test runner (`vitest`), which is
// not app code and never ships with the checker.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd(), 'evals/scorers/independent-verifier');

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (/\.(c|m)?tsx?$/.test(name)) out.push(p);
  }
  return out;
}

// import … from 'x' · export … from 'x' · import 'x' · import('x') · require('x')
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"`])([^'"`]+)\1/g;

function specifiers(source: string): string[] {
  return [...source.matchAll(SPECIFIER)].map((m) => m[2] as string);
}

function violations(root: string): string[] {
  const bad: string[] = [];
  for (const file of tsFiles(root)) {
    const isTest = /\.test\.tsx?$/.test(file);
    for (const spec of specifiers(readFileSync(file, 'utf8'))) {
      if (spec.startsWith('node:')) continue;
      if (isTest && spec === 'vitest') continue;
      if (spec.startsWith('./') || spec.startsWith('../')) {
        const target = resolve(dirname(file), spec);
        const rel = relative(root, target);
        if (rel !== '' && !rel.startsWith('..') && !rel.startsWith(sep)) continue;
      }
      bad.push(`${relative(process.cwd(), file)}: ${spec}`);
    }
  }
  return bad;
}

describe('TC-073 static: the clean-room checker imports nothing from the app', () => {
  it('has source files, and every import is relative-inside-the-folder or node:', () => {
    expect(tsFiles(join(ROOT, 'src')).length).toBeGreaterThan(0);
    expect(violations(ROOT)).toEqual([]);
  });

  it('detects a planted import of app code', () => {
    const planted = join(ROOT, 'src', `__planted_${process.pid}.ts`);
    mkdirSync(dirname(planted), { recursive: true });
    writeFileSync(planted, "import { sha256Hex } from '../../../src/lib/crypto';\nexport const x = sha256Hex;\n");
    try {
      const bad = violations(ROOT);
      expect(bad).toHaveLength(1);
      expect(bad[0]).toContain('../../../src/lib/crypto');
    } finally {
      rmSync(planted, { force: true });
    }
  });

  it('detects bare packages, path aliases, dynamic imports and require', () => {
    const planted = join(ROOT, `__planted2_${process.pid}.ts`);
    writeFileSync(
      planted,
      [
        "import canonicalize from 'canonicalize';",
        "import { x } from '@/lib/ledger/merkle';",
        "const m = await import('../proof-verifier');",
        "const r = require('crypto');",
        "import { readFileSync } from 'node:fs';",
        "export { canonicalize, x, m, r, readFileSync };",
      ].join('\n'),
    );
    try {
      const bad = violations(ROOT).map((b) => b.split(': ')[1]);
      expect(bad.sort()).toEqual(['../proof-verifier', '@/lib/ledger/merkle', 'canonicalize', 'crypto']);
    } finally {
      rmSync(planted, { force: true });
    }
  });
});
