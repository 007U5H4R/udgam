import { Icon } from '../../../components/admin/QueueList';
import pill from '../../../components/ui/Pill.module.css';
import { COPY } from '../../../lib/processing/copy';

/**
 * The list's error state: what happened, that nothing was changed, and Try again. Rendered by a page,
 * Try again reloads the list; in the error boundary, `onRetry` re-renders the failed route in place.
 */
export function ErrorCard({ onRetry }: { onRetry?: () => void } = {}) {
  return (
    <div className="glass card state-card err" role="alert">
      <div className="st-ic" aria-hidden="true">
        <Icon name="wifiOff" />
      </div>
      <h2>{COPY.errorH}</h2>
      <p>{COPY.errorP}</p>
      <a
        className={`${pill.pill} ${pill.amber} pill-link`}
        href="/processor"
        onClick={
          onRetry
            ? (e) => {
                e.preventDefault();
                onRetry();
              }
            : undefined
        }
      >
        <Icon name="retry" />
        {COPY.retry}
      </a>
    </div>
  );
}

