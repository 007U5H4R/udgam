import { AttestationLine } from '../../../../../../components/ui/AttestationLine';
import { GlassCard } from '../../../../../../components/ui/GlassCard';
import type { AttestationRecord } from '../../../../../../lib/attestations/attach';
import s from '../../plots.module.css';
import { AttestationForm } from './AttestationForm';

// The plot's organic certificates (TKT-13, DISC4): each one an issuer's statement whose file Udgam keeps
// unchanged on record, worded only by AttestationLine, with the download for admins and the form to add
// another. Composed from the plot screens' own parts (TP17).

export function AttestationCard({ plotId, records, today }: { plotId: string; records: AttestationRecord[]; today: string }) {
  return (
    <GlassCard as="section" className={[s.sectionCard, s.wide].join(' ')} aria-labelledby="att-h">
      <h3 className={s.secH} id="att-h">
        Organic certificate
      </h3>
      <p className={s.note}>The certificate is the issuer’s statement. Udgam keeps the file and its fingerprint on record and shows if it ever changes.</p>
      {records.length === 0 ? (
        <p className={s.note} data-testid="attestation-empty">
          No certificate on record for this plot.
        </p>
      ) : (
        <ul className={s.regList} data-testid="attestations">
          {records.map((a) => (
            <li key={a.id}>
              <AttestationLine issuer={a.issuer} validFrom={a.validFrom} validTo={a.validTo} today={today} />
              <p className={s.note}>
                <a href={`/admin/plots/${plotId}/attestation/${a.id}`} download>
                  Download certificate (PDF)
                </a>{' '}
                · fingerprint {a.fileHash.slice(0, 12)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className={s.editorWrap}>
        <AttestationForm plotId={plotId} />
      </div>
    </GlassCard>
  );
}
