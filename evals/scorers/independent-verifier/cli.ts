// Clean-room checker CLI.
//   tsx evals/scorers/independent-verifier/cli.ts <feed.json> <keys.json>
//     Prints the checkFeed result as JSON; exits 0 when the feed verifies, 1 when it does not. A feed
//     file that is not JSON fails at step `format` (exit 1).
//   tsx evals/scorers/independent-verifier/cli.ts --batch <jobs.json>
//     jobs.json is [{ "feed": "<path>", "keys": "<path>" }, …]; prints the results as a JSON array in
//     job order and exits 0 (the harness proof suite runs every feed in one child process).
//   tsx evals/scorers/independent-verifier/cli.ts --vectors <crypto-vectors.json>
//     Checks the shared JCS, SHA-256 and ECDSA vectors with this folder's code; exits 0 when all agree.
// Exit 2 on a usage error or an unreadable input.
import { readFileSync } from 'node:fs';
import { checkFeed, type CheckResult } from './src/verify';
import { checkCryptoVectors } from './src/vectors';

class UsageError extends Error {}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

async function checkFiles(feedPath: string, keysPath: string): Promise<CheckResult> {
  const feedText = readFileSync(feedPath, 'utf8');
  const keys = readJson(keysPath);
  let feed: unknown;
  try {
    feed = JSON.parse(feedText) as unknown;
  } catch {
    feed = undefined; // not JSON: checkFeed reports step `format`
  }
  return checkFeed(feed, keys);
}

async function main(argv: string[]): Promise<number> {
  const out = (v: unknown) => process.stdout.write(JSON.stringify(v) + '\n');
  if (argv.length === 2 && argv[0] === '--batch') {
    const jobs = readJson(argv[1]!);
    if (!Array.isArray(jobs)) throw new UsageError('--batch takes a JSON array of { feed, keys } paths');
    const results: CheckResult[] = [];
    for (const job of jobs as { feed?: unknown; keys?: unknown }[]) {
      if (typeof job?.feed !== 'string' || typeof job?.keys !== 'string') throw new UsageError('each --batch job needs string feed and keys paths');
      results.push(await checkFiles(job.feed, job.keys));
    }
    out(results);
    return 0;
  }
  if (argv.length === 2 && argv[0] === '--vectors') {
    const result = await checkCryptoVectors(readJson(argv[1]!));
    out(result);
    return result.ok ? 0 : 1;
  }
  if (argv.length !== 2 || argv.some((a) => a.startsWith('--'))) {
    throw new UsageError('usage: cli.ts <feed.json> <keys.json> | --batch <jobs.json> | --vectors <crypto-vectors.json>');
  }
  const result = await checkFiles(argv[0]!, argv[1]!);
  out(result);
  return result.ok ? 0 : 1;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`${err instanceof UsageError ? '' : 'cannot read input: '}${(err as Error).message}\n`);
    process.exitCode = 2;
  },
);
