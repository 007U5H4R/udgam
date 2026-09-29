# Independent (clean-room) proof checker

This folder is a second, independent verifier for Udgam proof feeds (`udgam-proof-feed/1`). It exists
to prove success metric S6 without trusting the app's own verifier (evaluation-plan EV11, TC-073).

## The clean-room rule

- It is written **only** from `docs/proof-feed.md`, `docs/proof-feed.vectors.json` and
  `evals/fixtures/crypto-vectors.json`. Nobody writing it reads `src/`. If the document is not enough
  to write a check, that is a defect in `docs/proof-feed.md`, fixed there, never by reading the app.
- It imports **nothing** outside this folder: every import is relative (resolving inside this folder)
  or a Node built-in with the `node:` prefix (`node:crypto` WebCrypto, `node:fs`). No npm packages.
  Test files may also import the test runner `vitest`, which is not app code.
- `tests/independent-verifier-isolation.test.ts` and an ESLint override in `eslint.config.mjs`
  enforce the rule. This folder has its own `tsconfig.json` with no `paths`
  (`pnpm tsc -p evals/scorers/independent-verifier`).

## Use

```sh
pnpm tsx evals/scorers/independent-verifier/cli.ts <feed.json> <keys.json>
```

It prints `{"ok":…,"verified":…,"total":…,"failure":{"step":…,"seq":…}}`, then exits 0 when the
feed verifies and 1 when it does not (2 on a usage or read error). `keys.json` is the key document
served at `/.well-known/udgam-ledger-key`.

Two more modes serve the harness proof suite (`evals/harness/suites/proof.ts`), which runs the
checker as a child process, so it shares no module state with the app's verifier:

- `cli.ts --batch <jobs.json>`: `jobs.json` is `[{ "feed": "<path>", "keys": "<path>" }, …]`. It
  prints the results as a JSON array in job order. A job whose files cannot be read gets
  `{ "ok": false, "verified": 0, "total": 0, "error": "…" }`; it never aborts the batch.

`checkFeed` never throws: an unexpected error becomes a failure at step `format`, and a feed nested
arbitrarily deep fails at `payload-hash` (or is ignored where the member is unknown) instead of
overflowing the stack.
- `cli.ts --vectors <crypto-vectors.json>`: checks the shared JCS, SHA-256, thumbprint and ES256
  vectors with this folder's code and prints `{ ok, total, failed }` (the clean-room half of
  EVAL-066).
