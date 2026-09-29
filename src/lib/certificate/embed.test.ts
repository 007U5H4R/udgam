import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ProofFeedV1 } from '../ledger/proof';
import { serializeFeedForEmbed } from './embed';

// TSK-16.2: the embedded feed parses back to the same object and cannot close its <script> element.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FEED = JSON.parse(readFileSync(join(ROOT, 'evals/fixtures/feeds/batch-3-events.json'), 'utf8')) as ProofFeedV1;

/** A feed whose payload strings try to break out of the element. */
function hostile(): ProofFeedV1 {
  const f = structuredClone(FEED);
  const e = f.entries.find((x) => x.kind === 'attestation')!;
  e.payload.issuer = '</script><script>alert(1)</script> & <!-- \u2028\u2029 </SCRIPT >';
  return f;
}

describe('serializeFeedForEmbed (TSK-16.2)', () => {
  it('parses back to a deep-equal feed', () => {
    expect(JSON.parse(serializeFeedForEmbed(FEED))).toEqual(FEED);
    expect(JSON.parse(serializeFeedForEmbed(hostile()))).toEqual(hostile());
  });

  it('contains no </script, no < > & and no raw U+2028/U+2029', () => {
    const text = serializeFeedForEmbed(hostile());
    expect(text.toLowerCase()).not.toContain('</script');
    expect(text).not.toMatch(/[<>&\u2028\u2029]/);
    expect(text).toContain('\\u003c/script\\u003e');
  });

  it('keeps the payload bytes the verifier hashes (the escapes are JSON, not HTML)', () => {
    const f = hostile();
    const back = JSON.parse(serializeFeedForEmbed(f)) as ProofFeedV1;
    expect(back.entries.find((x) => x.kind === 'attestation')!.payload.issuer).toBe('</script><script>alert(1)</script> & <!-- \u2028\u2029 </SCRIPT >');
  });
});
