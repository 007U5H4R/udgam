// SHA-256 (FIPS 180-4) through the platform WebCrypto, plus the hex encoding of docs/proof-feed.md §3.
import { webcrypto } from 'node:crypto';

const encoder = new TextEncoder();

export function utf8(s: string): Uint8Array {
  return encoder.encode(s);
}

export async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  const bytes = typeof data === 'string' ? utf8(data) : data;
  return new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes));
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

const HEX = /^(?:[0-9a-f]{2})*$/;

/** Decodes lowercase hex; throws on anything else. */
export function fromHex(hex: string): Uint8Array {
  if (!HEX.test(hex)) throw new Error('not lowercase hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  return toHex(await sha256(data));
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
