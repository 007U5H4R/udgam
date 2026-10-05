import { Icon } from '../../../components/admin/QueueList';
import pill from '../../../components/ui/Pill.module.css';
import { COPY } from '../../../lib/processing/copy';

/** The list's error state: what happened, that nothing was changed, and Try again (reloads the list). */
export function ErrorCard() {
  return (
    <div className="glass card state-card err" role="alert">
      <div className="st-ic" aria-hidden="true">
        <Icon name="wifiOff" />
      </div>
      <h2>{COPY.errorH}</h2>
      <p>{COPY.errorP}</p>
      <a className={`${pill.pill} ${pill.amber} pill-link`} href="/processor">
        <Icon name="retry" />
        {COPY.retry}
      </a>
    </div>
  );
}

