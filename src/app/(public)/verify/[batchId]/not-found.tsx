import { certCopy } from '../../../../lib/certificate/copy';
import c from './certificate.module.css';
import { SiteHeader } from './SiteHeader';

// The certificate's not-found state (Design.md §18: "batch not found → plain message"; EVAL-064). One
// page for an unknown batch, a missing `h` and a wrong `h` (TP8): it names no batch and shows no data,
// so the three cases cannot be told apart.

export default function CertificateNotFound() {
  return (
    <div className={c.page}>
      <SiteHeader />
      <main className={c.wrap}>
        <section className={`${c.glass} ${c.notFound}`} aria-labelledby="nf-h" data-testid="certificate-not-found">
          <h1 id="nf-h">{certCopy.notFound.title}</h1>
          <p>{certCopy.notFound.body}</p>
          <p className={c.muted}>{certCopy.notFound.todo}</p>
        </section>
      </main>
    </div>
  );
}
