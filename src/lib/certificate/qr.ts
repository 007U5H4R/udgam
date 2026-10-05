import QRCode from 'qrcode';
import { env } from '../config/env';

// The certificate link and its QR code (TSK-16.7, TC-069, Solution-PRD §5.4): the absolute URL
// `${PUBLIC_BASE_URL}/verify/<batchId>?h=<shortHash>`, printed on the batch's paperwork. Error correction M
// (15 %) and the standard quiet zone of 4 modules. Server-only (reads env for the base URL).

const OPTIONS = { errorCorrectionLevel: 'M', margin: 4 } as const;

/** The absolute certificate URL of a batch; the batch id is path-encoded, `h` is its 12-hex short hash. */
export function certificateUrl(batchId: string, shortHash: string, base: string = env.PUBLIC_BASE_URL): string {
  return `${base.replace(/\/+$/, '')}/verify/${encodeURIComponent(batchId)}?h=${encodeURIComponent(shortHash)}`;
}

/** The QR code of `url` as an SVG document string (dark modules on a light ground, scalable). */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...OPTIONS, type: 'svg', color: { dark: '#0A0E0C', light: '#FFFFFF' } });
}

/** The QR code of `url` as a PNG (8 px per module). */
export function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...OPTIONS, type: 'png', scale: 8 });
}
