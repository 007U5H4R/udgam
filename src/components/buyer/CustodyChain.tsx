import { Icon } from './Icon';
import s from './BatchScreen.module.css';

// A batch's custody chain, oldest first: who held it, who received it, and when (TC-060). Each link was
// signed by the server on behalf of the transferring admin and anchored in the ledger.

export type CustodyChainLink = { label: string; when: string };

export function CustodyChain({ heading, links, headingId }: { heading: string; links: CustodyChainLink[]; headingId: string }) {
  return (
    <section aria-labelledby={headingId}>
      <h2 className={s.secH} id={headingId}>
        {heading}
      </h2>
      <ol className={s.rows}>
        {links.map((l) => (
          <li className={s.fieldRow} key={`${l.label}|${l.when}`}>
            <b>{l.label}</b>
            <span className={s.meta}>{l.when}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The lock line under a transferred batch's custody chain. */
export function LockedLine({ text }: { text: string }) {
  return (
    <p className={s.decNote}>
      <Icon name="lock" />
      <span>{text}</span>
    </p>
  );
}
