import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { failureCopy } from './failure-copy';

// Review minor 5 / spec minors 1 and 6 (Design.md §28.6): which inline error an action shows. Texts are
// the shipped English literals.

const settle = {
  noAnswer: { title: t('agreements.settle.errTitle'), body: t('agreements.settle.noAnswer', { amount: '₹1,50,000.00' }) },
  turnedAway: { title: t('agreements.settle.errTitle'), body: t('agreements.settle.turnedAway') },
};
const fund = { noAnswer: { title: t('agreements.fund.errTitle'), body: t('agreements.fund.errBody') } };

describe('failureCopy', () => {
  it('settle turned away: the ledger refused before judging, nothing moved', () => {
    expect(failureCopy('turned_away', settle)).toEqual({
      title: 'Couldn’t settle.',
      body: 'The ledger turned the request away before judging the conditions, so nothing moved. Try again; if it happens again, tell the Udgam team.',
    });
  });

  it('settle no answer keeps the ledger-didn’t-answer words', () => {
    expect(failureCopy('no_answer', settle).body).toBe('The ledger didn’t answer, so nothing moved and the conditions were not judged. The ₹1,50,000.00 (mock INR) is still in escrow.');
  });

  it('a stale screen says the agreement changed, never that the ledger didn’t answer', () => {
    for (const texts of [settle, fund]) {
      expect(failureCopy('changed', texts)).toEqual({ title: 'This agreement changed.', body: 'Nothing moved. Reload to see its current state.' });
    }
  });

  it('a screen without its own turned-away words falls back to its no-answer words', () => {
    expect(failureCopy('turned_away', fund)).toEqual({ title: 'Couldn’t fund the agreement.', body: 'The ledger didn’t answer, so nothing moved. Your balance is unchanged.' });
  });
});
