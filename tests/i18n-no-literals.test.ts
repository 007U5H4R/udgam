import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// TSK-11.8 / TC-052 (static half): every word the capture app shows comes from the dictionaries
// (src/lib/i18n/{en,kn}.ts through t()), so the Kannada switch reaches all of it. A TypeScript-AST scan
// of the agent surfaces and the field and shared UI components finds:
//   - no JSX text containing a letter (in any script; digits, punctuation and whitespace are allowed);
//   - no aria-label, placeholder, title or alt attribute given as a string literal (directly or in braces);
//   - no literal child in braces, directly or through a ternary, && / || / ??, or a template literal.

const ROOT = join(__dirname, '..');
const DIRS = ['src/app/(agent)', 'src/components/field', 'src/components/ui'];
const ATTRS = new Set(['aria-label', 'placeholder', 'title', 'alt']);
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

/**
 * The words an expression would put on screen as they are: string and template literals with a letter,
 * looking through parentheses, ternaries and && / || / ??, but not into calls (t('a.b'), fmt(x, 'en'))
 * or anything else. A template's substitutions read as `${…}`.
 */
function shown(e: ts.Expression): string[] {
  if (ts.isParenthesizedExpression(e)) return shown(e.expression);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return LETTER.test(e.text) ? [e.text] : [];
  if (ts.isTemplateExpression(e)) {
    const fixed = e.head.text + e.templateSpans.map((s) => s.literal.text).join('');
    return LETTER.test(fixed) ? [e.head.text + e.templateSpans.map((s) => '${…}' + s.literal.text).join('')] : [];
  }
  if (ts.isConditionalExpression(e)) return [...shown(e.whenTrue), ...shown(e.whenFalse)];
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return shown(e.right);
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) return [...shown(e.left), ...shown(e.right)];
  }
  return [];
}

/** Each literal the scan refuses in `source`: `file:line  what`. */
export function literals(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const at = (n: ts.Node) => `${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n) && LETTER.test(n.text)) found.push(`${at(n)}  text ${JSON.stringify(n.text.trim())}`);
    // a child in braces: {'Hello'}, {ok ? 'Yes' : 'No'}, {busy && 'Sending'}, {`Hi ${n}`}
    if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      for (const text of shown(n.expression)) found.push(`${at(n)}  text ${JSON.stringify(text)}`);
    }
    if (ts.isJsxAttribute(n) && ATTRS.has(n.name.getText(sf))) {
      const init = n.initializer;
      const texts = !init ? [] : ts.isStringLiteral(init) ? (LETTER.test(init.text) ? [init.text] : []) : ts.isJsxExpression(init) && init.expression ? shown(init.expression) : [];
      for (const text of texts) found.push(`${at(n)}  ${n.name.getText(sf)}=${JSON.stringify(text)}`);
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

  // TASK-12 fix round 1 (quality minor 6): user-facing literals that are not JSX text.
  it('the scan also finds literal children in braces, ternaries, && / ||, template literals and alt', () => {
    expect(literals('x.tsx', "<p>{'Hello'}</p>")).toEqual(['x.tsx:1  text "Hello"']);
    expect(literals('x.tsx', "<p>{ok ? 'Yes' : 'No'}</p>")).toEqual(['x.tsx:1  text "Yes"', 'x.tsx:1  text "No"']);
    expect(literals('x.tsx', '<p>{`Hi ${n}`}</p>')).toEqual(['x.tsx:1  text "Hi ${…}"']);
    expect(literals('x.tsx', "<p>{busy && 'Sending'}</p>")).toEqual(['x.tsx:1  text "Sending"']);
    expect(literals('x.tsx', '<img alt="A photo" />')).toEqual(['x.tsx:1  alt="A photo"']);
    expect(literals('x.tsx', "<b title={ok ? 'Open' : t('a')} />")).toEqual(['x.tsx:1  title="Open"']);
  });

  it('it allows t() calls, identifiers, digits and punctuation in those places, and literals passed to calls or non-text attributes', () => {
    expect(literals('x.tsx', "<p>{ok ? t('a') : t('b')}</p>")).toEqual([]);
    expect(literals('x.tsx', "<p>{n} · {`${a} / ${b}`} {'—'} {ok && '42'}</p>")).toEqual([]);
    expect(literals('x.tsx', "<p className={ok ? 'row tall' : 'row'} data-state={ok ? 'open' : 'shut'}>{fmt(x, 'en')}</p>")).toEqual([]);
    expect(literals('x.tsx', '<img alt="" />')).toEqual([]);
  });

  it('src/app/(agent), src/components/field and src/components/ui have none', () => {
    const found = DIRS.flatMap((d) => tsxFiles(join(ROOT, d))).flatMap((f) => literals(relative(ROOT, f), readFileSync(f, 'utf8')));
    expect(found).toEqual([]);
  });
});
