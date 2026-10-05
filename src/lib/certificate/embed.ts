import type { ProofFeedV1 } from '../ledger/proof';

// The proof feed as it is embedded in the certificate page (technical-plan §8.4, TSK-16.2):
// <script type="application/json" id="proof-feed">…</script>. A data block is not executed (and needs
// no CSP nonce), but its text must not be able to end the element: `</script` inside a payload string
// would close it and let the rest be parsed as markup. So `<`, `>` and `&` are written as JSON \u
// escapes, and U+2028/U+2029 too (line terminators in older JavaScript parsers). JSON.parse reads the
// escapes back to the same characters, so the browser verifies exactly the payloads that were anchored.

const ESCAPES: Record<string, string> = { '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029' };

/** JSON of `feed`, safe as the text of a <script type="application/json"> element. */
export function serializeFeedForEmbed(feed: ProofFeedV1): string {
  return JSON.stringify(feed).replace(/[<>&\u2028\u2029]/g, (c) => ESCAPES[c]!);
}

/** The id of the embedded feed element (ProofPanel reads it). */
export const FEED_ELEMENT_ID = 'proof-feed';
