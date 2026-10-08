import { describe, expect, it } from 'vitest';
import { pageTitle } from './page-title';

// DES-110 (WCAG 2.4.2): one title pattern on the office surfaces, "<Screen> <ID> · Udgam", so browser tabs
// and history can tell two agreements or batches apart.
describe('pageTitle', () => {
  it('names the screen, then the ID when there is one, then the app', () => {
    expect(pageTitle('Review')).toBe('Review · Udgam');
    expect(pageTitle('Agreement', 'AG-4KQQTCWP')).toBe('Agreement AG-4KQQTCWP · Udgam');
    expect(pageTitle('Batch', 'B-7Q2M9X1C')).toBe('Batch B-7Q2M9X1C · Udgam');
  });

  it('keeps a long or odd URL segment from taking over the tab', () => {
    expect(pageTitle('Batch', 'X'.repeat(100))).toBe(`Batch ${'X'.repeat(40)}… · Udgam`);
    expect(pageTitle('Plot', '  ')).toBe('Plot · Udgam');
  });
});
