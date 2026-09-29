// Clean-room checker CLI: `tsx evals/scorers/independent-verifier/cli.ts <feed.json> <keys.json>`.
// Prints the checkFeed result as JSON; exits 0 when the feed verifies, 1 when it does not, 2 on a
// usage error or an unreadable file. A feed file that is not JSON fails at step `format` (exit 1).
import { readFileSync } from 'node:fs';
import { checkFeed } from './src/verify';

async function main(argv: string[]): Promise<number> {
  const [feedPath, keysPath] = argv;
  if (!feedPath || !keysPath || argv.length !== 2) {
    process.stderr.write('usage: cli.ts <feed.json> <keys.json>\n');
    return 2;
  }
  let feedText: string;
  let keys: unknown;
  try {
    feedText = readFileSync(feedPath, 'utf8');
    keys = JSON.parse(readFileSync(keysPath, 'utf8')) as unknown;
  } catch (err) {
    process.stderr.write(`cannot read input: ${(err as Error).message}\n`);
    return 2;
  }
  let feed: unknown;
  try {
    feed = JSON.parse(feedText) as unknown;
  } catch {
    feed = undefined; // not JSON: checkFeed reports step `format`
  }
  const result = await checkFeed(feed, keys);
  process.stdout.write(JSON.stringify(result) + '\n');
  return result.ok ? 0 : 1;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`checker error: ${(err as Error).message}\n`);
    process.exitCode = 2;
  },
);
