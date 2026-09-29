import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { t } from '../../lib/i18n';
import styles from './Rail.module.css';

// The admin rail (Design.md §13), ported from final/admin.html: Review · Plots · Batches · Phones with the
// mockup's icons, the wordmark and the signed-in admin. `RailShell` lays it out beside the page (rail +
// content; a floating tab bar on phones). Imported by every admin screen (TKT-06, 12, 14).

export type RailSection = 'review' | 'plots' | 'batches' | 'phones';

const ICONS: Record<RailSection, ReactNode> = {
  review: (
    <>
      <path d="M3.5 13.5h4.6l1.5 2.5h4.8l1.5-2.5h4.6" />
      <path d="M6 5h12l2.5 8.5V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-4.5z" />
    </>
  ),
  plots: <path d="M5 7.5 11 4l8 3-1.5 9L10 20l-5.5-4z" />,
  batches: (
    <>
      <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" />
      <path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" />
    </>
  ),
  phones: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
};

const ITEMS: { id: RailSection; href: string; label: 'rail.review' | 'rail.plots' | 'rail.batches' | 'rail.phones' }[] = [
  { id: 'review', href: '/admin', label: 'rail.review' },
  { id: 'plots', href: '/admin/plots', label: 'rail.plots' },
  { id: 'batches', href: '/admin/batches', label: 'rail.batches' },
  { id: 'phones', href: '/admin/phones', label: 'rail.phones' },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export type RailProps = {
  current: RailSection;
  /** The signed-in admin, shown at the foot of the rail. */
  me?: { name: string };
  /** Pickings waiting for review (the badge on Review); hidden when 0 or absent. */
  reviewCount?: number;
};

export function Rail({ current, me, reviewCount }: RailProps) {
  return (
    <nav className={styles.rail} aria-label={t('rail.label')}>
      <span className={styles.mark}>
        <Image src="/brand/cherry.svg" alt="" width={52} height={52} unoptimized />
        {t('app.name')}
      </span>
      <ul className={styles.list}>
        {ITEMS.map((item) => (
          <li key={item.id}>
            <Link className={styles.item} href={item.href} aria-current={item.id === current ? 'page' : undefined}>
              <span className={styles.ic}>
                <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
                  {ICONS[item.id]}
                </svg>
                {item.id === 'review' && reviewCount ? (
                  <span className={styles.count} aria-hidden="true">
                    {reviewCount}
                  </span>
                ) : null}
              </span>
              {t(item.label)}
              {item.id === 'review' && reviewCount ? <span className={styles.vh}>, {reviewCount} waiting</span> : null}
            </Link>
          </li>
        ))}
      </ul>
      {me ? (
        <p className={styles.me}>
          <span className={styles.avatar} aria-hidden="true">
            {initials(me.name)}
          </span>
          <span>
            {me.name}
            <small>{t('rail.role')}</small>
          </span>
        </p>
      ) : null}
    </nav>
  );
}

/** The admin screen layout: the rail and the screen's content beside it. */
export function RailShell({ children, ...rail }: RailProps & { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <Rail {...rail} />
      <div className={styles.main}>{children}</div>
    </div>
  );
}
