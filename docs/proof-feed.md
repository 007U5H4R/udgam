# Udgam proof feed, version 1 (`udgam-proof-feed/1`)

This document specifies the proof feed that Udgam publishes for every coffee batch, and the exact
checks that verify it. It is written so that someone who has never seen the Udgam source code can
write an independent verifier from this page and the vectors file alone. Every byte-level rule is
here. If something you need is missing, that is a defect in this document.

Keywords MUST, MUST NOT and SHOULD are used as in RFC 2119.

## 1. Purpose and trust anchor

Udgam records provenance facts (a plot was registered, a phone was enrolled, a picking was captured
and verified, a batch was created and handed over) as entries in an append-only hash-chained ledger.
Ranges of entries are sealed under **checkpoints**: the root of an RFC 6962 Merkle tree over those
entries, signed with the server's **ledger key**.

The proof feed of a batch contains every ledger entry in that batch's provenance closure (§9), each
with a Merkle inclusion path to a signed checkpoint. A verifier recomputes every hash, every path and
every signature itself.

**What a successful verification proves.** The entries in the feed are exactly the ones that were
checkpointed under the published ledger key, unchanged since then, and the feed contains every entry
the batch's own records say it must.

**What it does not prove.** The verifier trusts the key published at
`/.well-known/udgam-ledger-key` on the same server. A server operator who replaces both the records
and that key can produce a feed that verifies. Key pinning and transparency logs are future work. The
feed also cannot prove that a physical fact (a weight, a GPS fix) was true; it proves what was
recorded and that it was not altered.

## 2. Fetching the feed and the key

**Feed.** `GET {origin}/api/verify/{batchId}?h={shortHash}`

- `batchId` is the batch identifier, for example `B-7K2M9Q4D`.
- `h` is the batch's 12-character short hash, printed in the certificate link and QR code.
- `200` with `Content-Type: application/json` and the feed (§4). `Cache-Control: no-store`.
- `404` with the body `{"error":"not_found"}`, byte for byte, for an unknown batch, a missing `h` or
  a wrong `h`. The three cases are indistinguishable by design.
- `503` with `{"error":"unavailable"}` when the server cannot build the feed.

Before responding, the server creates a new checkpoint if any entry of the batch is not yet under one,
so every entry in a `200` response has a checkpoint.

The public certificate page `/verify/{batchId}?h=…` embeds the same feed as
`<script type="application/json" id="proof-feed">…</script>`.

**Key.** `GET {origin}/.well-known/udgam-ledger-key` returns `200` `application/json`:

```json
{ "keys": [ { "kty": "EC", "crv": "P-256", "x": "<base64url>", "y": "<base64url>", "kid": "<base64url>", "use": "sig", "alg": "ES256" } ] }
```

There is no private member (`d`). Verifiers MUST take keys from this document, never from the feed.
The feed's `ledgerKey.kid` is only a hint for display.

## 3. Encodings

- **Text** is UTF-8.
- **hex** is lowercase hexadecimal, two characters per byte. SHA-256 values are 64 hex characters.
- **base64url** is RFC 4648 §5 (alphabet `A–Z a–z 0–9 - _`) **without padding**. Decoders MUST
  reject `=`, characters outside the alphabet, a length of 1 mod 4, and non-zero unused trailing bits
  (so each byte string has exactly one encoding).
- **SHA-256(x)** is the FIPS 180-4 digest of the bytes `x`. When `x` is a string, its UTF-8 bytes.
- **Timestamps** (`ts`) are ISO-8601 UTC strings with milliseconds, for example
  `2026-10-01T04:12:33.120Z`. Verifiers treat them as opaque strings: they are hashed, not parsed.

### 3.1 Canonical JSON (RFC 8785, "JCS")

Every hash and signature in this format is over the JCS serialisation of a JSON value. JCS is:

1. **No whitespace** between tokens.
2. **Objects:** members sorted by key, comparing keys as sequences of **UTF-16 code units**
   (not code points, not UTF-8 bytes). Keys are serialised as strings (rule 4). Duplicate keys do not
   occur.
3. **Arrays:** elements in their original order.
4. **Strings:** `"`, then each character literally, except: `"` → `\"`, `\` → `\\`, U+0008 → `\b`,
   U+0009 → `\t`, U+000A → `\n`, U+000C → `\f`, U+000D → `\r`, and every other code point below
   U+0020 → `\u00XX` with **lowercase** hex. Everything else, including non-ASCII letters, emoji,
   `/`, U+2028 and U+2029, is written literally (as UTF-8 in the byte form). A lone surrogate is
   invalid.
5. **Numbers:** IEEE-754 doubles, written exactly as ECMAScript `Number.prototype.toString` does:
   the shortest decimal that round-trips; integers with magnitude below 10^21 without a decimal point
   or exponent (`100`, not `1e2` or `100.0`); `-0` is written `0`; magnitudes at or above 10^21 or
   below 10^-6 use exponent form with a sign (`1e+21`, `1e-7`); `0.1` stays `0.1`. NaN and
   Infinity are invalid.
6. **Literals:** `true`, `false`, `null`.

Test vectors for these rules (key ordering, Unicode, `1e21`, `-0`, `0.1`, escapes) are in
`evals/fixtures/crypto-vectors.json` under `jcs`: each has `input` (JSON text), `canonical` and its
`sha256`.

Every payload in a feed was produced by JSON-parsing canonical text, so re-canonicalising a parsed
payload reproduces the original bytes. A verifier MUST hash the JCS of the payload **as received**;
it MUST NOT hash any other serialisation.

## 4. The feed

### Feed example

```json
{
  "format": "udgam-proof-feed/1",
  "batchId": "B-7K2M9Q4D",
  "shortHash": "3f9a1c0b7e2d",                       // first 12 hex of the batch_created entryHash
  "ledgerKey": { "kid": "IA8g2S2MPQfCTQldg3nIJBEYBB9yc6nBueOWrDqZDGY", "url": "/.well-known/udgam-ledger-key" },
  "checkpoints": [
    { "id": 7, "fromSeq": 601, "toSeq": 700,
      "merkleRoot": "d4631e0b106d12cf097701c524f177618ea00082a72bc020b31fbb951a354c5f",
      "prevCheckpointHash": "6b94f735e98291964dc4df2b058d64b37f3be955745f39be13e93e795650dc82",
      "ts": "2026-10-01T04:13:00.000Z",
      "kid": "IA8g2S2MPQfCTQldg3nIJBEYBB9yc6nBueOWrDqZDGY",
      "signature": "sea8LpbXuoPX8hgaI8Avd7xCzhqij3GdKEZP-iZVoSJw_101waDoc5AAtaEpf4yDKzwRAOImFe6xVzJSKlJdSA" }
  ],
  "entries": [
    { "seq": 612,
      "prevHash": "b4e299117ad6feb963766ee97362e361a5b8936e5990b9b156a2473b4d84404c",
      "kind": "harvest_event",
      "payload": { "eventId": "HE-D1TV28AH7F5N", "plotId": "PL-1KGSD77M" },
      "payloadHash": "6d8c743297912ea993c6680f01d09c8e790a4764246c15832dee301b8f5bef32",
      "ts": "2026-10-01T04:12:34.000Z",
      "entryHash": "3c139a40a7e3be469f4abc3625985cc3530080d4f40cef1a27751c7539392819",
      "checkpointId": 7,
      "leafIndex": 11,
      "path": [ "db285e8e0ef0c55784e8d85a5cbf4a6e6959a7542c3aea3a1609284403bc2838",
                "cef3f98bb51def9a77aebfb0b5ed644bd23ab30e33feb02c1eb9e0bc1ee57d31" ] }
  ]
}
```

(The comment is not part of the format. Values are illustrative and the payload is shortened; `docs/proof-feed.vectors.json` has a complete feed that verifies.)

### 4.1 Top-level members

| Member | Type | Meaning |
|---|---|---|
| `format` | string | Exactly `udgam-proof-feed/1`. |
| `batchId` | string | The batch this feed proves. |
| `shortHash` | string, 12 lowercase hex | The first 12 characters of the `entryHash` of this batch's `batch_created` entry (§8). |
| `ledgerKey` | object | `{ kid, url }`: the kid of the server's current ledger key and the path of the key document. A hint only. |
| `checkpoints` | array | The checkpoints that seal the entries below (only those; not the whole ledger's). |
| `entries` | array | The batch's closure entries, sorted by `seq`, strictly ascending. |

### 4.2 A checkpoint

| Member | Type | Meaning |
|---|---|---|
| `id` | integer ≥ 1 | Checkpoint number. The ledger's checkpoints are numbered 1, 2, 3, … |
| `fromSeq`, `toSeq` | integers ≥ 1, `fromSeq ≤ toSeq` | The contiguous range of ledger entries this checkpoint seals. |
| `merkleRoot` | hex (64) | RFC 6962 root over the entries `fromSeq..toSeq` (§6). |
| `prevCheckpointHash` | hex (64) | SHA-256 of the previous checkpoint's statement (§7); 64 zeros for checkpoint 1. |
| `ts` | string | When the checkpoint was made. |
| `kid` | string | The kid of the ledger key that signed it (§7.2). |
| `signature` | base64url | ECDSA signature over the statement (§7.1). |

### 4.3 An entry

| Member | Type | Meaning |
|---|---|---|
| `seq` | integer ≥ 1 | Position in the ledger. The ledger's first entry has `seq` 1. |
| `prevHash` | hex (64) | `entryHash` of entry `seq − 1` (64 zeros for `seq` 1). Covered by `entryHash`; the feed is a subset of the ledger, so verifiers do not check the link itself. |
| `kind` | string | What the entry records (§9.1). |
| `payload` | object | The recorded facts. Public-safe: IDs, hashes, numbers, `producerId`; never names or phone numbers. |
| `payloadHash` | hex (64) | `SHA-256(JCS(payload))` (§5). |
| `ts` | string | When the entry was appended. |
| `entryHash` | hex (64) | §5. |
| `checkpointId` | integer | The `id` of the checkpoint in this feed that seals the entry. |
| `leafIndex` | integer ≥ 0 | `seq − fromSeq` of that checkpoint. |
| `path` | array of hex (64) | The Merkle audit path from the entry's leaf to the checkpoint root, leaf end first (§6.2). Empty for a one-entry checkpoint. |

Verifiers MUST ignore members they do not know, at every level. Later versions add optional fields
without changing the format name (for example per-entry `evm` anchoring data in milestone 2).

## 5. Entry hashes

```
payloadHash = hex(SHA-256(JCS(payload)))
entryHash   = hex(SHA-256(JCS({ "seq": seq, "prev_hash": prevHash, "kind": kind,
                               "payload_hash": payloadHash, "ts": ts })))
```

Note the **snake_case** keys inside the entry-hash object. After JCS ordering, the hashed text is:

```
{"kind":"harvest_event","payload_hash":"<64 hex>","prev_hash":"<64 hex>","seq":612,"ts":"2026-10-01T04:12:34.000Z"}
```

`seq` is a JSON number; the others are strings.

## 6. Merkle trees (RFC 6962 §2.1)

### 6.1 Tree hash

The leaves of checkpoint `c` are the entries `c.fromSeq, c.fromSeq+1, …, c.toSeq` in that order. The
**leaf data** of an entry is the 32 raw bytes of its `entryHash` (hex-decoded, not the hex text).
With `n = c.toSeq − c.fromSeq + 1` leaves `D[0..n-1]`:

```
MTH([])      = SHA-256()                                  (empty input; not used by feeds)
MTH([d])     = SHA-256(0x00 ‖ d)                          leaf hash
MTH(D[0:n])  = SHA-256(0x01 ‖ MTH(D[0:k]) ‖ MTH(D[k:n]))  for n > 1, where k is the largest
                                                          power of two strictly less than n
```

`‖` is byte concatenation, `0x00` and `0x01` are single bytes. Odd nodes are never duplicated.
`merkleRoot = hex(MTH(D[0:n]))`.

### 6.2 Audit path and inclusion check (RFC 9162 §2.1.3.2)

An entry's `leafIndex` is `seq − c.fromSeq`, and its `path` is RFC 6962's `PATH(leafIndex, D[0:n])`:
the sibling hashes from the bottom of the tree to the top. To recompute the root from an entry:

```
function rootFromPath(entryHashBytes, leafIndex, n, path):
    if leafIndex >= n: FAIL
    fn = leafIndex
    sn = n - 1
    r  = SHA-256(0x00 ‖ entryHashBytes)
    for each p in path (in order, p = hex-decoded 32 bytes):
        if sn == 0: FAIL
        if (fn is odd) or (fn == sn):
            r = SHA-256(0x01 ‖ p ‖ r)
            if fn is even:
                while (fn is even) and (fn != 0):
                    fn = fn >> 1
                    sn = sn >> 1
        else:
            r = SHA-256(0x01 ‖ r ‖ p)
        fn = fn >> 1
        sn = sn >> 1
    if sn != 0: FAIL
    return r
```

The entry is included when `hex(rootFromPath(bytes(entryHash), leafIndex, n, path)) == merkleRoot`
of its checkpoint, with `n = toSeq − fromSeq + 1`.

## 7. Checkpoints

### 7.1 Statement and signature

The ledger key signs the **statement** of a checkpoint:

```
statement = JCS({ "v": 1, "id": id, "fromSeq": fromSeq, "toSeq": toSeq,
                  "merkleRoot": merkleRoot, "prevCheckpointHash": prevCheckpointHash, "ts": ts })
```

After JCS ordering the members appear as `fromSeq, id, merkleRoot, prevCheckpointHash, toSeq, ts, v`:

```
{"fromSeq":601,"id":7,"merkleRoot":"<64 hex>","prevCheckpointHash":"<64 hex>","toSeq":700,"ts":"2026-10-01T04:13:00.000Z","v":1}
```

`signature` is ECDSA over the curve P-256 (secp256r1) with SHA-256 over the UTF-8 bytes of the
statement (JOSE `ES256`), encoded as the 64-byte IEEE P1363 form `r ‖ s` (each 32 bytes, big-endian,
left-padded with zeros), then base64url (86 characters). It is **not** DER. WebCrypto's
`crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signatureBytes, statementBytes)` takes
exactly this form.

`prevCheckpointHash` of checkpoint `i` is `hex(SHA-256(statement of checkpoint i−1))`, and 64 zeros
for checkpoint 1. A feed carries only the checkpoints its entries need, so feed verifiers do not
check this link; it matters to anyone auditing the whole ledger.

### 7.2 Keys and kid

A key is a JWK (RFC 7517) for P-256: `{"kty":"EC","crv":"P-256","x":…,"y":…}` with `x` and `y`
the 32-byte coordinates in base64url. Its **kid** is the RFC 7638 thumbprint:

```
kid = base64url(SHA-256(UTF-8('{"crv":"P-256","kty":"EC","x":"<x>","y":"<y>"}')))
```

(the four required members, in that order, no whitespace; this equals their JCS form). A verifier
MUST recompute the thumbprint of a published key and use that key only for checkpoints whose `kid`
equals it.

## 8. Short hash

The feed contains exactly one entry with `kind` `batch_created` whose `payload.batchId` equals the
feed's `batchId`. `shortHash` MUST equal the first 12 characters of that entry's `entryHash`. The
certificate link carries it as `h`, which ties the printed QR code to the anchored batch.

## 9. The provenance closure

### 9.1 What the feed contains

The feed of batch `B` contains, from the ledger (evaluation-plan §4.6):

- the `batch_created` entry of `B`, and every `custody_transfer` entry whose `payload.batchId` is `B`;
- for each member event listed in `batch_created.payload.events[].eventId`: its `harvest_event`
  entry, every `verification_run` entry and every `admin_override` entry whose `payload.eventId` is
  that event;
- for each plot named by those `harvest_event` payloads (`payload.plotId`): its `plot_registered`,
  `plot_edited` and `attestation` entries (by `payload.plotId`);
- for each device named by those payloads (`payload.deviceId`): its `device_enrolled` and
  `device_revoked` entries (by `payload.deviceId`).

Payload members a verifier relies on (all others are informational and covered by the hashes):

| Kind | Members used |
|---|---|
| `batch_created` | `batchId`, `orgId`, `events` (array of `{ eventId, payloadHash }`), `kid`, `publicJwk`, `signature` |
| `custody_transfer` | `batchId`, `fromOrg`, `toOrg`, `kid`, `publicJwk`, `signature` |
| `admin_override` | `eventId`, `kid`, `publicJwk`, `signature` |
| `harvest_event` | `eventId` |
| `verification_run` | `eventId` |

For display: `harvest_event.payload.capture` is the exact object the phone signed (weight in
`capture.cherryKg`), `verification_run.payload` carries `verdict`, `score` and the `checks` with their
evidence sentences, `plot_registered`/`plot_edited` carry `producerId`, `crop`, `areaHa` and the
GeoJSON `polygon`, and `attestation` carries `issuer`, `validFrom`, `validTo` and the certificate
`fileHash`.

### 9.2 Signed payloads

Payloads of kind `batch_created`, `custody_transfer` and `admin_override` are statements signed with a
per-admin key that the server holds on the admin's behalf. They carry three extra members:
`kid`, `publicJwk` and `signature`. The signed **statement** is the payload without those three
members:

```
statement = JCS(payload minus the members "kid", "publicJwk" and "signature")
```

The signature is ES256 over the statement's UTF-8 bytes, P1363 `r ‖ s`, base64url (as §7.1), and
verifies with `publicJwk`; `kid` MUST equal the RFC 7638 thumbprint of `publicJwk` (§7.2). These keys
attest which admin account made the decision; they are not published at a well-known URL, and their
integrity comes from the ledger (the payload is under a signed checkpoint).

### 9.3 Completeness

Let `b` be the batch's `batch_created` entry. The feed is complete when:

1. `b.payload.events` is a non-empty array, and for every element `ev`: the feed has a
   `harvest_event` entry with `payload.eventId == ev.eventId` **and** at least one
   `verification_run` entry with `payload.eventId == ev.eventId`;
2. the `custody_transfer` entries, taken in `seq` order, all have `seq > b.seq` and
   `payload.batchId == batchId`, the first has `payload.fromOrg == b.payload.orgId`, and each later one
   has `payload.fromOrg ==` the previous one's `payload.toOrg`.

Removing any member event's `harvest_event` or all of its runs is therefore detected even though the
removed entries' hashes are simply absent.

## 10. Verification steps

Run the steps in this order and stop at the first failure. Report the step name and, where given, the
`seq` or checkpoint `id`. The names are part of this format: the certificate page and the independent
checker show them.

| # | Step name | Check | Fails when |
|---|---|---|---|
| 1 | `format` | The document is JSON with the members of §4 and their types; `format == "udgam-proof-feed/1"`; hex members are lowercase hex of the stated length; `signature` members are base64url; `shortHash` is 12 lowercase hex; entries have strictly ascending `seq`; checkpoint `id`s are unique; every checkpoint has `fromSeq ≤ toSeq`. | anything malformed |
| 2 | `unknown-key` | For each checkpoint in feed order: a published key has `kid ==` the checkpoint's `kid`, and that key's recomputed thumbprint equals it. | no such key (report the `kid`) |
| 3 | `checkpoint-signature` | The checkpoint's signature verifies over its statement (§7.1) with that key. | the signature does not verify |
| 4 | `payload-hash` | For each entry in `seq` order: `hex(SHA-256(JCS(payload))) == payloadHash`. | mismatch, or the payload cannot be canonicalised |
| 5 | `entry-hash` | `entryHash` recomputes (§5). | mismatch |
| 6 | `merkle-path` | The feed has a checkpoint with `id == checkpointId`; `fromSeq ≤ seq ≤ toSeq`; `leafIndex == seq − fromSeq`; the root from `path` (§6.2) equals its `merkleRoot`. | any of these fails, including a path of the wrong length |
| 7 | `payload-signature` | For the kinds of §9.2 only: the payload's own signature verifies. | missing members, wrong kid, or a bad signature |
| 8 | `short-hash` | §8. (If there is not exactly one `batch_created` entry for `batchId`, report `closure-incomplete`.) | mismatch |
| 9 | `closure-incomplete` | §9.3. | an event, its run, or a custody link is missing |

Steps 2–3 run for every checkpoint before steps 4–7 run for any entry. Steps 4–7 run for one entry
before moving to the next.

On success report `ok` with the number of entries verified. **Coverage** is entries verified ÷ entries
in the feed; a successful run verifies all of them.

What each step catches (and the vector that shows it):

| Forgery | Caught at |
|---|---|
| A payload field changed (e.g. `cherryKg`) | `payload-hash` (`entry_payload`) |
| An entry's `ts`, `kind` or `seq` changed | `entry-hash` (`entry_field`) |
| A Merkle sibling changed | `merkle-path` (`merkle_sibling`) |
| A checkpoint signature changed | `checkpoint-signature` (`checkpoint_signature`) |
| Checkpoints re-signed with a key that is not published | `unknown-key` (`signing_key`) |
| Two entries swapped, with every hash recomputed by the forger | `merkle-path` (`swap_adjacent`) |
| A member event's entry removed | `closure-incomplete` (`drop_entry`) |
| The link's short hash does not match the batch | `short-hash` (`short_hash`) |

## 11. Test vectors: `docs/proof-feed.vectors.json`

Generated from a real (temporary) ledger by `pnpm tsx scripts/proof-vectors.ts`; the key in it is a
throwaway whose private half was never saved. Members:

- `format`: `udgam-proof-feed/1`.
- `keys`: a key document exactly as served at `/.well-known/udgam-ledger-key`.
- `feed`: an intact feed. Its 16 entries straddle two checkpoints (1–100, an automatic one, and
  101–108, made on demand), so it exercises paths under a 100-leaf tree and an 8-leaf tree.
- `expected`: the result of verifying `feed` with `keys` (`ok`, entry count, checkpoints).
- `example`: every intermediate value for one entry, checkpoint, key and signed payload:
  `entry.payloadJcs` and `payloadHash`; `entry.entryHashInput` (the JCS text of §5) and `entryHash`;
  `entry.leafHash` (`SHA-256(0x00 ‖ entryHash bytes)`), `treeSize`, `leafIndex`, `path`, `merkleRoot`;
  `checkpoint.statement`, `statementSha256` (what the next checkpoint's `prevCheckpointHash` would be)
  and `signature`; `key.thumbprintInput` and `kid`; `signedPayload.statement` and `signature`.
- `tampers`: one object per forgery, `{ variant, description, expectedStep, feed }`. Verify each `feed`
  with the same `keys`; it MUST fail at `expectedStep`.

A verifier is correct for these vectors when it accepts `feed` (with the `expected` entry count) and
rejects every tamper at its `expectedStep`.

## 12. Reference

- RFC 8785, JSON Canonicalization Scheme.
- RFC 6962 §2.1 (Merkle hash trees) and RFC 9162 §2.1.3.2 (verifying an inclusion proof).
- RFC 7517 (JWK), RFC 7518 §3.4 (ES256), RFC 7638 (JWK thumbprint), RFC 4648 §5 (base64url).
- Server implementation: `src/lib/ledger/{proof,merkle,checkpoint,feed,closure}.ts`. An independent
  verifier MUST NOT be written from it; this document is the specification.
