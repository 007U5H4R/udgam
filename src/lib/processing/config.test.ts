import { createHash } from 'node:crypto';
import canonicalize from 'canonicalize';
import { describe, expect, it } from 'vitest';
import { MB_CONFIG, MB_CONFIG_HASH, PROCESSES, isPlaceholderBand } from './config';
import { PLACEHOLDER_PROCESSES } from './placeholder-bands';

// TSK-26.1 (TC-086): the mass-balance bands `mb-1` are data with a version, a source per process and a
// pinned JCS hash (printed in eval provenance). The Coffee Board outturns are fixed literals from
// technical-plan TSK-26.1; pulping and drying are placeholders for the owner to confirm (§28.10).

describe('mass-balance config mb-1 (TSK-26.1)', () => {
  it('is version mb-1 with the four processes, each for arabica and robusta', () => {
    expect(MB_CONFIG.version).toBe('mb-1');
    expect([...PROCESSES]).toEqual(['pulping', 'drying', 'hulling_parchment', 'hulling_dry_cherry']);
    for (const p of PROCESSES) expect(Object.keys(MB_CONFIG.bands[p]).sort()).toEqual(['arabica', 'robusta']);
  });

  it('every band has min < max (percent of input) and every process a source', () => {
    for (const p of PROCESSES) {
      for (const crop of ['arabica', 'robusta'] as const) {
        const [min, max] = MB_CONFIG.bands[p][crop];
        expect(min, `${p} ${crop}`).toBeGreaterThan(0);
        expect(min, `${p} ${crop}`).toBeLessThan(max);
      }
      expect(MB_CONFIG.source[p].trim().length, p).toBeGreaterThan(0);
    }
  });

  it('hulling bands are the Coffee Board outturns ±5 points (CCRI, Annual Report 2022-23)', () => {
    expect(MB_CONFIG.bands.hulling_parchment).toEqual({ arabica: [75, 85], robusta: [80, 90] });
    expect(MB_CONFIG.bands.hulling_dry_cherry).toEqual({ arabica: [48.5, 58.5], robusta: [47.7, 57.7] });
    expect(MB_CONFIG.source.hulling_parchment).toMatch(/Coffee Board/);
    expect(MB_CONFIG.source.hulling_dry_cherry).toMatch(/Coffee Board/);
  });

  it('pulping and drying are placeholders for the owner to confirm, never presented as verified', () => {
    expect(MB_CONFIG.source.pulping).toMatch(/^placeholder — owner to confirm/);
    expect(MB_CONFIG.source.drying).toMatch(/^placeholder — owner to confirm/);
    expect(isPlaceholderBand('pulping')).toBe(true);
    expect(isPlaceholderBand('drying')).toBe(true);
    expect(isPlaceholderBand('hulling_parchment')).toBe(false);
    expect(isPlaceholderBand('hulling_dry_cherry')).toBe(false);
  });

  it('the structured placeholder list for the current version agrees with the sources (the certificate reads the list)', () => {
    expect(PLACEHOLDER_PROCESSES[MB_CONFIG.version]).toEqual(['pulping', 'drying']);
    expect(PROCESSES.filter((p) => MB_CONFIG.source[p].startsWith('placeholder — owner to confirm'))).toEqual([...PLACEHOLDER_PROCESSES[MB_CONFIG.version]!]);
  });

  it('MB_CONFIG_HASH is the SHA-256 of the RFC 8785 form, and is stable (pinned)', () => {
    const expected = createHash('sha256').update(canonicalize(MB_CONFIG)!).digest('hex');
    expect(MB_CONFIG_HASH).toBe(expected);
    expect(MB_CONFIG_HASH).toBe('0368d30cc6233057fc00f9e10d9f662d05fbd8618d101264639466dfcac92ff1'); // mb-1: a change is a new version
  });
});
