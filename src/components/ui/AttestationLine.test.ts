import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AttestationLine, attestationText } from './AttestationLine';

// TSK-13.2 / TC-058 (wording half), EVAL-079, DISC4: organic status is always an attestation — "Certified
// by <issuer> — certificate on record" with the validity dates — and never says "verified organic".

const base = { issuer: 'INDOCERT', validFrom: '2026-01-01', validTo: '2027-01-01' };

describe('attestationText', () => {
  it('valid today: names the issuer, says the certificate is on record and gives the validity', () => {
    expect(attestationText({ ...base, today: '2026-10-05' })).toBe('Certified by INDOCERT — certificate on record · valid 1 Jan 2026–1 Jan 2027');
  });

  it('valid on its first and its last day (the range is inclusive)', () => {
    expect(attestationText({ ...base, today: '2026-01-01' })).toBe('Certified by INDOCERT — certificate on record · valid 1 Jan 2026–1 Jan 2027');
    expect(attestationText({ ...base, today: '2027-01-01' })).toBe('Certified by INDOCERT — certificate on record · valid 1 Jan 2026–1 Jan 2027');
  });

  it('expired: the day after validTo it says expired with the end date', () => {
    expect(attestationText({ ...base, today: '2027-01-02' })).toBe('Certified by INDOCERT — certificate on record · expired 1 Jan 2027');
  });

  it('not yet valid: says when it starts, not that it is valid', () => {
    expect(attestationText({ ...base, today: '2025-12-31' })).toBe('Certified by INDOCERT — certificate on record · valid from 1 Jan 2026');
  });

  it('formats every month and two-digit days', () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    months.forEach((m, i) => {
      const mm = String(i + 1).padStart(2, '0');
      expect(attestationText({ issuer: 'X', validFrom: `2026-${mm}-15`, validTo: `2026-${mm}-28`, today: `2026-${mm}-20` })).toBe(
        `Certified by X — certificate on record · valid 15 ${m} 2026–28 ${m} 2026`,
      );
    });
  });

  it('never claims verification, whatever the dates', () => {
    for (const today of ['2025-01-01', '2026-06-01', '2030-01-01']) {
      expect(attestationText({ ...base, today }).toLowerCase()).not.toMatch(/verified|organic/);
    }
  });
});

describe('<AttestationLine>', () => {
  it('renders the text once, escaped', () => {
    const html = renderToStaticMarkup(
      createElement(AttestationLine, { issuer: '<b>Odd & Co</b>', validFrom: '2026-01-01', validTo: '2027-01-01', today: '2026-10-05' }),
    );
    expect(html).toContain('Certified by <bdi>&lt;b&gt;Odd &amp; Co&lt;/b&gt;</bdi> — certificate on record · valid 1 Jan 2026–1 Jan 2027');
    expect(html).not.toContain('<b>');
    expect(html).toContain('data-testid="attestation-line"');
  });

  it('isolates the issuer in <bdi>, so a right-to-left name cannot reorder the words after it', () => {
    const html = renderToStaticMarkup(createElement(AttestationLine, { issuer: 'شهادة', validFrom: '2026-01-01', validTo: '2027-01-01', today: '2027-02-01' }));
    expect(html).toContain('data-testid="attestation-line">Certified by <bdi>شهادة</bdi> — certificate on record · expired 1 Jan 2027</p>');
  });
});
