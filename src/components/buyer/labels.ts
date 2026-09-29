import { t } from '../../lib/i18n';

// Shared words of the batch screens (admin and buyer).

export const cropLabel = (crop: 'arabica' | 'robusta') => t(crop === 'arabica' ? 'crop.arabica' : 'crop.robusta');
export const pickingsLabel = (n: number) => (n === 1 ? t('batches.pickings.one') : t('batches.pickings.many', { n }));
export const plotsLabel = (n: number) => (n === 1 ? t('batches.plots.one') : t('batches.plots.many', { n }));
