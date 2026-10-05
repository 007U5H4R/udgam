import { t } from '../i18n';
import type { Failure } from './actions';

// The inline error an agreement action shows when it did not go through (Design.md §28.6). Isomorphic:
// the client forms import it. A stale screen (the agreement changed since it was drawn) says so and asks
// for a reload; the ledger's two failures use the screen's own words.

export type ErrCopy = { title: string; body: string };

export function failureCopy(failure: Failure, texts: { noAnswer: ErrCopy; turnedAway?: ErrCopy }): ErrCopy {
  if (failure === 'changed') return { title: t('agreements.changed.title'), body: t('agreements.changed.body') };
  if (failure === 'turned_away' && texts.turnedAway) return texts.turnedAway;
  return texts.noAnswer;
}
