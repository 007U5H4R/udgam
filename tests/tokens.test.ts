import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// TC-004: the frozen mockup `:root` tokens are copied verbatim into src/app/tokens.css.
const parse = (css: string) =>
  Object.fromEntries(
    [...css.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1]!,
      m[2]!.replace(/\s+/g, ' ').trim(),
    ]),
  );

const mock = parse(
  readFileSync('.design/exploration/final/index.html', 'utf8').match(/:root\s*{([^}]*)}/)![1]!,
);
const ours = parse(readFileSync('src/app/tokens.css', 'utf8'));

describe('design tokens (TC-004)', () => {
  it('finds the mockup tokens', () => {
    expect(Object.keys(mock).length).toBeGreaterThan(30);
  });

  for (const [k, v] of Object.entries(mock)) {
    if (k === 'banner-h') continue; // prototype-only
    it(`--${k} equals the mockup value`, () => {
      expect(ours[k], k).toBe(v);
    });
  }

  it('does not carry the prototype-only --banner-h', () => {
    expect(ours['banner-h']).toBeUndefined();
  });

  it('configures Figtree and Noto Sans Kannada (self-hosted, every weight present)', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    expect(layout).toContain('variable: "--font-figtree"');
    expect(layout).toContain('variable: "--font-noto-sans-kannada"');
    for (const w of ['400', '500', '600', '700', '800']) {
      const f = `fonts/figtree-latin-${w}-normal.woff2`;
      expect(layout).toContain(`./${f}`);
      expect(existsSync(`src/app/${f}`), f).toBe(true);
    }
    for (const w of ['400', '600', '700']) {
      const f = `fonts/noto-sans-kannada-kannada-${w}-normal.woff2`;
      expect(layout).toContain(`./${f}`);
      expect(existsSync(`src/app/${f}`), f).toBe(true);
    }
  });
});
