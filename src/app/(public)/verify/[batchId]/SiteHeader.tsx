import { CertIcon } from '../../../../components/ui/CertIcon';
import { certCopy } from '../../../../lib/certificate/copy';
import c from './certificate.module.css';

// The certificate's site header (verify.html `header.site`): the wordmark with the cherry, a link to `/`
// (DES-220), and the "Public certificate" kind chip. Shared by the page and its not-found state.
export function SiteHeader() {
  return (
    <div className={c.wrap}>
      <header className={c.site}>
        {/* DES-220: the wordmark leads home. A plain link, so the next page loads as its own document with
            its own Content-Security-Policy (as sign-in does, TASK-20 fix round 2). */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load on purpose (see above) */}
        <a className={c.wordmark} href="/">
          {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG; next/image adds nothing here */}
          <img src="/brand/cherry.svg" alt="" width={38} height={38} />
          Udgam
        </a>
        <span className={c.kind} data-kind-chip>
          <CertIcon name="seal" className={c.ic} />
          {certCopy.kind}
        </span>
      </header>
    </div>
  );
}
