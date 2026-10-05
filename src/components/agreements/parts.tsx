import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, NaMark } from '../admin/QueueList';
import { VerdictMark } from '../ui/VerdictChip';
import pill from '../ui/Pill.module.css';
import { formatInr, formatKg1, istDate, istDateTime12 } from '../../lib/agreements/format';
import { gradeDisplay, type Grade } from '../../lib/agreements/grades';
import { judge, type Condition, type ConditionResult } from '../../lib/agreements/settle';
import type { AgreementView, Mark, SettlementView, StatusView } from '../../lib/agreements/read';
import { t } from '../../lib/i18n';

// Server-rendered pieces of the agreement screens, ported from final/contract.html (Design.md §28.5):
// status chips and marks (word + mark + colour, never colour alone), list rows, the terms card, the
// settlement conditions (value vs threshold, Met / Not met), the released / not-released outcomes, and
// the loading, empty and error states. Every word comes from the dictionary (agreements.*).

export function StatusMark({ mark }: { mark: Mark }) {
  return mark === 'na' ? <NaMark /> : <VerdictMark kind={mark} />;
}

export function StatusChip({ status }: { status: { mark: Mark; word: string } }) {
  return (
    <span className={`vchip ${status.mark}`} data-status={status.mark}>
      <StatusMark mark={status.mark} />
      {status.word}
    </span>
  );
}

export function Brand() {
  return (
    <span className="q-brand">
      <Image src="/brand/cherry.svg" alt="" width={36} height={36} unoptimized />
      {t('app.name')}
    </span>
  );
}

const cropName = (crop: string) => t(crop === 'arabica' ? 'agreements.crop.arabica' : 'agreements.crop.robusta');

/** One agreement in a list (admin.html queue row): bubble, "AG-0007 · Hosahalli FPO", kg, facts, status. */
export function AgreementRow({ href, id, other, kg, facts, status, current }: { href: string; id: string; other: string; kg: number; facts: string; status: StatusView; current: boolean }) {
  return (
    <li>
      <Link className="q-item" href={href} aria-current={current ? 'true' : 'false'} data-agreement={id}>
        <span className={`q-bub ${status.mark === 'check' ? '' : status.mark}`}>
          <Icon name="seal" />
        </span>
        <span className="q-id">{t('agreements.row.id', { id, other })}</span>
        <span className="q-kg">{t('agreements.kg', { kg: formatKg1(kg) })}</span>
        <span className="q-when">{facts}</span>
        <span className={`q-why ${status.mark === 'check' ? '' : status.mark}`}>
          <StatusMark mark={status.mark} />
          <span>{status.word}</span>
        </span>
      </Link>
    </li>
  );
}

export function ListLoading({ label }: { label: string }) {
  return (
    <div aria-busy="true" data-state="loading">
      <p className="load-note" role="status">
        <Icon name="ring" />
        {label}
      </p>
      <ul className="q-list" aria-hidden="true">
        {[62, 58, 64].map((w) => (
          <li key={w} className="glass sk-row">
            <span className="sk" />
            <span className="sk sk-line" style={{ width: `${w}%` }} />
            <span className="sk sk-line" style={{ width: `${w - 18}%` }} />
            <span className="sk sk-line" style={{ width: `${w + 10}%` }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmptyCard({ title, body, action }: { title: ReactNode; body: string; action?: ReactNode }) {
  return (
    <div className="glass card state-card" data-state="empty">
      <div className="cherry" aria-hidden="true">
        <Image src="/brand/cherry.svg" alt="" width={112} height={112} unoptimized />
      </div>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function ErrorCard({ title, body, retryHref }: { title: string; body: string; retryHref: string }) {
  return (
    <div className="glass card state-card err" role="alert" data-state="error">
      <div className="st-ic" aria-hidden="true">
        <Icon name="wifiOff" />
      </div>
      <h2>{title}</h2>
      <p>{body}</p>
      <a className={`${pill.pill} ${pill.amber} pill-link`} href={retryHref}>
        <Icon name="retry" />
        {t('agreements.retry')}
      </a>
    </div>
  );
}

/** admin.html's detail skeleton. */
export function DetailSkeleton() {
  return (
    <section className="detail" aria-hidden="true">
      <div className="d-body">
        <div className="d-sk">
          <span className="sk m" />
          <span className="sk h" />
          <span className="sk box" />
          <span className="sk box2" />
        </div>
      </div>
    </section>
  );
}

/** The detail column before an agreement is chosen (≥ 1100 px; below that the list stands alone). */
export function PickHint({ text }: { text: string }) {
  return (
    <section className="detail" aria-label={t('agreements.details')}>
      <div className="d-body d-pick">
        <p>{text}</p>
      </div>
    </section>
  );
}

/** The detail column: a Back link (below 1100 px), the list's h1 repeated visually hidden, and the body. */
export function DetailColumn({ backHref, backLabel, listTitle, children, after }: { backHref: string; backLabel: string; listTitle: string; children: ReactNode; after?: ReactNode }) {
  return (
    <section className="detail" aria-labelledby="d-h" tabIndex={0}>
      <h1 className="vh narrow-h1">{listTitle}</h1>
      <div className="d-body">
        <Link className="back d-back" href={backHref}>
          <Icon name="arrowLeft" />
          {backLabel}
        </Link>
        {children}
      </div>
      {after}
    </section>
  );
}

export function DetailHead({ eyebrow, title, chip, meta }: { eyebrow: string; title: string; chip?: ReactNode; meta: string }) {
  return (
    <header>
      <p className="eyebrow">{eyebrow}</p>
      <div className="d-title">
        <h2 id="d-h" tabIndex={-1}>
          {title}
        </h2>
        {chip}
      </div>
      <p className="d-meta">{meta}</p>
    </header>
  );
}

export function Terms({ v, side }: { v: AgreementView; side: 'buyer' | 'fpo' }) {
  const a = v.row;
  return (
    <section className="glass card terms" aria-labelledby="t-h">
      <h3 className="sec-h" id="t-h">
        {t('agreements.terms.title')}
      </h3>
      <dl>
        <div>
          <dt>{t('agreements.terms.crop')}</dt>
          <dd>{cropName(a.crop)}</dd>
        </div>
        <div>
          <dt>{t('agreements.terms.kg')}</dt>
          <dd>{t('agreements.kg', { kg: formatKg1(a.agreedKg) })}</dd>
        </div>
        <div>
          <dt>{t('agreements.terms.minGrade')}</dt>
          <dd>{t('agreements.terms.minGradeValue', { grade: gradeDisplay(a.minGrade as Grade) })}</dd>
        </div>
        <div>
          <dt>{t('agreements.terms.amount')}</dt>
          <dd>
            {formatInr(a.amountPaise)}
            <span className="mock">{t('agreements.mock')}</span>
          </dd>
        </div>
        <div>
          <dt>{t('agreements.terms.deadline')}</dt>
          <dd>{istDate(a.deadline)}</dd>
        </div>
        <div>
          <dt>{t('agreements.terms.with')}</dt>
          <dd>{side === 'buyer' ? v.fpoName : v.buyerName}</dd>
        </div>
      </dl>
    </section>
  );
}

/** The value-vs-threshold sentence of one condition (Design.md §28.7 "Condition rows"). */
function conditionText(c: ConditionResult, agreedKg: number, short: number): ReactNode {
  if (c.condition === 'quantity') {
    return (
      <>
        <b>{c.value}</b> {t('agreements.cond.qty', { agreed: formatKg1(agreedKg) })}
        {c.met ? '' : ` ${t('agreements.cond.short', { short: formatKg1(short) })}`}
      </>
    );
  }
  if (c.condition === 'grade') {
    return c.value === 'not graded' ? (
      t('agreements.cond.notGraded', { min: c.threshold })
    ) : (
      <>
        {t('agreements.cond.graded')} <b>{c.value}</b> {t('agreements.cond.min', { min: c.threshold })}
      </>
    );
  }
  return (
    <>
      <b>{c.value}</b> {t('agreements.cond.verified')}
    </>
  );
}

const CONDITION_NAME: Record<Condition, string> = { quantity: 'agreements.cond.name.qty', grade: 'agreements.cond.name.grade', all_verified: 'agreements.cond.name.verified' };

export type ConditionFacts = { deliveredKg: number; grade: number | null; pickings: number; verifiedPickings: number };

/** The three conditions as value vs threshold: from a settlement row (what was judged) or a delivered batch (before settling). */
export function Conditions({ v, facts, pending, at }: { v: AgreementView; facts: ConditionFacts; pending: boolean; at?: string }) {
  const results = judge({ ...facts, grade: (facts.grade as Grade | null) ?? null }, v.row);
  const met = results.filter((r) => r.met).length;
  const short = Math.round((v.row.agreedKg - Math.round(facts.deliveredKg * 10) / 10) * 10) / 10;
  return (
    <section className="glass card checks-card" aria-labelledby="set-h" data-testid="conditions">
      <h3 className="sec-h" id="set-h">
        {t('agreements.cond.title')}
      </h3>
      <p className="checks-sum">
        {pending ? t('agreements.cond.before') : ''}
        {t('agreements.cond.sum', { met })}
        {at ? ` · ${t('agreements.cond.checked', { at })}` : ''}
      </p>
      <ol className="checks">
        {results.map((c) => (
          <li key={c.condition} className={`chk ${c.met ? '' : 'check'}`} data-condition={c.condition} data-met={c.met}>
            <div className="c-top">
              <span className={`c-stat ${c.met ? 'ok' : 'check'}`}>
                <VerdictMark kind={c.met ? 'ok' : 'check'} />
                {t(c.met ? 'agreements.cond.met' : 'agreements.cond.notMet')}
              </span>
              <span className="c-name">
                {t(CONDITION_NAME[c.condition] as Parameters<typeof t>[0])}
                <code>{c.condition}</code>
              </span>
            </div>
            <p className="c-ev cond-val">{conditionText(c, v.row.agreedKg, short)}</p>
          </li>
        ))}
      </ol>
      <p className="trust">
        <Icon name="seal" />
        <span>{t('agreements.trust')}</span>
      </p>
    </section>
  );
}

/** "delivered quantity (598.5 kg of 600.0 kg) and Verified pickings (13 of 14)". */
function notMetList(v: AgreementView, s: SettlementView): string {
  const parts = s.reasons.map((r) =>
    r.condition === 'quantity'
      ? t('agreements.notMet.qty', { kg: formatKg1(s.deliveredKg), agreed: formatKg1(v.row.agreedKg) })
      : r.condition === 'grade'
        ? t('agreements.notMet.grade', { grade: gradeDisplay(s.grade as Grade), min: gradeDisplay(v.row.minGrade as Grade) })
        : t('agreements.notMet.verified', { n: s.verifiedPickings, of: s.pickings }),
  );
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} ${t('agreements.and')} ${parts.at(-1)}`;
}

const shortTx = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export function OutcomeReleased({ v, s }: { v: AgreementView; s: SettlementView }) {
  return (
    <div className="glass outcome ok-o" role="status" data-outcome="released">
      <p className="o-top">
        <StatusChip status={{ mark: 'ok', word: t('agreements.status.released') }} />
      </p>
      <p className="o-amount">
        {formatInr(v.row.amountPaise)} <span className="mock">{t('agreements.mock')}</span>
      </p>
      <p>{t('agreements.released.body', { fpo: v.fpoName, when: istDateTime12(s.createdAt) })}</p>
      <p className="o-meta">
        {t('agreements.ledgerLine', { block: s.blockNumber.toLocaleString('en-IN') })} <code>{shortTx(s.txHash)}</code>
      </p>
    </div>
  );
}

export function OutcomeNotReleased({ v, s, side }: { v: AgreementView; s: SettlementView; side: 'buyer' | 'fpo' }) {
  const n = s.reasons.length;
  return (
    <div className="glass outcome check-o" role="status" data-outcome="not_released">
      <p className="o-top">
        <StatusChip status={{ mark: 'check', word: t('agreements.status.notReleased') }} />
      </p>
      <p>
        <b>{t(n === 1 ? 'agreements.notRel.one' : 'agreements.notRel.many', { n })}</b> {notMetList(v, s)}.
      </p>
      <p className="o-meta">
        {t(side === 'buyer' ? 'agreements.notRel.whereBuyer' : 'agreements.notRel.whereFpo', { amount: formatInr(v.row.amountPaise) })}{' '}
        {v.deadlinePassed ? '' : t('agreements.notRel.later', { deadline: istDate(v.row.deadline) })}
      </p>
    </div>
  );
}

export function InlineErr({ title, body }: { title: string; body: string }) {
  return (
    <div className="inline-err" role="alert" data-state="action-error">
      <Icon name="wifiOff" />
      <p>
        <b>{title}</b>
        {body}
      </p>
    </div>
  );
}
