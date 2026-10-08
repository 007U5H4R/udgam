import Image from 'next/image';
import Link from 'next/link';
import { GlassCard } from './GlassCard';
import styles from './NotFound.module.css';
import pill from './Pill.module.css';

// The one not-found card (DES-104, DES-011; Design.md §18 "what happened, what to do next, nothing is
// lost"): the brand cherry, the h1, one sentence, and a ghost pill back to the person's home. Composed from
// ported parts only (TP17: the glass card, the pill and the empty-state cherry of admin.html's
// `.state-card`). Used by the root not-found and by the admin, buyer, processor and field route groups;
// the public certificate keeps its own byte-identical 404 (TP8, verify/[batchId]/not-found.tsx).
export function NotFoundCard({ title, body, backHref, backLabel }: { title: string; body: string; backHref: string; backLabel: string }) {
  return (
    <GlassCard as="section" className={styles.card} aria-labelledby="nf-h" data-testid="not-found">
      <div className={styles.cherry} aria-hidden="true">
        <Image src="/brand/cherry.svg" alt="" width={96} height={96} unoptimized />
      </div>
      <h1 className={styles.h} id="nf-h">
        {title}
      </h1>
      <p className={styles.body}>{body}</p>
      <Link className={`${pill.pill} ${pill.ghost} ${styles.back}`} href={backHref}>
        <svg className={styles.ic} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        {backLabel}
      </Link>
    </GlassCard>
  );
}

/** A whole-screen frame for a not-found outside any shell (the root not-found). */
export function NotFoundPage(props: Parameters<typeof NotFoundCard>[0]) {
  return (
    <main className={styles.page} id="main">
      <NotFoundCard {...props} />
    </main>
  );
}
