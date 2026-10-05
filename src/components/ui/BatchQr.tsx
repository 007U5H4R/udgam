import { certificateUrl, qrSvg } from '../../lib/certificate/qr';
import { PrintQrButton } from './PrintQrButton';
import s from './BatchQr.module.css';

// The batch's certificate QR code (TSK-16.7, TC-069) on the admin and buyer batch pages: the absolute
// certificate URL with `h`, as an inline SVG (made on the server by the qrcode package from that URL
// alone), the URL as text, and a "Print QR" action. Composed from ported parts (TP17): one frosted card.

export async function BatchQr({ batchId, shortHash }: { batchId: string; shortHash: string }) {
  const url = certificateUrl(batchId, shortHash);
  const svg = await qrSvg(url);
  return (
    <section className={s.card} aria-labelledby="qr-h" data-testid="batch-qr">
      <h2 className={s.h} id="qr-h">
        Certificate QR code
      </h2>
      <div className={s.code} role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: svg }} />
      <p className={s.url}>{url}</p>
      <PrintQrButton svg={svg} url={url} label="Print QR" />
    </section>
  );
}
