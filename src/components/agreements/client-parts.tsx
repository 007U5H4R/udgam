'use client';

import { Icon } from '../admin/QueueList';
import { VerdictMark } from '../ui/VerdictChip';

// Small pieces shared by the agreement forms (client side): the inline action error and the field-check
// line (Design.md §28.7: word + mark + colour under the field; `id` is what aria-describedby names).

export function InlineErrView({ title, body }: { title: string; body: string }) {
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

export function FieldCheck({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="f-err" id={id}>
      <VerdictMark kind="check" />
      <span>{message}</span>
    </p>
  );
}

/** aria-describedby: the message first, then the hint (Design.md §28.7). */
export const describedBy = (id: string, err: boolean, hint: boolean): string | undefined => [err ? `${id}-e` : '', hint ? `${id}-h` : ''].filter(Boolean).join(' ') || undefined;
