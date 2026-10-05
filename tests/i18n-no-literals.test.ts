import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// TSK-11.8 / TC-052 (static half): every word the capture app shows comes from the dictionaries
// (src/lib/i18n/{en,kn}.ts through t()), so the Kannada switch reaches all of it. A TypeScript-AST scan
// of the agent surfaces and the field and shared UI components finds:
//   - no JSX text containing a letter (in any script; digits, punctuation and whitespace are allowed);
//   - no aria-label, placeholder or title attribute given as a string literal (directly or in braces).

const ROOT = join(__dirname, '..');
const DIRS = ['src/app/(agent)', 'src/components/field', 'src/components/ui'];
const ATTRS = new Set(['aria-label', 'placeholder', 'title']);
const LETTER = /\p{L}/u;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Each literal the scan refuses in `source`: `file:line  what`. */
export function literals(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const at = (n: ts.Node) => `${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n) && LETTER.test(n.text)) found.push(`${at(n)}  text ${JSON.stringify(n.text.trim())}`);
    if (ts.isJsxAttribute(n) && ATTRS.has(n.name.getText(sf))) {
      const init = n.initializer;
      const lit = init && (ts.isStringLiteral(init) ? init : ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression)) ? init.expression : null);
      if (lit && LETTER.test(lit.text)) found.push(`${at(n)}  ${n.name.getText(sf)}=${JSON.stringify(lit.text)}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

describe('no user-facing literals outside the dictionaries (TC-052)', () => {
  it('the scan finds JSX text and literal aria-label / placeholder / title, and allows digits, punctuation and t()', () => {
    expect(literals('x.tsx', '<p>Hello</p>')).toEqual(['x.tsx:1  text "Hello"']);
    expect(literals('x.tsx', '<p>ಕನ್ನಡ</p>')).toHaveLength(1);
    expect(literals('x.tsx', '<b aria-label="Close" />')).toEqual(['x.tsx:1  aria-label="Close"']);
    expect(literals('x.tsx', "<b title={'Hi'} placeholder={`Type`} />")).toHaveLength(2);
    expect(literals('x.tsx', "<p>{t('a.b')} · 42 — {n}%</p>")).toEqual([]);
    expect(literals('x.tsx', "<b aria-label={t('a')} title={x} data-testid=\"ok\" className=\"row\" />")).toEqual([]);
  });

  it('src/app/(agent), src/components/field and src/components/ui have none', () => {
    const found = DIRS.flatMap((d) => tsxFiles(join(ROOT, d))).flatMap((f) => literals(relative(ROOT, f), readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });
});
