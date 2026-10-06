import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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
    for (const a of [['--password', 'x'], ['--password=x'], ['-p', 'x'], ['--pass=x'], ['--pw', 'x']]) {
      expect(() => parseCliArgs(a, ['email'])).toThrow(UsageError);
      expect(() => parseCliArgs(a, ['email'])).toThrow(/never on the command line/);
    }
  });

  it('refuses unknown options and a missing value', () => {
    expect(() => parseCliArgs(['--colour', 'red'], ['email'])).toThrow(/unknown option --colour/);
    expect(() => parseCliArgs(['--email'], ['email'])).toThrow(/--email needs a value/);
  });
});

describe('choosePassword', () => {
  it('--password-stdin reads the piped line (one trailing newline dropped) and prints nothing', async () => {
    const out = sink(false);
    const c = await choosePassword({ fromStdin: true, stdin: pipe('my piped password\n'), stdout: out, credentialsDir: tempDir('udgam-cred-'), label: 'a@b.example' });
    expect(c.password).toBe('my piped password');
    expect(c.delivery).toEqual({ kind: 'stdin' });
    expect(out.text()).toBe('');
  });

  it('--password-stdin on a terminal is refused (it would echo the password)', async () => {
    await expect(choosePassword({ fromStdin: true, stdin: tty, stdout: sink(true), credentialsDir: tempDir('udgam-cred-'), label: 'a@b.example' })).rejects.toThrow(/needs a pipe/);
  });

  it('on a terminal (stdin and stdout): a generated password is shown once, on stdout, and no file is written', async () => {
    const out = sink(true);
    const dir = join(tempDir('udgam-cred-'), 'credentials');
    const c = await choosePassword({ fromStdin: false, stdin: tty, stdout: out, credentialsDir: dir, label: 'a@b.example' });
    expect(c.password).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(c.delivery).toEqual({ kind: 'tty' });
    c.deliver();
    expect(out.text().split(c.password).length - 1).toBe(1);
    expect(() => statSync(dir)).toThrow();
  });

  it('stdin a terminal but stdout redirected (a log file): writes the 0600 file instead of printing', async () => {
    const out = sink(false);
    const dir = join(tempDir('udgam-cred-'), 'credentials');
    const c = await choosePassword({ fromStdin: false, stdin: tty, stdout: out, credentialsDir: dir, label: 'a@b.example' });
    expect(c.delivery.kind).toBe('file');
    c.deliver();
    const path = (c.delivery as { path: string }).path;
    expect(readFileSync(path, 'utf8')).toBe(`${c.password}\n`);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(out.text()).not.toContain(c.password);
  });

  it('a file is never overwritten and is removed when the account write fails', async () => {
    const dir = join(tempDir('udgam-cred-'), 'credentials');
    const c = await choosePassword({ fromStdin: false, stdin: pipe(''), stdout: sink(false), credentialsDir: dir, label: 'a@b.example' });
    const path = (c.delivery as { path: string }).path;
    expect(statSync(path).mode & 0o777).toBe(0o600); // reserved (exclusively created) before the account is written
    c.abandon();
    expect(() => statSync(path)).toThrow();
  });
});
