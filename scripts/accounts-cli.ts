// Shared plumbing for `pnpm accounts:create` and `pnpm accounts:set-password` (SEC-001, TKT-28).
//
// A password never travels in argv (it would sit in the shell history and in `ps`) and is never logged.
// It comes from one of two places:
//   --password-stdin   the first line piped on stdin (refused on a terminal, which would echo it);
//   (default)          a fresh random password (24 bytes, base64url), delivered once:
//                      - stdin AND stdout are a terminal: printed once on that terminal;
//                      - otherwise (piped, `docker compose exec -T`, cron, output redirected to a log):
//                        written to a new file, mode 0600, in a 0700 `DATA_DIR/credentials/` directory.
//                        Only the file's path is printed. Read it, hand the password over, delete the file.
import { chmodSync, closeSync, mkdirSync, openSync, rmSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { AccountError, generatePassword } from '../src/lib/auth/accounts';

/** A mistake in how the command was called (exit 2). Its message never contains a value. */
export class UsageError extends Error {}

/** Any spelling of a password option: `-p`, `-p<value>`, `--pw…`, `--pass…`, `--password…` (not --password-stdin). */
const isPasswordFlag = (a: string) => a !== '--password-stdin' && (/^-p/i.test(a) || /^--(pw|pass)/i.test(a));

/**
 * `--key value` / `--key=value` for the `known` keys, plus the `--password-stdin` flag. Any spelling of a
 * password option is refused outright, before anything else is read.
 */
export function parseCliArgs(argv: readonly string[], known: readonly string[]): Record<string, string | true> {
  if (argv.some(isPasswordFlag)) {
    throw new UsageError('a password goes on stdin (--password-stdin) or is generated: never on the command line');
  }
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--password-stdin') {
      out['password-stdin'] = true;
      continue;
    }
    // An argument it does not know is never echoed (it may be a password pasted in the wrong place):
    // an unknown --option by its name only, anything else not at all.
    const m = /^--([a-z][a-z-]*)(?:=(.*))?$/.exec(a);
    if (!m) throw new UsageError('unexpected argument (not shown)');
    if (!known.includes(m[1]!)) throw new UsageError(`unknown option --${m[1]}`);
    const value = m[2] ?? argv[++i];
    if (value === undefined || (m[2] === undefined && value.startsWith('--'))) throw new UsageError(`--${m[1]} needs a value`);
    out[m[1]!] = value;
  }
  return out;
}

type In = { isTTY?: boolean } & AsyncIterable<Buffer | string>;
type Out = { isTTY?: boolean; write(s: string): unknown };

export type Delivery = { kind: 'stdin' } | { kind: 'tty' } | { kind: 'file'; path: string };
export type ChosenPassword = {
  password: string;
  delivery: Delivery;
  /** After the account is written: print a terminal password (a file already holds its copy). */
  deliver(): void;
  /** The account write failed: remove the reserved file, so no password for a non-account lingers. */
  abandon(): void;
};

async function readStdinLine(stdin: In): Promise<string> {
  let text = '';
  for await (const chunk of stdin) {
    text += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (text.length > 4096) break;
  }
  const line = text.split(/\r?\n/)[0] ?? '';
  return line;
}

/** A file name from the account's email and the time: no path characters, never reused. */
function fileName(label: string, now: Date): string {
  const safe = label.toLowerCase().replace(/[^a-z0-9@._-]/g, '_').slice(0, 80);
  return `${safe}-${now.toISOString().replace(/[:.]/g, '')}.password`;
}

/**
 * Where the password comes from and where it goes (see the file header). A file is created
 * exclusively (never overwriting one) with mode 0600 now, before the account is written, so a failure to
 * write it stops the command before any account changes.
 */
export async function choosePassword(o: { fromStdin: boolean; stdin: In; stdout: Out; credentialsDir: string; label: string; now?: Date }): Promise<ChosenPassword> {
  const noop = () => undefined;
  if (o.fromStdin) {
    if (o.stdin.isTTY) throw new UsageError('--password-stdin needs a pipe (printf %s "$PW" | …); on a terminal leave it out and a password is generated');
    return { password: await readStdinLine(o.stdin), delivery: { kind: 'stdin' }, deliver: noop, abandon: noop };
  }
  const password = generatePassword();
  if (o.stdin.isTTY && o.stdout.isTTY) {
    return {
      password,
      delivery: { kind: 'tty' },
      deliver: () => o.stdout.write(`\nPassword for ${o.label} (shown once, not stored anywhere): ${password}\n\n`),
      abandon: noop,
    };
  }
  mkdirSync(o.credentialsDir, { recursive: true, mode: 0o700 });
  chmodSync(o.credentialsDir, 0o700);
  const path = join(o.credentialsDir, fileName(o.label, o.now ?? new Date()));
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeSync(fd, `${password}\n`);
  } finally {
    closeSync(fd);
  }
  chmodSync(path, 0o600); // whatever the umask
  return { password, delivery: { kind: 'file', path }, deliver: noop, abandon: () => rmSync(path, { force: true }) };
}

/** What the summary line says about the password: never the password itself. */
export function describeDelivery(d: Delivery): string {
  return d.kind === 'stdin' ? 'from stdin' : d.kind === 'tty' ? 'shown once on the terminal' : `written to ${d.path}`;
}

/** Run a command body: usage errors exit 2, account refusals exit 1, both with one line on stderr. */
export async function runCli(usage: string, body: () => Promise<void>): Promise<number> {
  try {
    await body();
    return 0;
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`accounts: ${err.message}\n${usage}\n`);
      return 2;
    }
    if (err instanceof AccountError) {
      process.stderr.write(`accounts: ${err.message}\n`);
      return 1;
    }
    // Anything else: the class only, so no stray value (a path, a row) reaches a terminal log.
    process.stderr.write(`accounts: failed (${err instanceof Error ? err.constructor.name : typeof err})\n`);
    return 1;
  }
}
