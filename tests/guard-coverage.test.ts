import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// TSK-04.4 / TC-018: the build fails when a Server Action, a route handler, or a page or layout of a
// signed-in group skips its guard (technical-plan §10). Walks every file under src/app with the
// TypeScript compiler API. The targets are:
//   - every exported function of a 'use server' file and every inline 'use server' function, anywhere
//     under src/app (any Server Action is reachable by POST), except the allowlisted public actions;
//   - every exported HTTP handler of a route.ts under a group or under api/ (minus the public api/auth,
//     api/health, api/verify and the certificate beacon api/telemetry, TKT-16);
//   - the default export of every page.tsx and layout.tsx under (agent), (admin), (buyer) and (processor)
//     (the processor surface, TKT-26, D9).
// Each target must `await requireSession('<role>'…)` in an unconditional top-level statement of its
// body before anything touches the database. Inside a group the role literal must be the group's own.
//
// What counts as the guard: an `await requireSession(` in a top-level expression or variable
// statement, or in one inside a top-level `try` whose catch ends unconditionally (return, throw, or a
// call to redirect/notFound/forbidden/unauthorized) and whose finally never returns. Conditional and
// short-circuit guards do not count.
//
// What counts as touching the database before the guard (best effort, by name and import source):
//   - the identifiers in DB_ACCESS (db, getDb, getDbReady, getDbClient, writeTx, tx);
//   - any value imported (relative or `@/`) from src/lib/db/** or src/lib/**/queries*;
//   - any function defined at the top level of the same file that does one of these (transitively).
// Limits: a helper imported from any other module is not followed into that module (helpers that take
// `db` as an argument, like src/lib/auth/org-scope.ts, are still caught by the `db` identifier); a
// database handle renamed at module level (`const d = getDb`, then `d()`) is not followed; a nested
// function counts at its position even if it is never called. It is a safety net for review, not a
// proof.

const ROOT = join(__dirname, '..');
const APP = join(ROOT, 'src', 'app');
const GROUPS = ['(agent)', '(admin)', '(buyer)', '(processor)'] as const;
const PUBLIC_API = ['auth', 'health', 'verify', 'telemetry'];
/** Server Action files (relative to the app root) that are public by nature and read nothing org-scoped. */
const PUBLIC_ACTIONS = ['(public)/sign-in/actions.ts'];
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
/** Identifiers that reach the database. */
const DB_ACCESS = new Set(['db', 'getDb', 'getDbReady', 'getDbClient', 'writeTx', 'tx']);
/** Modules whose exports reach the database (repo-relative, without extension). */
const DB_MODULES = [/^src\/lib\/db(\/|$)/, /^src\/lib\/(.+\/)?queries[^/]*$/];
/** Next.js calls that never return (they throw a control-flow error). */
const NEVER_RETURNS = new Set(['redirect', 'permanentRedirect', 'notFound', 'forbidden', 'unauthorized']);

type Fn = ts.FunctionLikeDeclaration & { body?: ts.ConciseBody };

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** Every source file under the app root; `offenders` decides what in each file is a target. */
export function filesInScope(appRoot = APP): string[] {
  return walk(appRoot);
}

const hasDirective = (stmts: ts.NodeArray<ts.Statement> | undefined, directive: string) => {
  for (const s of stmts ?? []) {
    if (!ts.isExpressionStatement(s) || !ts.isStringLiteral(s.expression)) return false; // directives come first
    if (s.expression.text === directive) return true;
  }
  return false;
};

const isExported = (n: ts.Node) =>
  ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

const isRequireSessionCall = (n: ts.Node): n is ts.CallExpression =>
  ts.isCallExpression(n) &&
  ((ts.isIdentifier(n.expression) && n.expression.text === 'requireSession') ||
    (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'requireSession'));

/** Names in one file that reach the database: values imported from database modules, and local functions. */
type DbNames = { imported: Set<string>; local: Set<string> };

/** The first position at which `node` touches the database, or Infinity. Nested functions count. */
function firstDbAccess(node: ts.Node, names: DbNames): number {
  let first = Infinity;
  const visit = (n: ts.Node) => {
    if (n.pos >= first || ts.isTypeNode(n)) return; // a type annotation reads nothing
    if (ts.isIdentifier(n) && (DB_ACCESS.has(n.text) || names.imported.has(n.text) || names.local.has(n.text))) {
      first = Math.min(first, n.getStart());
    }
    n.forEachChild(visit);
  };
  visit(node);
  return first;
}

/** The repo-relative path (without extension) an import specifier points at, or null for a package. */
function importTarget(abs: string, spec: string): string | null {
  let target: string;
  if (spec.startsWith('.')) target = resolve(dirname(abs), spec);
  else if (spec.startsWith('@/')) target = join(ROOT, 'src', spec.slice(2));
  else return null;
  return relative(ROOT, target).split(sep).join('/').replace(/\.(ts|tsx|js|mjs)$/, '');
}

function dbNames(sf: ts.SourceFile, abs: string): DbNames {
  const names: DbNames = { imported: new Set(), local: new Set() };
  const fns = new Map<string, Fn>();
  for (const s of sf.statements) {
    if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)) {
      const target = importTarget(abs, s.moduleSpecifier.text);
      const clause = s.importClause;
      if (!target || !DB_MODULES.some((re) => re.test(target)) || !clause || clause.isTypeOnly) continue;
      if (clause.name) names.imported.add(clause.name.text);
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) names.imported.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) if (!el.isTypeOnly) names.imported.add(el.name.text);
      }
    } else if (ts.isFunctionDeclaration(s) && s.name && s.body) {
      fns.set(s.name.text, s);
    } else if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        const init = d.initializer;
        if (ts.isIdentifier(d.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) fns.set(d.name.text, init);
      }
    }
  }
  // Fixed point: a local function that calls a database-touching local function touches it too.
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, fn] of fns) {
      if (!names.local.has(name) && fn.body && firstDbAccess(fn.body, names) < Infinity) {
        names.local.add(name);
        changed = true;
      }
    }
  }
  return names;
}

/** True when `stmt` leaves the enclosing function (return or throw) on every path. */
function endsAbruptly(stmt: ts.Statement | undefined): boolean {
  if (!stmt) return false;
  if (ts.isReturnStatement(stmt) || ts.isThrowStatement(stmt)) return true;
  if (ts.isBlock(stmt)) return endsAbruptly(stmt.statements.at(-1));
  if (ts.isIfStatement(stmt)) return endsAbruptly(stmt.thenStatement) && endsAbruptly(stmt.elseStatement);
  if (ts.isExpressionStatement(stmt)) {
    const e = stmt.expression;
    return ts.isCallExpression(e) && ts.isIdentifier(e.expression) && NEVER_RETURNS.has(e.expression.text);
  }
  return false;
}

/** True when `node` holds a `return` of its own function (not of a nested one). */
function containsReturn(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found || ts.isFunctionLike(n)) return;
    if (ts.isReturnStatement(n)) found = true;
    else n.forEachChild(visit);
  };
  node.forEachChild(visit);
  return found;
}

/**
 * Top-level statements of a body. A top-level try block's statements are flattened in only when a
 * refusal cannot fall through it: the catch (if any) ends in return or throw on every path, and the
 * finally (if any) never returns (a `return` in finally swallows the error).
 */
function topStatements(body: ts.Block): ts.Statement[] {
  return body.statements.flatMap((s) => {
    if (!ts.isTryStatement(s)) return [s];
    const catchHolds = !s.catchClause || endsAbruptly(s.catchClause.block);
    const finallyHolds = !s.finallyBlock || !containsReturn(s.finallyBlock);
    return catchHolds && finallyHolds ? [s, ...s.tryBlock.statements] : [s];
  });
}

/** The first top-level `await requireSession(...)` in `fn`'s body, or null. */
function guardOf(fn: Fn): ts.AwaitExpression | null {
  const body = fn.body;
  if (!body || !ts.isBlock(body)) return null; // an expression-bodied arrow cannot await a guard first
  for (const stmt of topStatements(body)) {
    // Only unconditional statements count: an `if`, loop or switch may skip the guard.
    if (!ts.isExpressionStatement(stmt) && !ts.isVariableStatement(stmt)) continue;
    let found: ts.AwaitExpression | null = null;
    const visit = (n: ts.Node) => {
      if (found !== null || ts.isFunctionLike(n) || ts.isConditionalExpression(n)) return;
      if (ts.isAwaitExpression(n) && isRequireSessionCall(n.expression)) {
        found = n;
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

type Target = { name: string; fn: Fn | null };
type Rule = { names: DbNames; role?: string; clientPage?: boolean };

/** Why `fn` breaks the rule, or null when it is guarded. */
function problem(fn: Fn, rule: Rule): string | null {
  const guard = guardOf(fn);
  if (guard === null) {
    return rule.clientPage
      ? "a 'use client' page cannot await requireSession: render it from a server page that does"
      : 'no top-level `await requireSession(`';
  }
  if (fn.body && firstDbAccess(fn.body, rule.names) < guard.getStart()) return 'touches the database before `await requireSession(`';
  const arg = (guard.expression as ts.CallExpression).arguments[0];
  if (!arg || !ts.isStringLiteralLike(arg)) return "the guard's role is not a string literal";
  if (rule.role && arg.text !== rule.role) return `guards with '${arg.text}' inside (${rule.role}): must be requireSession('${rule.role}')`;
  return null;
}

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
    if (ts.isFunctionLike(n) && 'body' in n && n.body && ts.isBlock(n.body) && hasDirective(n.body.statements, 'use server')) {
      out.push({ name: `inline action at line ${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`, fn: n as Fn });
    }
    n.forEachChild(visit);
  };
  visit(sf);
  return out;
}

/**
 * Offenders in one file: "<file> <export>: <why>". `appRoot` is the directory standing for src/app:
 * the route group and api/ are read from the path relative to it. A file outside it is checked only
 * for 'use server' functions.
 */
export function offenders(abs: string, source = readFileSync(abs, 'utf8'), appRoot = APP): string[] {
  const sf = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true, abs.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const file = relative(ROOT, abs).split(sep).join('/');
  const rel = relative(appRoot, abs).split(sep).join('/');
  const [top, second] = rel.startsWith('..') ? [] : rel.split('/');
  const role = top && (GROUPS as readonly string[]).includes(top) ? top.slice(1, -1) : undefined;
  const guardedApi = top === 'api' && !PUBLIC_API.includes(second ?? '');
  const base = basename(abs);

  const targets: Target[] = [];
  if (!PUBLIC_ACTIONS.includes(rel)) {
    if (hasDirective(sf.statements, 'use server')) targets.push(...exportedFns(sf));
    targets.push(...inlineActions(sf));
  }
  if (/^route\.(ts|tsx)$/.test(base) && (role || guardedApi)) {
    targets.push(...exportedFns(sf).filter((t) => HTTP_METHODS.has(t.name) || t.name.startsWith('export {')));
  }
  const groupScreen = role !== undefined && /^(page|layout)\.(ts|tsx)$/.test(base);
  let screen: Target | undefined;
  if (groupScreen) {
    screen = exportedFns(sf).find((t) => t.name === 'default') ?? { name: 'default', fn: null };
    targets.push(screen);
  }
  const clientScreen = groupScreen && hasDirective(sf.statements, 'use client');

  const names = dbNames(sf, abs);
  const out: string[] = [];
  for (const t of targets) {
    const why = t.fn
      ? problem(t.fn, { names, role, clientPage: clientScreen && t === screen })
      : 'not a function defined in this file (cannot check its guard)';
    if (why) out.push(`${file} ${t.name}: ${why}`);
  }
  return out;
}

describe('guard coverage (TSK-04.4, TC-018)', () => {
  it('scans every file under src/app, including the capture route and the group pages', () => {
    const rel = filesInScope().map((f) => relative(APP, f).split(sep).join('/'));
    expect(rel).toContain('api/capture/route.ts');
    expect(rel).toContain('(admin)/admin/(review)/(queue)/page.tsx');
    expect(rel).toContain('(public)/sign-in/actions.ts');
  });

  it('no Server Action, route handler, group page or group layout in src/app skips its guard', () => {
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
    const f = 'tests/fixtures/unguarded-action.ts';
    expect(got).toEqual([
      `${f} leakOrgs: no top-level \`await requireSession(\``,
      `${f} guardTooLate: touches the database before \`await requireSession(\``,
      `${f} guardNotAwaited: no top-level \`await requireSession(\``,
      `${f} guardOnOneBranch: no top-level \`await requireSession(\``,
      `${f} arrowLeak: no top-level \`await requireSession(\``,
      `${f} swallowCatch: no top-level \`await requireSession(\``,
      `${f} importedDbHelperBefore: touches the database before \`await requireSession(\``,
      `${f} localDbHelperBefore: touches the database before \`await requireSession(\``,
      `${f} roleFromInput: the guard's role is not a string literal`,
    ]);
  });

  it('accepts properly guarded actions, including a catch that rethrows or returns (tests/fixtures/guarded-action.ts)', () => {
    expect(offenders(join(ROOT, 'tests/fixtures/guarded-action.ts'))).toEqual([]);
  });

  it('checks the planted app tree: roles per group, every group page and layout, and all Server Actions', () => {
    const app = join(ROOT, 'tests/fixtures/app');
    const got = filesInScope(app).flatMap((f) => offenders(f, undefined, app)).sort();
    const f = 'tests/fixtures/app';
    expect(got).toEqual(
      [
        `${f}/(admin)/layout.tsx default: guards with 'buyer' inside (admin): must be requireSession('admin')`,
        `${f}/(admin)/wrong-role/actions.ts approve: guards with 'buyer' inside (admin): must be requireSession('admin')`,
        `${f}/(admin)/wrong-role/page.tsx default: guards with 'agent' inside (admin): must be requireSession('admin')`,
        `${f}/(agent)/client/page.tsx default: a 'use client' page cannot await requireSession: render it from a server page that does`,
        `${f}/(buyer)/unguarded/page.tsx default: no top-level \`await requireSession(\``,
        `${f}/(processor)/admin-guard/page.tsx default: guards with 'admin' inside (processor): must be requireSession('processor')`,
        `${f}/(public)/contact/actions.ts send: no top-level \`await requireSession(\``,
        `${f}/_actions/stray.ts listOrgs: no top-level \`await requireSession(\``,
        `${f}/api/things/route.ts GET: no top-level \`await requireSession(\``,
      ].sort(),
    );
  });

  it('flags helpers from src/lib/db and src/lib/**/queries* (relative or @/ imports) called before the guard', () => {
    const file = join(APP, '_actions', 'x.ts');
    const src = `
      'use server';
      import { listFarmers } from '../../lib/farmers/queries';
      import * as q from '@/lib/plots/queries-admin';
      import { closeDb } from '@/lib/db/client';
      import type { Db } from '../../lib/db/client';
      import { requireSession } from '../_auth/require';
      export async function a() { const r = await listFarmers('o'); await requireSession('admin', { action: true }); return r; }
      export async function b() { const r = await q.plots(); await requireSession('admin', { action: true }); return r; }
      export async function c() { closeDb(); await requireSession('admin', { action: true }); }
      export async function d() { let x: Db | undefined; await requireSession('admin', { action: true }); return listFarmers(String(x)); }
    `;
    expect(offenders(file, src)).toEqual([
      'src/app/_actions/x.ts a: touches the database before `await requireSession(`',
      'src/app/_actions/x.ts b: touches the database before `await requireSession(`',
      'src/app/_actions/x.ts c: touches the database before `await requireSession(`',
    ]);
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
      export async function PATCH(req: Request) {
        try { await requireSession('admin', { request: req }); } catch (e) { console.error(e); }
        return Response.json(await getDbReady());
      }
      export async function DELETE() { return new Response(null); }
      export { PUT } from './elsewhere';
      export const dynamic = 'force-dynamic';
    `;
    expect(offenders(route, src)).toEqual([
      'src/app/api/x/route.ts GET: no top-level `await requireSession(`',
      'src/app/api/x/route.ts PATCH: no top-level `await requireSession(`',
      'src/app/api/x/route.ts DELETE: no top-level `await requireSession(`',
      "src/app/api/x/route.ts export { … } from './elsewhere': not a function defined in this file (cannot check its guard)",
    ]);
    const page = join(APP, '(admin)', 'admin', 'x', 'page.tsx');
    const inline = `
      import { getDb } from '../../../../lib/db/client';
      import { requireSession } from '../../../_auth/require';
      export default async function Page() {
        await requireSession('admin');
        async function save() { 'use server'; await getDb().select(); }
        return null;
      }
    `;
    expect(offenders(page, inline)).toEqual(['src/app/(admin)/admin/x/page.tsx inline action at line 6: no top-level `await requireSession(`']);
    const publicPage = join(APP, '(public)', 'about', 'page.tsx');
    const publicInline = `export default function Page() { async function go() { 'use server'; } return null; }`;
    expect(offenders(publicPage, publicInline)).toEqual(['src/app/(public)/about/page.tsx inline action at line 1: no top-level `await requireSession(`']);
  });
});
