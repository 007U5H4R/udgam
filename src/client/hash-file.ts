import { bytesToHex } from '../lib/crypto';
import { sniffImage } from '../lib/media/sniff';

// Hash one photo as soon as the farmer accepts it (technical-plan §9, TSK-10.7): SHA-256 over the
// file's original bytes (S1), its size, and its type from the magic bytes — JPEG or HEIC as the server's
// boundary reads them (lib/media/sniff), PNG, else the type the browser declared.

const isPng = (b: Uint8Array) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;

export async function hashFile(file: Blob): Promise<{ sha256: string; size: number; mime: string }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', buffer));
  const mime = sniffImage(bytes) ?? (isPng(bytes) ? 'image/png' : file.type || 'application/octet-stream');
  return { sha256: bytesToHex(digest), size: bytes.length, mime };
}
