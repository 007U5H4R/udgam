import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// TC-005: src/lib is framework-free (technical-plan §3.3): no next, next/*, react or react-dom.
const rule = (messages: { ruleId: string | null }[]) =>
  messages.filter((m) => m.ruleId === 'no-restricted-imports');

describe('src/lib imports nothing from Next.js or React (TC-005)', () => {
  const eslint = new ESLint();

  it.each(["import 'next/headers'", "import { NextResponse } from 'next/server'", "import next from 'next'", "import React from 'react'", "import 'react-dom'", "import 'server-only'"])(
    'rejects a planted import in src/lib: %s',
    async (code) => {
      const [result] = await eslint.lintText(code, { filePath: 'src/lib/x.ts' });
      expect(rule(result!.messages)).toHaveLength(1);
    },
    60_000, // heavy by design: the first call loads the ESLint config cold
  );

  // Heavy by design: ESLint loads the Next.js + TypeScript config programmatically (seconds when cold).
  it('does not restrict the same import outside src/lib', async () => {
    const [result] = await eslint.lintText("import { NextResponse } from 'next/server'", {
      filePath: 'src/app/x.ts',
    });
    expect(rule(result!.messages)).toHaveLength(0);
  }, 60_000);

  // Heavy by design: lints every file under src/lib.
  it('finds no restricted imports in the real src/lib', async () => {
    const results = await eslint.lintFiles(['src/lib']);
    expect(results.length).toBeGreaterThan(0);
    expect(results.flatMap((r) => rule(r.messages))).toHaveLength(0);
  }, 120_000);
});
