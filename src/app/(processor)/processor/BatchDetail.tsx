import Link from 'next/link';
import { Icon } from '../../../components/admin/QueueList';
import { MB_CONFIG } from '../../../lib/processing/config';
import { COPY, cropName, detailChip, istWhen, kg1, PROCESS_LABEL } from '../../../lib/processing/copy';
import type { ProcessorBatch } from '../../../lib/processing/read';
import { HandOnForm } from './HandOnForm';
import { StatusMark } from './ProcessorScreen';
import { StepForm } from './StepForm';

// The detail column of the processor surface (contract.html screen 6, variants form · within · flagged ·
// handed): the batch header with its chip, then either the step form, or the recorded step (the mass
// balance as one check row with its evidence) with the hand-on panel, or the handed-on outcome.

export function BatchDetail({ b, orgName, buyers }: { b: ProcessorBatch; orgName: string; buyers: { id: string; name: string }[] }) {
  const chip = detailChip(b);
  const flagged = b.step?.status === 'flag';
  return (
    <section className="detail" aria-labelledby="d-h" tabIndex={0}>
      <div className="d-body">
        <h1 className="vh d-h1">{COPY.title}</h1>
        <Link className="back d-back" href="/processor">
          <Icon name="arrowLeft" />
          {COPY.back}
        </Link>
        <header>
          <p className="eyebrow">Batch · from {b.fromOrgName}</p>
          <div className="d-title">
            <h2 id="d-h" tabIndex={-1}>
              {b.batchId}
            </h2>
            <span className={`vchip ${chip.cls}`} data-testid="batch-chip">
              <StatusMark cls={chip.cls} />
              {chip.text}
            </span>
          </div>
          <p className="d-meta">
            {cropName(b.crop)} · {b.pickings} {b.pickings === 1 ? 'picking' : 'pickings'} · {kg1(b.quantityKg)} kg · received {istWhen(b.receivedAt)}, signed on behalf of {b.fromOrgName}
          </p>
        </header>

        {b.step ? (
          <section className="glass card checks-card" aria-labelledby="mb-h" data-testid="step-result">
            <h3 className="sec-h" id="mb-h">
              {PROCESS_LABEL[b.step.process]} · recorded {istWhen(b.step.recordedAt)}
            </h3>
            <p className="checks-sum">
              Input {kg1(b.step.inputKg)} kg · output {kg1(b.step.outputKg)} kg
            </p>
            <ol className="checks">
              <li className={`chk ${flagged ? 'check' : ''}`} data-status={b.step.status}>
                <div className="c-top">
                  <span className={`c-stat ${flagged ? 'check' : 'ok'}`}>
                    <StatusMark cls={flagged ? 'check' : 'ok'} />
                    {flagged ? 'Flagged' : 'Within range'}
                  </span>
                  <span className="c-name">
                    {COPY.weightName}
                    <code>mass_balance · {b.step.configVersion || MB_CONFIG.version}</code>
                  </span>
                </div>
                <p className="c-ev">
                  {b.step.evidence}
                  {flagged ? <span className="again">{COPY.nothingRefused}</span> : null}
                </p>
              </li>
            </ol>
          </section>
        ) : null}

        {b.handedOn ? (
          <div className="glass outcome handed" role="status" data-testid="handed-on">
            <p className="o-top">
              <span className="vchip ok">
                <StatusMark cls="ok" />
                Handed on to {b.handedOn.toOrgName}
              </span>
              <b>{COPY.recorded}</b>
            </p>
            <p className="o-meta">{COPY.handedMeta(b.handedOn.byName, orgName, istWhen(b.handedOn.at))}</p>
          </div>
        ) : b.step ? (
          b.held ? (
            <HandOnForm batchId={b.batchId} buyers={buyers} />
          ) : null
        ) : b.held ? (
          <StepForm batchId={b.batchId} crop={b.crop} />
        ) : null}
      </div>
    </section>
  );
}
