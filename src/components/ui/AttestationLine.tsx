import { t } from '../../lib/i18n';
import styles from './AttestationLine.module.css';

// The one wording for organic status on every surface (plot page, batch detail, certificate; TKT-16
// imports this): an issuer's certificate is on record. Udgam proves the file is unchanged since it was
// recorded; it never says Udgam checked the plot is organic (DISC4, CF-11, EVAL-079). The dates are calendar
// dates (`YYYY-MM-DD`), compared and printed as text so no time zone can move them.

export type AttestationLineProps = {
  issuer: string;
  /** `YYYY-MM-DD` */
  validFrom: string;
  /** `YYYY-MM-DD` */
  validTo: string;
  /** Today's calendar date, `YYYY-MM-DD` (the caller chooses the zone; the pages use IST). */
  today: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-01-05` → `5 Jan 2026`. */
function day(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

/** Everything after the issuer's name: " — certificate on record · valid {from}–{to}" (or "· expired {to}"). */
function afterIssuer({ validFrom, validTo, today }: Omit<AttestationLineProps, 'issuer'>): string {
  const head = ' — certificate on record';
  if (today > validTo) return `${head} · expired ${day(validTo)}`;
  if (today < validFrom) return `${head} · valid from ${day(validFrom)}`;
  return `${head} · valid ${day(validFrom)}–${day(validTo)}`;
}

/** "Certified by {issuer} — certificate on record · valid {from}–{to}" (or "· expired {to}"). */
export function attestationText(props: AttestationLineProps): string {
  return `${t('attest.certifiedBy')} ${props.issuer}${afterIssuer(props)}`;
}

/** The issuer sits in <bdi>: a right-to-left name cannot reorder the words after it (the text is anchored). */
export function AttestationLine(props: AttestationLineProps) {
  return (
    <p className={styles.line} data-testid="attestation-line">
      {t('attest.certifiedBy')} <bdi>{props.issuer}</bdi>
      {afterIssuer(props)}
    </p>
  );
}
