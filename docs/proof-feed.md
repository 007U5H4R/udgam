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
checkpointed under the published ledger key, unchanged since then, and the feed contains the entries
that the anchored payloads themselves make derivable (§9.3): the batch, each listed member event with
the payload hash the batch lists for it and at least one verification run, the registration of each
member event's plot and the enrolment of its device, and a custody chain that starts at the batch's
organisation.

**What completeness cannot detect.** Nothing in the anchored payloads says how many of these exist,
so a feed that leaves them out still verifies: a `device_revoked`, `plot_edited`, `attestation` or
`admin_override` entry; verification runs of a member event beyond the first one present; and
custody transfers after the last one present (a trailing transfer). The certificate page shows what
the feed contains; it cannot show what a server withheld.

**What it does not prove.** The verifier trusts the key published at
`/.well-known/udgam-ledger-key` on the same server. A server operator who replaces both the records
and that key can produce a feed that verifies. Key pinning and transparency logs are future work. The
feed also cannot prove that a physical fact (a weight, a GPS fix) was true; it proves what was
recorded and that it was not altered. The phone's own signature over a capture
(`harvest_event.payload.capture`, `payload.signature`) is checked by the server when the capture
arrives; feed verifiers do not check it, and the format does not rely on a device's public key.

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

There is no private member (`d`). Verifiers MUST take keys from this document, fetched from the fixed
path `/.well-known/udgam-ledger-key` of the origin they trust, never from the feed. The feed's
`ledgerKey` (`kid` and `url`) is informational, for display only: it is not checked, and a verifier
MUST NOT fetch keys from `ledgerKey.url`.

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
payload reproduces the original bytes. A verifier MUST hash the JCS of the payload **as received**:
every member the JSON text gives the payload object, exactly as the parser returned it. It MUST NOT
hash any other serialisation, and MUST NOT hash a copy made by a schema or model layer that may drop,
rename or reinterpret members. Whatever is displayed MUST be exactly what was hashed.

**Forbidden keys.** No object anywhere in a feed (top level, checkpoints, entries, payloads at any
depth) may have a member named `__proto__`, `constructor` or `prototype`. JavaScript parsers turn
`"__proto__"` into an ordinary own member, but many object-handling layers silently drop it or treat
it as the prototype, so a member could be shown or ignored without having been hashed. A feed with
such a key fails at step `format` (§10), before any hash is computed. Udgam never writes these keys.
The `payload_proto_member` vector (§11) is a feed with an own `"__proto__"` member in a payload; read
the vectors file with a parser that keeps it as an ordinary member (`JSON.parse` does).

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
| `batchId` | string, non-empty | The batch this feed proves. |
| `shortHash` | string, 12 lowercase hex | The first 12 characters of the `entryHash` of this batch's `batch_created` entry (§8). |
| `ledgerKey` | object | `{ kid, url }`, both non-empty strings: the kid of the server's current ledger key and the path of the key document. Informational only: the values are never compared or fetched (§2), but a missing `ledgerKey`, or one whose `kid` or `url` is not a non-empty string, fails step `format`. |
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
| `kid` | string, non-empty | The kid of the ledger key that signed it (§7.2). |
| `signature` | base64url | ECDSA signature over the statement (§7.1). Step `format` checks only that it is a non-empty string of base64url alphabet characters; strict decoding (§3) and the 64-byte length belong to step `checkpoint-signature`. |

### 4.3 An entry

| Member | Type | Meaning |
|---|---|---|
| `seq` | integer ≥ 1 | Position in the ledger. The ledger's first entry has `seq` 1. |
| `prevHash` | hex (64) | `entryHash` of entry `seq − 1` (64 zeros for `seq` 1). Covered by `entryHash`; the feed is a subset of the ledger, so verifiers do not check the link itself. |
| `kind` | string, non-empty | What the entry records (§9.1). |
| `payload` | object | The recorded facts. Public-safe: IDs, hashes, numbers, `producerId`; never names or phone numbers. |
| `payloadHash` | hex (64) | `SHA-256(JCS(payload))` (§5). |
| `ts` | string | When the entry was appended. |
| `entryHash` | hex (64) | §5. |
| `checkpointId` | integer ≥ 1 | The `id` of the checkpoint in this feed that seals the entry. |
| `leafIndex` | integer ≥ 0 | `seq − fromSeq` of that checkpoint. |
| `path` | array of hex (64) | The Merkle audit path from the entry's leaf to the checkpoint root, leaf end first (§6.2). Empty for a one-entry checkpoint. |

Verifiers MUST ignore members they do not know, at every level. Later versions add optional fields
without changing the format name (for example per-entry `evm` anchoring data in milestone 2).

### 4.4 Shapes that step `format` decides

- **An array where §4 names an object** (the feed itself, `ledgerKey`, a checkpoint, an entry, a
  `payload`) is malformed: step `format`. Inside a payload, only the members of §9.1 are read, and
  their own rules apply (an `events` element that is not an object fails rule 1 of §9.3).
- **Empty arrays are well-formed.** `checkpoints: []` and `entries: []` pass step `format`. With no
  entries there is no `batch_created`, so the feed fails at `closure-incomplete` (§8). With entries
  but no checkpoints, the first entry fails at `merkle-path` (no checkpoint has its `checkpointId`).
- **Integers** (`seq`, `id`, `fromSeq`, `toSeq`, `checkpointId`, `leafIndex`) MUST be safe integers,
  at most 2^53 − 1 (9007199254740991): a JSON number above that, or with a fraction, fails step
  `format`. Numbers inside payloads are IEEE-754 doubles and are only hashed (§3.1).

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

**Choosing the key for a checkpoint.** Take the **first** key in the key document's `keys` array
whose `kid` member equals the checkpoint's `kid`. Report `unknown-key` when there is none, when that
key is not a P-256 public key (`kty` `"EC"`, `crv` `"P-256"`, `x` and `y` non-empty strings), or when
its recomputed thumbprint differs from the `kid`. Later keys with the same `kid` are not tried. A key
that passes these checks but cannot be imported (for example, a point that is not on the curve) fails
at `checkpoint-signature`, like a signature that does not verify. Only the members `kid`, `kty`,
`crv`, `x` and `y` of the key document are read; the forbidden-key rule of §3.1 applies to feeds, not
to the key document.

## 8. Short hash

The feed contains exactly one entry with `kind` `batch_created` whose `payload.batchId` equals the
feed's `batchId`. `shortHash` MUST equal the first 12 characters of that entry's `entryHash`. The
certificate link carries it as `h`, which ties the printed QR code to the anchored batch. It is always
lowercase hex: Udgam emits it lowercase and compares `h` exactly, so an uppercase `h` is a wrong `h`
(`404`, §2).

## 9. The provenance closure

### 9.1 What the feed contains

The feed of batch `B` contains, from the ledger (evaluation-plan §4.6):

- the `batch_created` entry of `B`, and every `custody_transfer` and `processing_step` entry whose
  `payload.batchId` is `B` (`processing_step`: milestone 2, a processor's step between two hops);
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
| `processing_step` | `batchId`, `kid`, `publicJwk`, `signature` |
| `harvest_event` | `eventId`, `plotId`, `deviceId`, `payloadHash` (the hash of the signed capture) |
| `verification_run` | `eventId` |
| `plot_registered` | `plotId` |
| `device_enrolled` | `deviceId` |

For display: `harvest_event.payload.capture` is the exact object the phone signed (weight in
`capture.cherryKg`), `verification_run.payload` carries `verdict`, `score` and the `checks` with their
evidence sentences, `plot_registered`/`plot_edited` carry `producerId`, `crop`, `areaHa` and the
GeoJSON `polygon`, and `attestation` carries `attestationId`, `plotId`, `issuer`, `validFrom`,
`validTo` and the certificate `fileHash`. `processing_step` (milestone 2) carries `processorOrg` and
`processorName` (the processor organisation's pseudonymous name), `process` (`pulping`, `drying`,
`hulling_parchment` or `hulling_dry_cherry`), `crop`, `inputKg`, `outputKg`, `ratio` (output as % of input,
one decimal), `band` (`[min, max]` %), `status` (`ok` or `flag`), the `evidence` sentence, `configVersion`
and `configHash` of the mass-balance bands, and `ts`. A flagged step is recorded like any other: the
status is information for the reader, not a verification failure. When a processor hands a batch on, the
`custody_transfer` from the processor to the buyer is signed by the processor's account (its `adminId`
member names the signing account, whatever its role).

### 9.2 Signed payloads

Payloads of kind `batch_created`, `custody_transfer`, `admin_override` and `processing_step` are
statements signed with a per-account key that the server holds on the account's behalf (an FPO admin,
or for `processing_step` and a processor's hand-on, the processor's account). They carry three extra members:
`kid`, `publicJwk` and `signature`. The signed **statement** is the payload without those three
members:

```
statement = JCS(payload minus the members "kid", "publicJwk" and "signature")
```

The signature is ES256 over the statement's UTF-8 bytes, P1363 `r ‖ s`, base64url (as §7.1), and
verifies with `publicJwk`; `kid` MUST equal the RFC 7638 thumbprint of `publicJwk` (§7.2), computed
from its `x` and `y`.

`publicJwk` MUST be an object with exactly the four members `kty`, `crv`, `x`, `y`, where `kty` is
`"EC"`, `crv` is `"P-256"` and `x`, `y` are strings. Any other shape fails at step
`payload-signature`: a missing or extra member (including a private `d`, or `use`/`alg`/`kid`), a
different `kty` or `crv`, a non-object, a point that is not on the curve, or any error while importing
the key or verifying. `kid` and `signature` MUST be strings, or the step fails. These keys
attest which admin account made the decision; they are not published at a well-known URL, and their
integrity comes from the ledger (the payload is under a signed checkpoint).

### 9.3 Completeness

Let `b` be the batch's `batch_created` entry. The feed is complete when:

1. `b.payload.events` is a non-empty array, and for every element `ev`: the feed has a
   `harvest_event` entry `h` with `h.payload.eventId == ev.eventId`, **and** `ev.payloadHash` is a
   string equal to `h.payload.payloadHash` (the hash of the capture the batch was built from), **and**
   the feed has at least one `verification_run` entry with `payload.eventId == ev.eventId`;
2. for **every** `harvest_event` entry in the feed: its `payload.plotId` and `payload.deviceId` are
   non-empty strings, the feed has a `plot_registered` entry with that `payload.plotId`, and the feed
   has a `device_enrolled` entry with that `payload.deviceId`;
3. `b.payload.orgId` is a non-empty string, and the `custody_transfer` entries **whose
   `payload.batchId == batchId`**, taken in `seq` order, all have `seq > b.seq` and non-empty string
   `payload.fromOrg` and `payload.toOrg`; the first has `payload.fromOrg == b.payload.orgId`, and
   each later one has `payload.fromOrg ==` the previous one's `payload.toOrg`. A `custody_transfer`
   entry for any other batch id is ignored by this rule (the server never puts one in a feed, §9.1,
   but it is not by itself a failure).

Details of these rules:

- **Every id these rules compare is a non-empty string**: `eventId` (in `events` and in the
  `harvest_event` and `verification_run` payloads), `plotId`, `deviceId`, `orgId`, `fromOrg` and
  `toOrg`. A missing, empty or non-string id never matches anything, not even another missing,
  empty or equal non-string id: a custody chain cannot start "from nobody" (an `orgId` and a first
  `fromOrg` that are both missing, both `null` or both `5` fail rule 3).
- An element of `events` that is not an object, or whose `eventId` is not a non-empty string, fails
  rule 1.
- If the feed has several `harvest_event` entries with the same `payload.eventId` (Udgam never writes
  two), rule 1 uses the one with the highest `seq`.
- The `eventId`, `plotId` and `deviceId` lookups compare strings exactly, with no normalisation.

Removing any member event's `harvest_event`, all of its runs, its plot's `plot_registered` or its
device's `device_enrolled` is therefore detected even though the removed entries' hashes are simply
absent, and so is a batch that lists a capture hash its member event does not carry. The omissions
that cannot be detected are listed in §1.

## 10. Verification steps

Run the steps in this order and stop at the first failure. Report the step name and, where given, the
`seq` or checkpoint `id`. The names are part of this format: the certificate page and the independent
checker show them.

| # | Step name | Check | Fails when |
|---|---|---|---|
| 1 | `format` | The document is JSON with the members of §4 and their types; no object at any depth has a member `__proto__`, `constructor` or `prototype` (§3.1); `format == "udgam-proof-feed/1"`; hex members are lowercase hex of the stated length; checkpoint `signature` members are non-empty strings of base64url characters (§4.2); `shortHash` is 12 lowercase hex; entries have strictly ascending `seq`; checkpoint `id`s are unique; every checkpoint has `fromSeq ≤ toSeq`. | anything malformed, or a forbidden key |
| 2 | `unknown-key` | For each checkpoint in feed order: the **first** key in the key document with `kid ==` the checkpoint's `kid` is a P-256 public key (`kty` `"EC"`, `crv` `"P-256"`, non-empty string `x` and `y`) whose recomputed thumbprint equals that `kid` (§7.2). Later keys with the same `kid` are not tried. | no such key, the first match is not a P-256 public key, or its thumbprint differs (report the `kid`) |
| 3 | `checkpoint-signature` | The checkpoint's signature verifies over its statement (§7.1) with that key. | the signature does not verify |
| 4 | `payload-hash` | For each entry in `seq` order: `hex(SHA-256(JCS(payload))) == payloadHash`, over the payload as received (§3.1). | mismatch, or the payload cannot be canonicalised |
| 5 | `entry-hash` | `entryHash` recomputes (§5). | mismatch |
| 6 | `merkle-path` | The feed has a checkpoint with `id == checkpointId`; `fromSeq ≤ seq ≤ toSeq`; `leafIndex == seq − fromSeq`; the root from `path` (§6.2) equals its `merkleRoot`. | any of these fails, including a path of the wrong length |
| 7 | `payload-signature` | For the kinds of §9.2 only: the payload's own signature verifies. | missing members, a `publicJwk` that is not exactly a P-256 public key (§9.2), wrong kid, or a bad signature |
| 8 | `short-hash` | §8. (If there is not exactly one `batch_created` entry for `batchId`, report `closure-incomplete`.) | mismatch |
| 9 | `closure-incomplete` | §9.3. | an event, its run, its listed payload hash, its plot's registration, its device's enrolment, or a custody link is missing or wrong |

Steps 2–3 run for every checkpoint before steps 4–7 run for any entry: for each checkpoint in feed
order, step 2 and then step 3. Steps 4–7 run for one entry before moving to the next. Step 1 uses the
types of §4 (including the non-empty strings and integer bounds there); step 2 chooses the key as §7.2
says.

On success report `ok` with the number of entries verified. **Coverage** is entries verified ÷ entries
in the feed; a successful run verifies all of them.

**Result shape.** Udgam's verifiers report a result in this JSON shape, and the vectors' `expected`
member (§11) uses the success form:

```
{ "ok": true, "entries": 16, "checkpoints": [{ "id": 1, "kid": "…" }, { "id": 2, "kid": "…" }] }
{ "ok": false, "step": "…", "seq": 612, "checkpointId": 7, "kid": "…" }
```

`checkpoints` lists every checkpoint of the feed in feed order, each as `{ id, kid }`. On failure,
`step` is one of the nine names above; `seq` (the entry), `checkpointId` (the checkpoint) and `kid` (for
`unknown-key`, the kid that has no published key) are present only where they apply. An independent
verifier need not use this shape; it MUST agree on `ok`, on `entries`, and on `step`.

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
| An unhashed `"__proto__"` member added to a payload | `format` (`payload_proto_member`) |
| The `device_enrolled` of a member event's device removed | `closure-incomplete` (`drop_device_enrolled`) |
| The `plot_registered` of a member event's plot removed | `closure-incomplete` (`drop_plot_registered`) |
| A batch that lists a capture hash its member event does not carry (a genuine, signed ledger) | `closure-incomplete` (`batch_event_hash`) |
| An entry pointed at another checkpoint of the feed | `merkle-path` (`merkle_checkpoint_id`) |
| An entry's `leafIndex` changed | `merkle-path` (`merkle_leaf_index`) |
| An element removed from an entry's `path` | `merkle-path` (`merkle_path_length`) |
| An unhashed `constructor` or `prototype` member added to a payload | `format` (`payload_constructor_member`, `payload_prototype_member`) |
| The `batch_created` entry removed (no `batch_created` for the feed's `batchId`) | `closure-incomplete` (`drop_batch_created`) |
| A signed payload whose signature is over a different statement (genuine ledger) | `payload-signature` (`payload_signature`) |
| A signed payload whose `kid` is another key's thumbprint (genuine ledger) | `payload-signature` (`payload_wrong_kid`) |
| A signed payload whose `publicJwk` has an extra member `d` (genuine ledger) | `payload-signature` (`payload_jwk_extra_member`) |
| A signed payload whose `publicJwk` is not a point on P-256, with a matching `kid` (genuine ledger) | `payload-signature` (`payload_jwk_off_curve`) |
| A custody transfer of the batch that does not start at the batch's organisation (genuine ledger) | `closure-incomplete` (`custody_chain`) |
| A custody chain "from nobody": no `orgId` and no `fromOrg` (genuine ledger) | `closure-incomplete` (`custody_org_missing`) |
| Org ids that are equal numbers, not strings (genuine ledger) | `closure-incomplete` (`custody_org_nonstring`) |
| A member event whose `plotId` is the empty string, with an empty-id registration in the feed (genuine ledger) | `closure-incomplete` (`empty_plot_id`) |
| Two `harvest_event` entries for one member; only the earlier carries the listed capture hash (genuine ledger) | `closure-incomplete` (`duplicate_event_highest_seq`) |
| A key document listing an impostor with the ledger key's `kid` before the real key | `unknown-key` (`duplicate_kid_first_wins`) |
| A key document whose ledger key is not P-256 | `unknown-key` (`published_key_not_p256`) |
| A checkpoint signature with non-zero unused base64url bits | `checkpoint-signature` (`checkpoint_signature_trailing_bits`) |
| A checkpoint signature of 63 bytes | `checkpoint-signature` (`checkpoint_signature_length`) |
| Checkpoint 1's signature broken **and** checkpoint 2's `kid` unpublished (steps 2–3 run per checkpoint) | `checkpoint-signature` (`step_order_interleave`) |
| A feed with empty `checkpoints` and `entries` | `closure-incomplete` (`empty_feed`) |
| A `leafIndex` of 2^53 | `format` (`unsafe_integer`) |
| A payload that is an array | `format` (`array_in_object_slot`) |

## 11. Test vectors: `docs/proof-feed.vectors.json`

Generated from a real (temporary) ledger by `pnpm tsx scripts/proof-vectors.ts`; the key in it is a
throwaway whose private half was never saved. Members:

- `format`: `udgam-proof-feed/1`.
- `keys`: a key document exactly as served at `/.well-known/udgam-ledger-key`.
- `feed`: an intact feed. Its 16 entries straddle two checkpoints (1–100, an automatic one, and
  101–108, made on demand), so it exercises paths under a 100-leaf tree and an 8-leaf tree.
- `expected`: the result of verifying `feed` with `keys`, in the success form of §10:
  `{ "ok": true, "entries": 16, "checkpoints": [{ "id": 1, "kid": "…" }, { "id": 2, "kid": "…" }] }`.
- `example`: every intermediate value for one entry, checkpoint, key and signed payload:
  `entry.payloadJcs` and `payloadHash`; `entry.entryHashInput` (the JCS text of §5) and `entryHash`;
  `entry.leafHash` (`SHA-256(0x00 ‖ entryHash bytes)`), `treeSize`, `leafIndex`, `path`, `merkleRoot`;
  `checkpoint.statement`, `statementSha256` (what the next checkpoint's `prevCheckpointHash` would be)
  and `signature`; `key.thumbprintInput` and `kid`; `signedPayload.statement` and `signature`.
- `tampers`: one object per forgery, `{ variant, description, expectedStep, feed }`, plus `keys` for
  a tamper of the key document. Verify each `feed` with the tamper's own `keys` when it has one, and
  with the top-level `keys` otherwise; it MUST fail at `expectedStep`. Most are one change to `feed`
  (`step_order_interleave` makes two, to pin the step order).
  `payload_proto_member` contains an own `"__proto__"` member (§3.1). `batch_event_hash` is a feed
  from a second, genuine ledger sealed by the same key, whose `batch_created` lists a wrong capture
  hash for one member: every hash, path and signature in it verifies, and only step 9 catches it.
  `payload_signature`, `payload_wrong_kid`, `payload_jwk_extra_member`, `payload_jwk_off_curve` and
  `custody_chain` are feeds from further genuine ledgers sealed by the same key, each holding one
  signed payload that is wrong in the way its name says; only step 7 (or, for `custody_chain`, step
  9) catches it. `merkle_checkpoint_id`, `merkle_leaf_index` and `merkle_path_length` are the
  sub-cases of step 6; `payload_constructor_member` and `payload_prototype_member` are the other two
  forbidden keys of §3.1; `drop_batch_created` leaves the feed with no `batch_created` for its batch.
  `duplicate_kid_first_wins` and `published_key_not_p256` carry their own `keys` (§7.2).
  `custody_org_missing`, `custody_org_nonstring`, `empty_plot_id` and `duplicate_event_highest_seq`
  are genuine ledgers built entry by entry for the id rules of §9.3; in `empty_plot_id` the
  registration with the empty `plotId` (which the server's closure would never select) is included
  with its genuine proof, so only the non-empty-id rule catches it.

A verifier is correct for these vectors when it accepts `feed` (with the `expected` entry count) and
rejects every tamper at its `expectedStep`.

## 12. Reference

- RFC 8785, JSON Canonicalization Scheme.
- RFC 6962 §2.1 (Merkle hash trees) and RFC 9162 §2.1.3.2 (verifying an inclusion proof).
- RFC 7517 (JWK), RFC 7518 §3.4 (ES256), RFC 7638 (JWK thumbprint), RFC 4648 §5 (base64url).
- Server implementation: `src/lib/ledger/{proof,merkle,checkpoint,feed,closure}.ts`. An independent
  verifier MUST NOT be written from it; this document is the specification.

## 13. EVM extension (milestone 2, optional)

A deployment running the EVM ledger adapter (`LEDGER_ADAPTER=evm`) also writes every entry's
`entryHash` to a `BatchRegistry` contract on an EVM chain, after the entry is committed to the
hash-chain store. The extension is **additive and optional**: the format name stays
`udgam-proof-feed/1`, nothing in §5–§10 changes, and a verifier that ignores unknown members (§4.3)
verifies such a feed exactly as before. The hash-chain store remains the system of record for payloads;
the chain only holds hashes.

### 13.1 The `evm` member of an entry

When the server runs the EVM adapter, every entry carries an `evm` object. It is **not** covered by
`entryHash`, a Merkle path or a checkpoint signature: it is a pointer to evidence held elsewhere (the
chain), to be checked there (§13.2).

| `evm.status` | Other members | Meaning |
|---|---|---|
| `anchored` | `chainId` (integer), `contract` (0x address, lowercase), `txHash` (0x + 64 hex), `blockNumber` (integer) | The registry at `contract` on chain `chainId` holds this entry's `entryHash` at its `seq`, written by transaction `txHash`, mined in block `blockNumber`. |
| `pending` | — | Not on chain yet. The chain transaction cannot be part of the database transaction, so anchoring runs after the commit, in strict `seq` order; it can lag briefly, or longer while the chain is unreachable (it is retried). |
| `failed` | — | The registry already holds a **different** hash at this `seq`. Anchoring halts at this entry until an operator records a resolution (§13.4). The entry stays `failed` after that. |

```jsonc
{ "seq": 612, "…": "…", "entryHash": "3f9a…",
  "evm": { "status": "anchored", "chainId": 31337, "contract": "0x5fbd…0aa3",
           "txHash": "0x8c1e…", "blockNumber": 640 } }
```

A feed from a server running only the hash-chain adapter has no `evm` members.

### 13.2 Checking an anchor on chain (needs RPC access to that chain)

`BatchRegistry` (Solidity, `contracts/src/BatchRegistry.sol`) exposes
`entryHash(uint64 seq) → bytes32`, `nextSeq() → uint64`, `operator() → address` and the event
`EntryAnchored(uint64 indexed seq, bytes32 entryHash)`. Only the operator can append, only at
`seq == nextSeq` (starting at 1), and there is no update path, so an anchored hash is never overwritten.

For an entry whose `evm.status` is `anchored`, after the entry has passed §10:

0. **Pin the registry independently of the feed.** Take the expected `chainId` and registry address
   (and its `operator()`) from a source you trust that the feed's server cannot rewrite in the same
   response, for example the deployment published next to the ledger key at
   `/.well-known/udgam-ledger-key` and recorded when you first trusted it, or an out-of-band
   announcement. The feed's `chainId` and `contract` MUST equal the pinned values. The `evm` member is
   not signed (§13.1): taking `contract` from the feed itself would let a server deploy a fresh
   registry, anchor rewritten hashes there, and pass steps 1–3.
1. Connect to an RPC endpoint of chain `chainId` (`eth_chainId` must return it).
2. Call `entryHash(seq)` on `contract`. It MUST equal `0x` + the entry's `entryHash`.
3. Fetch the receipt of `txHash`: it MUST have succeeded, be in block `blockNumber`, and contain an
   `EntryAnchored` log from `contract` whose `seq` and `entryHash` are the entry's.

If step 2 fails, the stored ledger and the chain disagree about that entry: someone changed one of
them after anchoring. The server's own audit (`pnpm ledger:audit`) runs the same comparison over the
whole ledger, also recomputing each entry hash from the stored payload.

A checker that fails an entry names the step: `evm-field` (not anchored, or no `evm`), `malformed`,
`chain`, `contract` (step 0/1), `registry-hash` (step 2), `tx-not-found`, `tx-status`, `tx-block` or
`log` (step 3). The server-side reference is `checkFeedAnchors` (`src/lib/ledger/evm/verify-anchors.ts`).

### 13.3 Scope and limits

- **The demo chain is local.** The demo runs the contract on Anvil, a local development chain on the
  server, not a public blockchain (mainnet is out of scope, Solution-PRD §10). Its RPC is not
  published, so a third party cannot run §13.2 against the demo, and the certificate page does
  **not** check anchors in the browser. What the page verifies is §10, unchanged.
- **What an anchor adds.** It lets anyone with RPC access to the chain see that the entry's hash was
  fixed at a given block, independently of the server's database and of the ledger key. It does not
  prove the payload is true (that is §9 and the verification checks), and a `pending` anchor proves
  nothing yet.
- **Confirmations and reorganisations.** The server records an anchor only after the transaction has
  `confirmations` blocks on top of and including its block (deployment.json; 1 on Anvil, which never
  reorganises; `pnpm contracts:deploy` writes 12 for any other chain). A recorded anchor is immutable.
  If a reorganisation deeper than that removes it, step 3 fails for that entry and
  `pnpm ledger:audit` names its seq (`anchored-in-db-but-not-on-chain`, or a hash mismatch when another
  transaction took the seq); that is an incident for the operator (§13.4), never repaired silently.
- **Operator key.** `BatchRegistry.operator` is immutable: the key cannot be rotated. A lost or leaked
  key means a new registry (and, for this ledger, the §13.4 path). This is accepted for milestone 2.

### 13.4 Operator path for a `failed` anchor

`failed` means the registry already holds a different hash at that `seq`, and the contract has no
overwrite path, so that registry can never hold the ledger's hash there. Anchoring halts at the failed
entry (nothing is retried and nothing is written while it is halted), so the mismatch cannot go
unnoticed. The operator:

1. runs `pnpm ledger:audit` and finds out why the registry holds another hash (a leaked operator key,
   a second writer, a registry reused across databases);
2. records the one resolution with
   `pnpm ledger:evm:resolve --seq=N --reason="what happened and where it is documented"`.
   The reason (10+ characters) and the time are written once on the failed row and can never be
   changed or removed (database triggers, migration 0023);
3. anchoring resumes with the next `seq`.

The entry stays `failed` in every proof and the audit keeps naming it: a resolution acknowledges the
mismatch, it does not hide it. When the registry itself cannot be trusted any more (a leaked operator
key), the remedy is a new database and a new registry, which this version does not migrate.
