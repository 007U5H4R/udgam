import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// TSK-13.3 / TC-058 (the static half), TC-057, EVAL-079, DISC4, CF-11: product copy never says organic
// status is verified, and never accuses anyone. A certificate is an issuer's statement that Udgam keeps
// unchanged on record ("Certified by <issuer> — certificate on record"); a rejected capture is "Not
// accepted", never a charge of fraud. The guard searches every non-test file under src/ (which holds
// the i18n dictionaries in src/lib/i18n) for the banned phrases, case-insensitively, across line breaks.

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

/** Text file types that can carry product copy or comments. */
const TEXT = /\.(?:tsx?|jsx?|mjs|cjs|css|json|md|mdx|html|svg|txt|webmanifest)$/i;
/** Test files may quote a banned phrase to check for it. */
const TEST_FILE = /\.test\.[^./\\]+$/i;

export const BANNED: { name: string; pattern: RegExp }[] = [
  { name: 'verified organic', pattern: /verified\s+organic/i },
  { name: 'organic verified', pattern: /organic\s+verified/i },
  { name: 'organically verified', pattern: /organically\s+verified/i },
  { name: 'fraud', pattern: /\bfraud/i },
  { name: 'fake', pattern: /\bfake\b/i },
  { name: 'cheat', pattern: /\bcheat/i },
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return TEXT.test(e.name) && !TEST_FILE.test(e.name) ? [p] : [];
  });
}

/** Every banned phrase found in the non-test text files under `root`, as `file:line: phrase`. */
export function scan(root: string): { files: string[]; hits: string[] } {
  const files = walk(root);
  const hits: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const { name, pattern } of BANNED) {
      const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
      for (const m of text.matchAll(new RegExp(pattern.source, flags))) {
        const line = text.slice(0, m.index).split('\n').length;
        hits.push(`${relative(root, file).split(sep).join('/')}:${line}: ${name}`);
      }
    }
  }
  return { files, hits };
}

describe('wording guard (TC-058, TC-057, EVAL-079)', () => {
  it('src/ and the i18n dictionaries contain none of the banned phrases', () => {
    const { files, hits } = scan(SRC);
    // not vacuous: it really read the app, the dictionaries and the shared attestation wording
    const rel = files.map((f) => relative(ROOT, f).split(sep).join('/'));
    expect(rel.length).toBeGreaterThan(50);
    expect(rel).toContain('src/lib/i18n/en.ts');
    expect(rel).toContain('src/components/ui/AttestationLine.tsx');
    expect(hits).toEqual([]);
  });

  it('can fail: a planted phrase in a scratch copy is found, in every casing and across a line break', () => {
    const dir = mkdtempSync(join(tmpdir(), 'udgam-wording-'));
    try {
      mkdirSync(join(dir, 'lib', 'i18n'), { recursive: true });
      writeFileSync(join(dir, 'lib', 'i18n', 'en.ts'), "export const en = { a: 'Verified Organic', b: 'ORGANIC VERIFIED', c: 'organically verified' };\n");
      writeFileSync(join(dir, 'page.tsx'), '<p>This coffee is verified\n   organic.</p>\n// a Fraud alert, a Fake photo, a Cheating farmer\n');
      writeFileSync(join(dir, 'clean.ts'), "export const ok = 'Certified by INDOCERT — certificate on record';\n");
      writeFileSync(join(dir, 'quotes.test.ts'), "expect(text).not.toMatch(/verified organic/); // test files may quote it\n");
      const { hits } = scan(dir);
      expect(hits.map((h) => h.split(': ')[1]).sort()).toEqual(['cheat', 'fake', 'fraud', 'organic verified', 'organically verified', 'verified organic', 'verified organic'].sort());
      expect(hits.some((h) => h.startsWith('clean.ts') || h.startsWith('quotes.test.ts'))).toBe(false);
      expect(hits).toContain('page.tsx:1: verified organic');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a word that starts with fraud or cheat, but not one that only contains it or merely resembles fake', () => {
    const dir = mkdtempSync(join(tmpdir(), 'udgam-wording-'));
    try {
      writeFileSync(join(dir, 'a.ts'), '// unfraudulent defraud fakery fakes\n// fraudulent cheated\n');
      const { hits } = scan(dir);
      expect(hits.map((h) => h.split(': ')[1]).sort()).toEqual(['cheat', 'fraud']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
