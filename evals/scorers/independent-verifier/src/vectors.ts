// The shared crypto vectors (evals/fixtures/crypto-vectors.json) checked with this folder's own code:
// JCS text and SHA-256 per `jcs` vector, the RFC 7638 thumbprint and every ES256 signature.
import { sha256Hex, utf8 } from './hash';
import { jcs } from './jcs';
import { importP256, jwkThumbprint, verifyEs256 } from './signature';

export type VectorsResult = { ok: boolean; total: number; failed: string[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export async function checkCryptoVectors(doc: unknown): Promise<VectorsResult> {
  if (!isObj(doc) || !Array.isArray(doc.jcs) || !isObj(doc.ecdsa) || !Array.isArray(doc.ecdsa.signatures) || !isObj(doc.ecdsa.publicJwk)) {
    return { ok: false, total: 0, failed: ['vectors document'] };
  }
  const failed: string[] = [];
  let total = 0;
  for (const v of doc.jcs as unknown[]) {
    total++;
    const o = isObj(v) ? v : {};
    try {
      const canonical = jcs(JSON.parse(str(o.input)));
      if (canonical !== o.canonical || (await sha256Hex(canonical)) !== o.sha256) failed.push(`jcs ${str(o.name)}`);
    } catch {
      failed.push(`jcs ${str(o.name)}`);
    }
  }
  const jwk = doc.ecdsa.publicJwk as Obj;
  const x = str(jwk.x);
  const y = str(jwk.y);
  let key: Awaited<ReturnType<typeof importP256>> | null = null;
  try {
    key = await importP256({ x, y });
  } catch {
    key = null;
  }
  for (const s of doc.ecdsa.signatures as unknown[]) {
    total++;
    const o = isObj(s) ? s : {};
    const ok = key !== null && (await verifyEs256(key, str(o.signature), utf8(str(o.message))));
    if (!ok) failed.push(`ecdsa ${str(o.name)}`);
  }
  total++;
  const thumbprint = isObj(doc.ecdsa.thumbprint) ? doc.ecdsa.thumbprint.sha256B64u : undefined;
  if ((await jwkThumbprint({ x, y }).catch(() => null)) !== thumbprint) failed.push('thumbprint');
  return { ok: failed.length === 0, total, failed };
}
