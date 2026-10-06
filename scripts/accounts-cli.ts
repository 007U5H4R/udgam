// Shared plumbing for `pnpm accounts:create` and `pnpm accounts:set-password` (SEC-001, TKT-28).
//
// A password never travels in argv (it would sit in the shell history and in `ps`) and is never logged.
// It comes from one of two places:
//   --password-stdin   the first line piped on stdin (refused on a terminal, which would echo it);
//   (default)          a fresh random password (24 bytes, base64url), delivered once:
//                      - stdin AND stdout are a terminal: printed once on that terminal;
//                      - otherwise (piped, `docker compose exec -T`, cron, output redirected to a log):
//                        only with `--out <directory>`, which must exist and must not be inside DATA_DIR
//                        (DATA_DIR is backed up and readable by the app). The password is written to a
//                        new file there, mode 0600, named `udgam-password-<random>.txt` (never the email),
//                        and only its path is printed. Use a tmpfs such as /run; read the file, hand the
//                        password over, delete it. Until the account is written, SIGINT/SIGTERM or a
//                        failed write removes the file.
import { randomBytes } from 'node:crypto';
import { chmodSync, closeSync, openSync, realpathSync, rmSync, statSync, writeSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { AccountError, generatePassword } from '../src/lib/auth/accounts';

/**
 * How the usage line names the command: `node /app/accounts-create.mjs` when run from the production
 * image's bundle (deploy/build-tools.mjs), `pnpm accounts:create` otherwise.
 */
export function commandName(script: 'create' | 'set-password', argv1: string | undefined = process.argv[1]): string {
  return argv1?.endsWith('.mjs') ? `node ${argv1}` : `pnpm accounts:${script}`;
}

/** `--help` or `-h` anywhere: print the usage and do nothing else. */
export const wantsHelp = (argv: readonly string[]) => argv.includes('--help') || argv.includes('-h');

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
  /** Made by generatePassword (192 random bits): no other account can share it, so no scan is needed. */
  generated: boolean;
  delivery: Delivery;
  /** After the account is written: print a terminal password (a file already holds its copy). */
  deliver(): void;
  /** The account write failed: remove the reserved file, so no password for a non-account lingers. */
  abandon(): void;
};

/**
 * The first line on stdin, without its line ending. Reading stops at the first newline (or 4 KiB): it
 * never waits for the end of the stream and never reads what follows the line.
 */
async function readStdinLine(stdin: In): Promise<string> {
  let text = '';
  for await (const chunk of stdin) {
    text += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    if (text.includes('\n') || text.length > 4096) break;
  }
  return text.split(/\r?\n/)[0] ?? '';
}

/** The real path of `p` (symlinks resolved) when it exists, else its absolute spelling. */
function realOrResolved(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

type Signals = { once(event: 'SIGINT' | 'SIGTERM', fn: () => void): unknown; off(event: 'SIGINT' | 'SIGTERM', fn: () => void): unknown };

/**
 * Where the password comes from and where it goes (see the file header). A file is created
 * exclusively (never overwriting one, never following a planted symlink) with mode 0600 now, before the
 * account is written, so a failure to write it stops the command before any account changes.
 */
export async function choosePassword(o: {
  fromStdin: boolean;
  stdin: In;
  stdout: Out;
  /** --out: the directory for a generated password when there is no terminal. */
  outDir?: string | undefined;
  /** DATA_DIR: --out may not be inside it. */
  dataDir: string;
  label: string;
  signals?: Signals;
  exit?: (code: number) => void;
}): Promise<ChosenPassword> {
  const noop = () => undefined;
  if (o.fromStdin) {
    if (o.stdin.isTTY) throw new UsageError('--password-stdin needs a pipe (printf %s "$PW" | …); on a terminal leave it out and a password is generated');
    return { password: await readStdinLine(o.stdin), generated: false, delivery: { kind: 'stdin' }, deliver: noop, abandon: noop };
  }
  if (o.stdin.isTTY && o.stdout.isTTY) {
    const password = generatePassword();
    return {
      password,
      generated: true,
      delivery: { kind: 'tty' },
      deliver: () => o.stdout.write(`\nPassword for ${o.label} (shown once, not stored anywhere): ${password}\n\n`),
      abandon: noop,
    };
  }
  if (o.outDir === undefined) {
    throw new UsageError('no terminal: --out <directory> is required for a generated password (a tmpfs such as /run, outside DATA_DIR), or pipe one with --password-stdin');
  }
  const out = realOrResolved(o.outDir);
  const data = realOrResolved(o.dataDir);
  if (out === data || out.startsWith(data + sep)) throw new UsageError('--out must not be inside DATA_DIR (it is backed up and readable by the app)');
  let isDir = false;
  try {
    isDir = statSync(out).isDirectory();
  } catch {
    // missing
  }
  if (!isDir) throw new UsageError('--out is not a directory (create it first, for example on a tmpfs)');

  const password = generatePassword();
  const path = join(out, `udgam-password-${randomBytes(8).toString('hex')}.txt`);
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeSync(fd, `${password}\n`);
  } finally {
    closeSync(fd);
  }
  chmodSync(path, 0o600); // whatever the umask

  // Until the account is written, an interrupted run must not leave a password for no account behind.
  const signals = o.signals ?? process;
  const exit = o.exit ?? ((code: number) => process.exit(code));
  const onInt = () => {
    rmSync(path, { force: true });
    exit(130);
  };
  const onTerm = () => {
    rmSync(path, { force: true });
    exit(143);
  };
  signals.once('SIGINT', onInt);
  signals.once('SIGTERM', onTerm);
  const release = () => {
    signals.off('SIGINT', onInt);
    signals.off('SIGTERM', onTerm);
  };
  return {
    password,
    generated: true,
    delivery: { kind: 'file', path },
    deliver: release,
    abandon: () => {
      release();
      rmSync(path, { force: true });
    },
  };
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
