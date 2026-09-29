import { GlassCard } from '../../../../components/ui/GlassCard';
import { t } from '../../../../lib/i18n';
import s from './phones.module.css';

// The Phones page's loading, empty and error states (Design.md §18; admin.html ".sk", ".state-card",
// ".state-card.err"): a skeleton, not a spinner; the error says what happened, what to do, nothing lost.

export function PhonesSkeleton() {
  return (
    <div className={s.list} aria-busy="true" data-testid="phones-loading">
      <p className={s.vh} role="status">
        {t('phones.loading')}
      </p>
      {[0, 1].map((i) => (
        <GlassCard key={i} className={s.agent} aria-hidden="true">
          <span className={`${s.sk} ${s.skH}`} />
          <span className={`${s.sk} ${s.skLine}`} />
          <span className={`${s.sk} ${s.skLine}`} />
        </GlassCard>
      ))}
    </div>
  );
}

export function PhonesEmpty() {
  return (
    <GlassCard as="section" className={s.state} data-testid="phones-empty">
      <h2>{t('phones.empty.title')}</h2>
      <p>{t('phones.empty.body')}</p>
    </GlassCard>
  );
}

export function PhonesError() {
  return (
    <GlassCard as="section" className={`${s.state} ${s.err}`} role="alert" data-testid="phones-error">
      <h2>{t('phones.error.title')}</h2>
      <p>{t('phones.error.body')}</p>
    </GlassCard>
  );
}
