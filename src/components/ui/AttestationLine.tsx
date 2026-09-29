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

/** "Certified by {issuer} — certificate on record · valid {from}–{to}" (or "· expired {to}"). */
export function attestationText({ issuer, validFrom, validTo, today }: AttestationLineProps): string {
  const head = `Certified by ${issuer} — certificate on record`;
  if (today > validTo) return `${head} · expired ${day(validTo)}`;
  if (today < validFrom) return `${head} · valid from ${day(validFrom)}`;
  return `${head} · valid ${day(validFrom)}–${day(validTo)}`;
}

export function AttestationLine(props: AttestationLineProps) {
  return (
    <p className={styles.line} data-testid="attestation-line">
      {attestationText(props)}
    </p>
  );
}
