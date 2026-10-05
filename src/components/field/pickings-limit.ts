import { PICKINGS_LIMIT, type PickingMonth } from '../../lib/db/queries/pickings';
import { t, type Lang } from '../../lib/i18n';

/**
 * DES-022: the last row of the Pickings tab when the list reached its bound (the newest PICKINGS_LIMIT):
 * that only the last ones are shown and that the office has the earlier ones. Null below the bound.
 */
export function pickingsLimitNote(months: PickingMonth[], lang: Lang): string | null {
  const shown = months.reduce((n, m) => n + m.items.length, 0);
  return shown >= PICKINGS_LIMIT ? t('pk.limit', { n: PICKINGS_LIMIT }, lang) : null;
}
