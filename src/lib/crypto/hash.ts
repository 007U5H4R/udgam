const HEX = /^(?:[0-9a-fA-F]{2})*$/;

/** Lowercase hex of bytes. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/** Bytes of an even-length hex string (either case). Throws TypeError on anything else. */
export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (!HEX.test(hex)) throw new TypeError('hexToBytes: not an even-length hex string');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** An ArrayBuffer-backed view (no copy when it already is one), which WebCrypto's BufferSource requires. */
export function toArrayBufferView(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : new Uint8Array(bytes);
}

/** UTF-8 bytes of a string. */
export function utf8(s: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(s);
}

/** Raw SHA-256 bytes via WebCrypto (browser and Node). Strings are hashed as UTF-8. */
export async function sha256Bytes(input: Uint8Array | string): Promise<Uint8Array<ArrayBuffer>> {
  const data = typeof input === 'string' ? utf8(input) : toArrayBufferView(input);
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data));
}

/** Lowercase hex SHA-256. Strings are hashed as UTF-8. */
export async function sha256Hex(input: Uint8Array | string): Promise<string> {
  return bytesToHex(await sha256Bytes(input));
}
