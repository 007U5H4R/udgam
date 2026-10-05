import { CertIcon } from '../../../../components/ui/CertIcon';
import { certCopy } from '../../../../lib/certificate/copy';
import c from './certificate.module.css';

// The certificate's site header (verify.html `header.site`): the wordmark with the cherry and the
// "Public certificate" kind chip. Shared by the page and its not-found state.
export function SiteHeader() {
  return (
    <div className={c.wrap}>
      <header className={c.site}>
        <span className={c.wordmark}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a small static SVG; next/image adds nothing here */}
          <img src="/brand/cherry.svg" alt="" width={38} height={38} />
          Udgam
        </span>
        <span className={c.kind}>
          <CertIcon name="seal" className={c.ic} />
          {certCopy.kind}
        </span>
      </header>
    </div>
  );
}
