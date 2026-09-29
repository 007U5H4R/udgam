import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// TSK-04.4 / TC-018: the build fails when a Server Action or a route handler skips its guard
// (technical-plan §10). Walks src/app/(agent|admin|buyer)/** and src/app/api/** (minus the public
// api/auth, api/health, api/verify) with the TypeScript compiler API. Every exported function of a
// 'use server' file, every inline 'use server' function and every exported route handler must `await
// requireSession(` in a top-level statement of its body (or of a top-level try block) before anything
// touches the database. Each group layout must call requireSession with its own role.

const ROOT = join(__dirname, '..');
const APP = join(ROOT, 'src', 'app');
const GROUPS = ['(agent)', '(admin)', '(buyer)'] as const;
const PUBLIC_API = ['auth', 'health', 'verify'];
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
/** Identifiers that reach the database. */
const DB_ACCESS = new Set(['db', 'getDb', 'getDbReady', 'getDbClient', 'writeTx', 'tx']);

type Fn = ts.FunctionLikeDeclaration & { body?: ts.ConciseBody };

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** The files under the rule (paths relative to src/app use `/`). */
export function filesInScope(): string[] {
  return walk(APP).filter((abs) => {
    const rel = relative(APP, abs).split(sep).join('/');
    const [top, second] = rel.split('/');
    if ((GROUPS as readonly string[]).includes(top!)) return true;
    return top === 'api' && !PUBLIC_API.includes(second!);
  });
}

const hasUseServer = (stmts: ts.NodeArray<ts.Statement> | undefined) => {
  for (const s of stmts ?? []) {
    if (!ts.isExpressionStatement(s) || !ts.isStringLiteral(s.expression)) return false; // directives come first
    if (s.expression.text === 'use server') return true;
  }
  return false;
};

const isExported = (n: ts.Node) =>
  ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

const isRequireSessionCall = (n: ts.Node): n is ts.CallExpression =>
  ts.isCallExpression(n) &&
  ((ts.isIdentifier(n.expression) && n.expression.text === 'requireSession') ||
    (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'requireSession'));

/** The first position at which `node` touches the database, or Infinity. Nested functions count. */
function firstDbAccess(node: ts.Node): number {
  let first = Infinity;
  const visit = (n: ts.Node) => {
    if (n.pos >= first) return;
    if (ts.isIdentifier(n) && DB_ACCESS.has(n.text)) first = Math.min(first, n.getStart());
    n.forEachChild(visit);
  };
  visit(node);
  return first;
}

/** Top-level statements of a body, with the statements of a top-level try block flattened in. */
function topStatements(body: ts.Block): ts.Statement[] {
  return body.statements.flatMap((s) => (ts.isTryStatement(s) ? [s, ...s.tryBlock.statements] : [s]));
}

/** The start of the first top-level `await requireSession(...)` in `fn`'s body, or null. */
function guardPosition(fn: Fn): number | null {
  const body = fn.body;
  if (!body || !ts.isBlock(body)) return null; // an expression-bodied arrow cannot await a guard first
  for (const stmt of topStatements(body)) {
    // Only unconditional statements count: an `if`, loop or switch may skip the guard.
    if (!ts.isExpressionStatement(stmt) && !ts.isVariableStatement(stmt)) continue;
    let found: number | null = null;
    const visit = (n: ts.Node) => {
      if (found !== null || ts.isFunctionLike(n) || ts.isConditionalExpression(n)) return;
      if (ts.isAwaitExpression(n) && isRequireSessionCall(n.expression)) {
        found = n.getStart();
        return;
      }
      // `a && await requireSession(…)` may short-circuit past the guard: only the left side always runs.
      if (ts.isBinaryExpression(n) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind)) {
        visit(n.left);
        return;
      }
      n.forEachChild(visit);
    };
    stmt.forEachChild(visit);
    if (found !== null) return found;
  }
  return null;
}

/** Why `fn` breaks the rule, or null when it is guarded. */
function problem(fn: Fn): string | null {
  const guard = guardPosition(fn);
  if (guard === null) return 'no top-level `await requireSession(`';
  if (fn.body && firstDbAccess(fn.body) < guard) return 'touches the database before `await requireSession(`';
  return null;
}

type Target = { name: string; fn: Fn | null };

/** Resolve `export const X = <expr>` to a function in the same file, when it is one. */
function resolveFn(sf: ts.SourceFile, expr: ts.Expression | undefined): Fn | null {
  if (!expr) return null;
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return expr;
  if (ts.isIdentifier(expr)) {
    for (const s of sf.statements) {
      if (ts.isFunctionDeclaration(s) && s.name?.text === expr.text) return s;
      if (ts.isVariableStatement(s)) {
        for (const d of s.declarationList.declarations) {
          if (ts.isIdentifier(d.name) && d.name.text === expr.text) return resolveFn(sf, d.initializer);
        }
      }
    }
  }
  return null;
}

/** The exported functions of a module, by name (`default` for a default export). */
function exportedFns(sf: ts.SourceFile): Target[] {
  const out: Target[] = [];
  for (const s of sf.statements) {
    if (ts.isFunctionDeclaration(s) && isExported(s)) {
      const isDefault = (ts.getModifiers(s) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      out.push({ name: isDefault ? 'default' : (s.name?.text ?? 'default'), fn: s });
    } else if (ts.isVariableStatement(s) && isExported(s)) {
      for (const d of s.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) out.push({ name: d.name.text, fn: resolveFn(sf, d.initializer) });
      }
    } else if (ts.isExportAssignment(s)) {
      out.push({ name: 'default', fn: resolveFn(sf, s.expression) });
    } else if (ts.isExportDeclaration(s)) {
      out.push({ name: `export { … }${s.moduleSpecifier ? ` from ${s.moduleSpecifier.getText(sf)}` : ''}`, fn: null });
    }
  }
  return out;
}

/** Every function in the file with its own 'use server' directive (inline Server Actions). */
function inlineActions(sf: ts.SourceFile): Target[] {
  const out: Target[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isFunctionLike(n) && 'body' in n && n.body && ts.isBlock(n.body) && hasUseServer(n.body.statements)) {
      out.push({ name: `inline action at line ${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`, fn: n as Fn });
    }
    n.forEachChild(visit);
  };
  visit(sf);
  return out;
}

/** Offenders in one file: "<file> <export>: <why>". */
export function offenders(abs: string, source = readFileSync(abs, 'utf8')): string[] {
  const sf = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true, abs.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const file = relative(ROOT, abs).split(sep).join('/');
  const targets: Target[] = [];
  if (hasUseServer(sf.statements)) targets.push(...exportedFns(sf));
  if (/^route\.(ts|tsx)$/.test(basename(abs))) targets.push(...exportedFns(sf).filter((t) => HTTP_METHODS.has(t.name) || t.name.startsWith('export {')));
  targets.push(...inlineActions(sf));
  const out: string[] = [];
  for (const { name, fn } of targets) {
    const why = fn ? problem(fn) : 'not a function defined in this file (cannot check its guard)';
    if (why) out.push(`${file} ${name}: ${why}`);
  }
  return out;
}

describe('guard coverage (TSK-04.4, TC-018)', () => {
  it('finds the capture route in scope and skips the public API routes', () => {
    const rel = filesInScope().map((f) => relative(APP, f).split(sep).join('/'));
    expect(rel).toContain('api/capture/route.ts');
    expect(rel.some((f) => /^api\/(auth|health|verify)\//.test(f))).toBe(false);
    expect(rel.some((f) => f.startsWith('(public)/'))).toBe(false);
  });

  it('no Server Action or route handler under the signed-in groups or the API skips its guard', () => {
    expect(filesInScope().flatMap((f) => offenders(f))).toEqual([]);
  });

  it('every route-group layout awaits requireSession with its own role', () => {
    for (const g of GROUPS) {
      const src = readFileSync(join(APP, g, 'layout.tsx'), 'utf8');
      expect(src, g).toContain(`await requireSession('${g.slice(1, -1)}')`);
    }
  });

  it('reports every planted offender in tests/fixtures/unguarded-action.ts', () => {
    const got = offenders(join(ROOT, 'tests/fixtures/unguarded-action.ts'));
    expect(got).toEqual([
      'tests/fixtures/unguarded-action.ts leakOrgs: no top-level `await requireSession(`',
      'tests/fixtures/unguarded-action.ts guardTooLate: touches the database before `await requireSession(`',
      'tests/fixtures/unguarded-action.ts guardNotAwaited: no top-level `await requireSession(`',
      'tests/fixtures/unguarded-action.ts guardOnOneBranch: no top-level `await requireSession(`',
      'tests/fixtures/unguarded-action.ts arrowLeak: no top-level `await requireSession(`',
    ]);
  });

  it('accepts properly guarded actions (tests/fixtures/guarded-action.ts)', () => {
    expect(offenders(join(ROOT, 'tests/fixtures/guarded-action.ts'))).toEqual([]);
  });

  it('checks route handlers, including handlers bound to a local function and inline actions', () => {
    const route = join(APP, 'api', 'x', 'route.ts');
    const src = `
      import { getDbReady } from '../../../lib/db/client';
      import { requireSession } from '../../_auth/require';
      const handle = async (req: Request) => { const db = await getDbReady(); return Response.json(db); };
      export const GET = handle;
      export async function POST(req: Request) {
        try { await requireSession('admin', { request: req }); } catch { return new Response(null, { status: 401 }); }
        return Response.json(await getDbReady());
      }
      export async function DELETE() { return new Response(null); }
      export { PUT } from './elsewhere';
      export const dynamic = 'force-dynamic';
    `;
    expect(offenders(route, src)).toEqual([
      'src/app/api/x/route.ts GET: no top-level `await requireSession(`',
      'src/app/api/x/route.ts DELETE: no top-level `await requireSession(`',
      "src/app/api/x/route.ts export { … } from './elsewhere': not a function defined in this file (cannot check its guard)",
    ]);
    const page = join(APP, '(admin)', 'admin', 'x', 'page.tsx');
    const inline = `
      import { getDb } from '../../../../lib/db/client';
      export default function Page() {
        async function save() { 'use server'; await getDb().select(); }
        return null;
      }
    `;
    expect(offenders(page, inline)).toEqual(['src/app/(admin)/admin/x/page.tsx inline action at line 4: no top-level `await requireSession(`']);
  });
});
