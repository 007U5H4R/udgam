import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// TASK-12 fix round 1 (spec MAJOR 1, EVAL-088, TC-051): every /field route has an error boundary
// (an error.tsx in its own folder or one above it, up to src/app/(agent)/field), so a server failure
// shows what happened, that saved pickings are safe, and Try again — never Next's bare error page.
// A loading.tsx must stay OFF the /field/pickings/[eventId] path: a loading boundary starts the stream
// before the page's notFound(), and another agent's picking must answer 404, not 200 (an error.tsx
// does not start the stream).

const FIELD = join(__dirname, '..', 'src', 'app', '(agent)', 'field');

function pages(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...pages(p));
    else if (name === 'page.tsx') out.push(p);
  }
  return out;
}

/** The folders from the page's own up to FIELD, inclusive. */
function chain(page: string): string[] {
  const dirs: string[] = [];
  for (let d = dirname(page); ; d = dirname(d)) {
    dirs.push(d);
    if (d === FIELD) return dirs;
  }
}

const route = (page: string) => relative(FIELD, dirname(page)).split(sep).join('/') || '.';

describe('/field error boundaries (EVAL-088, TC-051)', () => {
  it('every /field page sits under an error.tsx', () => {
    const uncovered = pages(FIELD)
      .filter((p) => !chain(p).some((d) => existsSync(join(d, 'error.tsx'))))
      .map(route);
    expect(uncovered).toEqual([]);
  });

  it('the pages it covers include record, help and the picking detail', () => {
    expect(pages(FIELD).map(route).sort()).toEqual(['(home)', 'help', 'pickings/(list)', 'pickings/[eventId]', 'record']);
  });

  it('every /field loading.tsx and error.tsx speaks the agent\'s language (no hard-coded lang="en"; TC-052, spec minor 6)', () => {
    const states = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? states(p) : name === 'loading.tsx' || name === 'error.tsx' ? [p] : [];
      });
    const files = states(FIELD);
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(files.filter((f) => /lang=["']en["']/.test(readFileSync(f, 'utf8'))).map((f) => relative(FIELD, f))).toEqual([]);
  });

  it('no loading.tsx on the /field/pickings/[eventId] path (its 404 must not stream a 200 first)', () => {
    const detail = pages(FIELD).find((p) => route(p) === 'pickings/[eventId]')!;
    expect(chain(detail).filter((d) => existsSync(join(d, 'loading.tsx'))).map((d) => relative(FIELD, d))).toEqual([]);
  });
});

// CR-100 (EVAL-088): the same safety net for every other signed-in surface and sign-in. Each route
// group's root has its own error.tsx (the designed error card with a working Try again), so a database
// or transport failure never reaches Next's bare "Application error" page. Exempt: the public
// certificate (its own byte-identical 404 contract, TP8), the redirect-only `/` and the test-only route.
const APP = join(__dirname, '..', 'src', 'app');
const EXEMPT = ['(public)/verify/[batchId]', '.', '%5F_test__/crypto'];
const ROOTS = ['(admin)/admin', '(buyer)/buyer', '(processor)/processor', '(agent)/enrol', '(agent)/field', '(public)/sign-in'];

const appRoute = (page: string) => relative(APP, dirname(page)).split(sep).join('/') || '.';

/** The folders from the page's own up to (not including) src/app. */
function appChain(page: string): string[] {
  const dirs: string[] = [];
  for (let d = dirname(page); d !== APP; d = dirname(d)) dirs.push(d);
  return dirs;
}

describe('error boundaries on every signed-in surface and sign-in (CR-100, EVAL-088)', () => {
  it('each route-group root has its own error.tsx', () => {
    expect(ROOTS.filter((r) => !existsSync(join(APP, ...r.split('/'), 'error.tsx')))).toEqual([]);
  });

  it('every page under src/app, except the exempt ones, sits under an error.tsx', () => {
    const all = pages(APP);
    expect(all.length).toBeGreaterThanOrEqual(28);
    const uncovered = all
      .filter((p) => !EXEMPT.includes(appRoute(p)))
      .filter((p) => !appChain(p).some((d) => existsSync(join(d, 'error.tsx'))))
      .map(appRoute);
    expect(uncovered).toEqual([]);
  });

  it('the exempt pages still exist (the list does not go stale)', () => {
    expect(EXEMPT.filter((r) => !existsSync(join(APP, ...(r === '.' ? [] : r.split('/')), 'page.tsx')))).toEqual([]);
  });

  it('no error boundary shows the error itself (no message or digest on screen)', () => {
    const boundaries = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? boundaries(p) : name === 'error.tsx' ? [p] : [];
      });
    const leaky = boundaries(APP).filter((f) => /error\.(message|digest|stack)/.test(readFileSync(f, 'utf8')));
    expect(leaky.map((f) => relative(APP, f))).toEqual([]);
  });
});
