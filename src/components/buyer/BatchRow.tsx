import Link from 'next/link';
import { Icon, type IconName } from './Icon';
import s from './BatchRow.module.css';

// A batch in a list (admin batches and the buyer list): id and kilograms, one facts line, and a status
// line with its icon. A link row in the admin list grammar (TP17); the selected batch is aria-current.

export type BatchRowProps = {
  href: string;
  batchId: string;
  kg: string;
  facts: string;
  status: string;
  statusIcon: IconName;
  current?: boolean;
};

export function BatchRow({ href, batchId, kg, facts, status, statusIcon, current }: BatchRowProps) {
  return (
    <li>
      <Link className={s.row} href={href} aria-current={current ? 'page' : undefined} data-batch-id={batchId}>
        <span className={s.id}>{batchId}</span>
        <span className={s.kg}>{kg}</span>
        <span className={s.line}>{facts}</span>
        <span className={s.status}>
          <Icon name={statusIcon} />
          <span>{status}</span>
        </span>
      </Link>
    </li>
  );
}
