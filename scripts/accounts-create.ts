// `pnpm accounts:create` (SEC-001, TKT-28): create ONE production account with its own password.
//
//   pnpm accounts:create --name "Asha K." --email asha@fpo.example --role admin --org ORG-XXXXXXXX
//   pnpm accounts:create --name "Asha K." --email asha@fpo.example --role admin --new-org "Hosahalli FPO"
//   printf %s "$PW" | pnpm accounts:create … --password-stdin
//   pnpm accounts:create … --out /run/udgam   (no terminal: the generated password goes to a 0600 file there)
//
// --role is agent | admin | buyer | processor; --org names an existing organisation of the fitting type
// (agent/admin → fpo), or --new-org creates one. The password is generated (or read with
// --password-stdin) and delivered as scripts/accounts-cli.ts describes; it never goes in argv or a log.
// Field agents then enrol their phone the usual way (an admin issues an enrolment code, TKT-05).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { choosePassword, commandName, describeDelivery, parseCliArgs, runCli, UsageError, wantsHelp } from './accounts-cli';

const USAGE = `usage: ${commandName('create')} --name <name> --email <email> --role agent|admin|buyer|processor (--org <ORG-id> | --new-org <name>) [--password-stdin | --out <directory>]`;

export async function main(argv: string[]): Promise<number> {
  return runCli(USAGE, async () => {
    if (wantsHelp(argv)) {
      process.stdout.write(`${USAGE}\n`);
      return;
    }
    const a = parseCliArgs(argv, ['name', 'email', 'role', 'org', 'new-org', 'out']);
    const str = (k: string) => (typeof a[k] === 'string' ? (a[k] as string) : undefined);
    const [name, email, role, org, newOrg] = [str('name'), str('email'), str('role'), str('org'), str('new-org')];
    if (!name || !email || !role) throw new UsageError('--name, --email and --role are required');
    const { isRole } = await import('../src/lib/auth/session');
    if (!isRole(role)) throw new UsageError('--role must be agent, admin, buyer or processor');
    if ((org === undefined) === (newOrg === undefined)) throw new UsageError('give exactly one of --org and --new-org');

    process.env.LOG_LEVEL ||= 'warn';
    const { env } = await import('../src/lib/config/env');
    const { closeDb, getDbReady } = await import('../src/lib/db/client');
    const { runMigrations } = await import('../src/lib/db/migrate');
    const { createAccount } = await import('../src/lib/auth/accounts');
    const chosen = await choosePassword({ fromStdin: a['password-stdin'] === true, stdin: process.stdin, stdout: process.stdout, outDir: typeof a.out === 'string' ? a.out : undefined, dataDir: env.DATA_DIR, label: email });
    try {
      const db = await getDbReady();
      await runMigrations(db); // idempotent; the app also migrates at boot
      const r = await createAccount(db, org !== undefined ? { name, email, role, orgId: org } : { name, email, role, newOrgName: newOrg! }, chosen.password, { generated: chosen.generated, onCommitted: chosen.committed });
      chosen.deliver();
      console.log(JSON.stringify({ created: 'account', userId: r.userId, email: r.email, role, orgId: r.orgId, password: describeDelivery(chosen.delivery) }));
    } catch (err) {
      chosen.abandon();
      throw err;
    } finally {
      closeDb();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main(process.argv.slice(2));
