// `pnpm accounts:set-password` (SEC-001, TKT-28): give one account a new password. Its sessions end and
// its sign-in throttles clear. The password is generated (or read with --password-stdin) and delivered
// as scripts/accounts-cli.ts describes; it never goes in argv or a log.
//
//   pnpm accounts:set-password --email asha@fpo.example
//   printf %s "$PW" | pnpm accounts:set-password --email asha@fpo.example --password-stdin
//   pnpm accounts:set-password --email asha@fpo.example --out /run/udgam   (no terminal)
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { choosePassword, commandName, describeDelivery, parseCliArgs, runCli, UsageError, wantsHelp } from './accounts-cli';

const USAGE = `usage: ${commandName('set-password')} --email <email> [--password-stdin | --out <directory>]`;

export async function main(argv: string[]): Promise<number> {
  if (wantsHelp(argv)) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  return runCli(USAGE, async () => {
    const a = parseCliArgs(argv, ['email', 'out']);
    const email = typeof a.email === 'string' ? a.email : undefined;
    if (!email) throw new UsageError('--email is required');

    process.env.LOG_LEVEL ||= 'warn';
    const { env } = await import('../src/lib/config/env');
    const { closeDb, getDbReady } = await import('../src/lib/db/client');
    const { setAccountPassword } = await import('../src/lib/auth/accounts');
    const chosen = await choosePassword({ fromStdin: a['password-stdin'] === true, stdin: process.stdin, stdout: process.stdout, outDir: typeof a.out === 'string' ? a.out : undefined, dataDir: env.DATA_DIR, label: email });
    try {
      const r = await setAccountPassword(await getDbReady(), email, chosen.password, { generated: chosen.generated, onCommitted: chosen.committed });
      chosen.deliver();
      console.log(JSON.stringify({ passwordSet: true, userId: r.userId, email: r.email, sessionsEnded: r.sessionsEnded, password: describeDelivery(chosen.delivery) }));
    } catch (err) {
      chosen.abandon();
      throw err;
    } finally {
      closeDb();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main(process.argv.slice(2));
