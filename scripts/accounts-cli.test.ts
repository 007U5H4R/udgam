import { EventEmitter } from 'node:events';
import { mkdirSync, readdirSync, readFileSync, statSync, symlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { tempDirs } from '../tests/helpers/tmp';
import { choosePassword, parseCliArgs, UsageError } from './accounts-cli';

// SEC-001: where a password comes from and where a generated one goes (the terminal path cannot be
// driven from a child process without a pty, so it is tested here with stand-in streams).

const tempDir = tempDirs();
const pipe = (text: string) => ({ isTTY: false as const, async *[Symbol.asyncIterator]() { yield Buffer.from(text); } });
const tty = { isTTY: true as const, async *[Symbol.asyncIterator]() {} };
const sink = (isTTY: boolean) => {
  const chunks: string[] = [];
  return { isTTY, write: (s: string) => (chunks.push(s), true), text: () => chunks.join('') };
};

describe('parseCliArgs', () => {
  it('reads --key value and --key=value and the --password-stdin flag', () => {
    expect(parseCliArgs(['--email', 'a@b.example', '--role=admin', '--password-stdin'], ['email', 'role'])).toEqual({ email: 'a@b.example', role: 'admin', 'password-stdin': true });
  });

  it('refuses a password in argv, naming no value', () => {
    for (const a of [['--password', 'x'], ['--password=x'], ['-p', 'x'], ['-px'], ['-Px'], ['--pass=x'], ['--pw', 'x'], ['--passwd=x']]) {
      expect(() => parseCliArgs(a, ['email'])).toThrow(UsageError);
      expect(() => parseCliArgs(a, ['email'])).toThrow(/never on the command line/);
    }
  });

  it('never echoes an argument it does not know: an unknown --option by name only, anything else not at all', () => {
    const secret = 'hunter2-positional-secret';
    for (const argv of [[secret], ['--email', 'a@b.example', secret], [`-x${secret}`], [`--colour=${secret}`]]) {
      let message = '';
      try {
        parseCliArgs(argv, ['email']);
      } catch (e) {
        expect(e).toBeInstanceOf(UsageError);
        message = (e as Error).message;
      }
      expect(message, argv.join(' ')).not.toBe('');
      expect(message).not.toContain(secret);
    }
    expect(() => parseCliArgs([secret], ['email'])).toThrow('unexpected argument (not shown)');
    expect(() => parseCliArgs([`--colour=${secret}`], ['email'])).toThrow('unknown option --colour');
  });

  it('refuses unknown options and a missing value', () => {
    expect(() => parseCliArgs(['--colour', 'red'], ['email'])).toThrow(/unknown option --colour/);
    expect(() => parseCliArgs(['--email'], ['email'])).toThrow(/--email needs a value/);
  });
});

describe('choosePassword', () => {
  /** A DATA_DIR and a separate output directory, as on the instance (/data and /run). */
  const dirs = () => {
    const root = tempDir('udgam-cred-');
    const dataDir = join(root, 'data');
    const outDir = join(root, 'run');
    mkdirSync(join(dataDir, 'credentials'), { recursive: true });
    mkdirSync(outDir);
    return { dataDir, outDir };
  };
  const base = (over: Partial<Omit<Parameters<typeof choosePassword>[0], 'signals' | 'exit'>> = {}) => ({
    fromStdin: false,
    stdin: pipe(''),
    stdout: sink(false),
    label: 'asha@fpo.example',
    ...dirs(),
    signals: new EventEmitter(),
    exit: vi.fn(),
    ...over,
  });

  it('--password-stdin reads the piped line (one trailing newline dropped) and prints nothing', async () => {
    const out = sink(false);
    const c = await choosePassword(base({ fromStdin: true, stdin: pipe('my piped password\n'), stdout: out, outDir: undefined }));
    expect(c.password).toBe('my piped password');
    expect(c.delivery).toEqual({ kind: 'stdin' });
    expect(out.text()).toBe('');
  });

  it('--password-stdin on a terminal is refused (it would echo the password)', async () => {
    await expect(choosePassword(base({ fromStdin: true, stdin: tty, stdout: sink(true) }))).rejects.toThrow(/needs a pipe/);
  });

  it('on a terminal (stdin and stdout): a generated password is shown once, on stdout, and no file is written', async () => {
    const out = sink(true);
    const o = base({ stdin: tty, stdout: out, outDir: undefined });
    const c = await choosePassword(o);
    expect(c.password).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(c.delivery).toEqual({ kind: 'tty' });
    c.deliver();
    expect(out.text().split(c.password).length - 1).toBe(1);
  });

  it('not interactive without --out: refused before anything is written (a password never lands by default)', async () => {
    await expect(choosePassword(base({ outDir: undefined }))).rejects.toThrow(/--out <directory> is required/);
    await expect(choosePassword(base({ stdin: tty, stdout: sink(false), outDir: undefined }))).rejects.toThrow(/--out <directory> is required/); // output redirected to a log
  });

  it('refuses an --out inside DATA_DIR (backed up and readable by the app), however it is spelled', async () => {
    const o = base();
    for (const out of [o.dataDir, join(o.dataDir, 'credentials'), join(o.outDir, '..', 'data', 'credentials')]) {
      await expect(choosePassword({ ...o, outDir: out }), out).rejects.toThrow(/must not be inside DATA_DIR/);
    }
    symlinkSync(join(o.dataDir, 'credentials'), join(o.outDir, 'sneaky'));
    await expect(choosePassword({ ...o, outDir: join(o.outDir, 'sneaky') })).rejects.toThrow(/must not be inside DATA_DIR/);
  });

  it('refuses an --out that is not an existing directory', async () => {
    const o = base();
    await expect(choosePassword({ ...o, outDir: join(o.outDir, 'missing') })).rejects.toThrow(/is not a directory/);
  });

  it('writes a new 0600 file in --out, named by a random token (never the email), printing nothing', async () => {
    const out = sink(false);
    const o = base({ stdout: out });
    const c = await choosePassword(o);
    expect(c.delivery.kind).toBe('file');
    const path = (c.delivery as { path: string }).path;
    expect(path.startsWith(o.outDir)).toBe(true);
    expect(basename(path)).toMatch(/^udgam-password-[0-9a-f]{16}\.txt$/);
    expect(path).not.toContain('asha');
    expect(readFileSync(path, 'utf8')).toBe(`${c.password}\n`);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    c.deliver();
    expect(out.text()).toBe('');
    expect(readdirSync(o.outDir)).toHaveLength(1);
  });

  it('the file is removed when the account write fails (abandon)', async () => {
    const o = base();
    const c = await choosePassword(o);
    c.abandon();
    expect(readdirSync(o.outDir)).toEqual([]);
  });

  it('SIGINT or SIGTERM before the account is written removes the file and exits 130 / 143', async () => {
    for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]] as const) {
      const o = base();
      await choosePassword(o);
      expect(readdirSync(o.outDir)).toHaveLength(1);
      o.signals.emit(signal);
      expect(readdirSync(o.outDir)).toEqual([]);
      expect(o.exit).toHaveBeenCalledWith(code);
    }
  });

  it('once the account is written (deliver), a signal no longer removes the file', async () => {
    const o = base();
    const c = await choosePassword(o);
    c.deliver();
    expect(o.signals.listenerCount('SIGINT') + o.signals.listenerCount('SIGTERM')).toBe(0);
    o.signals.emit('SIGTERM');
    expect(readdirSync(o.outDir)).toHaveLength(1);
  });
});
