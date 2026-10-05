import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { signOut } from '../../app/(public)/sign-in/actions';
import { t } from '../../lib/i18n';
import styles from './Rail.module.css';
import { SignOutPill } from './SignOut';

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
  /**
   * Another surface's items (M-002 processor, Design.md §28.2: one item, Batches → /processor), its nav
   * label and the role line under the signed-in person. Absent: the admin's frozen four items.
   */
  items?: { id: RailSection; href: string }[];
  label?: string;
  roleLabel?: string;
};

export function Rail({ current, me, reviewCount, items, label, roleLabel }: RailProps) {
  const shown = items ? items.map((i) => ({ ...i, label: ITEMS.find((x) => x.id === i.id)!.label })) : ITEMS;
  return (
    <nav className={`${styles.rail} admin-rail`} aria-label={label ?? t('rail.label')} data-n={shown.length}>
      <span className={styles.mark}>
        <Image src="/brand/cherry.svg" alt="" width={52} height={52} unoptimized />
        {t('app.name')}
      </span>
      <ul className={styles.list}>
        {shown.map((item) => (
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
              {item.id === 'review' && reviewCount ? <span className={styles.vh}>{t('rail.waiting', { n: reviewCount })}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
      {/* The rail foot: the signed-in person and Sign out (DES-105, EXE40; hidden with the rail on phones). */}
      <div className={styles.foot}>
        {me ? (
          <p className={styles.me}>
            <span className={styles.avatar} aria-hidden="true">
              {initials(me.name)}
            </span>
            <span>
              {me.name}
              <small>{roleLabel ?? t('rail.role')}</small>
            </span>
          </p>
        ) : null}
        <form action={signOut}>
          <button className={styles.out} type="submit">
            <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14" />
              <path d="M10 16.5 5.5 12 10 7.5M5.5 12H15" />
            </svg>
            {t('signOut')}
          </button>
        </form>
      </div>
    </nav>
  );
}

/** The admin screen layout: the rail and the screen's content beside it. */
export function RailShell({ children, className, ...rail }: RailProps & { children: ReactNode; className?: string }) {
  return (
    <div className={className ? `${styles.shell} ${className}` : styles.shell}>
      <Rail {...rail} />
      <div className={styles.main}>
        {children}
        {/* Phones: the rail is a tab bar with no foot, so Sign out ends the screen instead (DES-105). */}
        <SignOutPill className={`${styles.phoneOut} admin-rail-out`} />
      </div>
    </div>
  );
}
