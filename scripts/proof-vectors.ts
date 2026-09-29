// Generate docs/proof-feed.vectors.json: an intact proof feed v1 from a real (temporary) ledger, the
// published key it verifies with, a worked example of every hash, and one tamper per variant with
// the step it must fail at. Run: pnpm tsx scripts/proof-vectors.ts
//
// The ledger key is a throwaway generated in a temp directory; its private half never leaves it.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'udgam-vectors-'));
process.env.DATA_DIR = dir;
process.env.LEDGER_KEY_PATH = join(dir, 'keys', 'ledger.jwk');
process.env.LOG_LEVEL = 'silent';

const { createDb, writeTx } = await import('../src/lib/db/client');
const { runMigrations } = await import('../src/lib/db/migrate');
const { append } = await import('../src/lib/ledger/hashchain');
const { buildFeed } = await import('../src/lib/ledger/feed');
const { publishedKeys } = await import('../src/lib/ledger/keys');
const { verifyFeed, checkpointStatementOf, payloadStatement } = await import('../src/lib/ledger/proof');
const { leafHash, merkleRoot } = await import('../src/lib/ledger/merkle');
const { bytesToHex, hexToBytes, jcs, jwkThumbprint, sha256Hex } = await import('../src/lib/crypto');
const { makeAdminKey, seedBatchWorld, signStatement } = await import('../tests/helpers/batch-world');
const { VECTOR_TAMPERS, TAMPER_DESCRIPTIONS, applyTamper } = await import('../src/lib/ledger/testing/tamper');

/** An admin_override statement on the world's first member event (as TKT-12 anchors it). */
const overrideStatement = (w: { eventIds: string[]; runIds: string[]; admin: { adminId: string } }) => ({
  v: 1,
  runId: w.runIds[0]!,
  eventId: w.eventIds[0]!,
  newVerdict: 'Verified',
  reason: 'Scale photo checked by the office',
  adminId: w.admin.adminId,
  ts: new Date().toISOString(),
});

const OUT = resolve(fileURLToPath(new URL('../docs/proof-feed.vectors.json', import.meta.url)));
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const { db, client, ready } = createDb(`file:${join(dir, 'vectors.db')}`);
try {
  await ready;
  await runMigrations(db, join(ROOT, 'src/lib/db/migrations'));
  // 92 unrelated entries first, so the batch straddles the automatic checkpoint at seq 100 and an
  // on-demand one: the feed then shows two checkpoints and paths under a 100-leaf tree.
  await writeTx(db, async (tx) => {
    for (let i = 0; i < 92; i++) await append(tx, 'plot_registered', { plotId: `PL-FILL${String(i).padStart(4, '0')}`, crop: 'robusta', areaHa: 1 });
  });
  await seedBatchWorld(db, { events: 3, plots: 2, devices: 2, editPlot: true, attestation: true, override: true, transfer: true, revokeDevice: true });
  const batchId = (await client.execute(`SELECT json_extract(payload, '$.batchId') AS b FROM ledger_entries WHERE kind = 'batch_created'`)).rows[0]!.b as string;

  const feed = await buildFeed(db, batchId);
  const keys = await publishedKeys();
  const intact = await verifyFeed(feed, keys.keys);
  if (!intact.ok) throw new Error(`intact feed failed at ${intact.step}`);

  // Worked example: the first entry, its checkpoint and the key.
  const e = feed.entries[0]!;
  const cp = feed.checkpoints.find((c) => c.id === e.checkpointId)!;
  const leaves = (await client.execute({ sql: 'SELECT entry_hash FROM ledger_entries WHERE seq BETWEEN ? AND ? ORDER BY seq', args: [cp.fromSeq, cp.toSeq] })).rows.map((r) => hexToBytes(r.entry_hash as string));
  const key = keys.keys[0]!;
  const signed = feed.entries.find((x) => x.kind === 'batch_created')!;
  const example = {
    entry: {
      seq: e.seq,
      payloadJcs: jcs(e.payload),
      payloadHash: await sha256Hex(jcs(e.payload)),
      entryHashInput: jcs({ seq: e.seq, prev_hash: e.prevHash, kind: e.kind, payload_hash: e.payloadHash, ts: e.ts }),
      entryHash: e.entryHash,
      leafHash: bytesToHex(await leafHash(hexToBytes(e.entryHash))),
      treeSize: cp.toSeq - cp.fromSeq + 1,
      leafIndex: e.leafIndex,
      path: e.path,
      merkleRoot: bytesToHex(await merkleRoot(leaves)),
    },
    checkpoint: {
      id: cp.id,
      statement: checkpointStatementOf(cp),
      statementSha256: await sha256Hex(checkpointStatementOf(cp)),
      signature: cp.signature,
    },
    key: {
      thumbprintInput: jcs({ crv: key.crv, kty: key.kty, x: key.x, y: key.y }),
      kid: key.kid,
    },
    signedPayload: {
      seq: signed.seq,
      kind: signed.kind,
      statement: payloadStatement(signed.payload),
      signature: signed.payload.signature,
    },
  };

  // Each tamper is checked as a verifier receives it: serialised, then parsed.
  const asReceived = (f: unknown) => JSON.parse(JSON.stringify(f)) as unknown;
  const tampers = [];
  for (const variant of VECTOR_TAMPERS) {
    const t = await applyTamper(feed, keys.keys, variant);
    const out = await verifyFeed(asReceived(t.feed), keys.keys);
    if (out.ok || out.step !== t.expectedStep) throw new Error(`tamper ${variant}: expected ${t.expectedStep}, got ${out.ok ? 'ok' : out.step}`);
    tampers.push({ variant, description: TAMPER_DESCRIPTIONS[variant], expectedStep: t.expectedStep, feed: t.feed });
  }

  // An insider vector no outside forger can make: a second ledger, sealed by the same ledger key, whose
  // batch_created lists a payloadHash that its member's harvest_event does not carry.
  const second = createDb(`file:${join(dir, 'insider.db')}`);
  try {
    await second.ready;
    await runMigrations(second.db, join(ROOT, 'src/lib/db/migrations'));
    const w = await seedBatchWorld(second.db, { events: 2, plots: 1, devices: 1, misstateEventHash: true });
    const misstated = await buildFeed(second.db, w.batchId);
    const out = await verifyFeed(asReceived(misstated), keys.keys);
    if (out.ok || out.step !== 'closure-incomplete') throw new Error(`batch_event_hash: expected closure-incomplete, got ${out.ok ? 'ok' : out.step}`);
    tampers.push({
      variant: 'batch_event_hash',
      description: "a genuine ledger (same key) whose batch_created lists a payloadHash for its first member that the member's harvest_event does not carry; every hash, path and signature is valid",
      expectedStep: 'closure-incomplete',
      feed: misstated,
    });
  } finally {
    second.client.close();
  }

  // More insider vectors (TKT-18): genuine ledgers sealed by the same key, each holding one signed
  // payload that is wrong in one way. Every hash, path and checkpoint signature verifies; only step 7
  // (payload-signature) or step 9 (the custody chain) catches it.
  const other = await makeAdminKey();
  const insiders: { variant: string; description: string; expectedStep: string; anchor: (w: Awaited<ReturnType<typeof seedBatchWorld>>) => Promise<{ kind: 'admin_override' | 'custody_transfer'; payload: Record<string, unknown> }> }[] = [
    {
      variant: 'payload_signature',
      description: "an admin_override on the first member whose signature is a valid signature by the same admin key over a different statement",
      expectedStep: 'payload-signature',
      anchor: async (w) => {
        const statement = overrideStatement(w);
        const signed = await signStatement(w.admin, statement);
        const elsewhere = await signStatement(w.admin, { ...statement, reason: 'a different statement' });
        return { kind: 'admin_override', payload: { ...signed, signature: elsewhere.signature } };
      },
    },
    {
      variant: 'payload_wrong_kid',
      description: "an admin_override on the first member, correctly signed, whose kid is the thumbprint of a different key",
      expectedStep: 'payload-signature',
      anchor: async (w) => ({ kind: 'admin_override', payload: { ...(await signStatement(w.admin, overrideStatement(w))), kid: other.kid } }),
    },
    {
      variant: 'payload_jwk_extra_member',
      description: 'an admin_override on the first member, correctly signed, whose publicJwk carries an extra member "d"',
      expectedStep: 'payload-signature',
      anchor: async (w) => {
        const signed = await signStatement(w.admin, overrideStatement(w));
        return { kind: 'admin_override', payload: { ...signed, publicJwk: { ...(signed.publicJwk as Record<string, unknown>), d: 'A'.repeat(43) } } };
      },
    },
    {
      variant: 'payload_jwk_off_curve',
      description: 'an admin_override on the first member whose publicJwk is not a point on P-256 (y replaced by x) and whose kid is that JWK\'s thumbprint',
      expectedStep: 'payload-signature',
      anchor: async (w) => {
        const signed = await signStatement(w.admin, overrideStatement(w));
        const jwk = signed.publicJwk as { kty: string; crv: string; x: string; y: string };
        const offCurve = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.x };
        return { kind: 'admin_override', payload: { ...signed, publicJwk: offCurve, kid: await jwkThumbprint(offCurve) } };
      },
    },
    {
      variant: 'custody_chain',
      description: "a correctly signed custody_transfer of the batch whose fromOrg is not the batch's organisation (the chain does not start at the batch's orgId)",
      expectedStep: 'closure-incomplete',
      anchor: async (w) => ({
        kind: 'custody_transfer',
        payload: await signStatement(w.admin, { v: 1, batchId: w.batchId, fromOrg: 'ORG-NOTHOLDER', toOrg: 'ORG-ELSEWHERE', ts: new Date().toISOString(), adminId: w.admin.adminId }),
      }),
    },
  ];
  for (const [i, v] of insiders.entries()) {
    const ledger = createDb(`file:${join(dir, `insider-${i}.db`)}`);
    try {
      await ledger.ready;
      await runMigrations(ledger.db, join(ROOT, 'src/lib/db/migrations'));
      const w = await seedBatchWorld(ledger.db, { events: 1, plots: 1, devices: 1 });
      const { kind, payload } = await v.anchor(w);
      await writeTx(ledger.db, (tx) => append(tx, kind, payload));
      const insiderFeed = await buildFeed(ledger.db, w.batchId);
      const out = await verifyFeed(asReceived(insiderFeed), keys.keys);
      if (out.ok || out.step !== v.expectedStep) throw new Error(`${v.variant}: expected ${v.expectedStep}, got ${out.ok ? 'ok' : out.step}`);
      tampers.push({ variant: v.variant, description: v.description, expectedStep: v.expectedStep, feed: insiderFeed });
    } finally {
      ledger.client.close();
    }
  }

  const vectors = {
    description: 'Proof feed v1 test vectors (docs/proof-feed.md). Generated by `pnpm tsx scripts/proof-vectors.ts` from a temporary ledger; the key is a throwaway.',
    format: 'udgam-proof-feed/1',
    keys,
    feed,
    expected: { ok: true, entries: feed.entries.length, checkpoints: feed.checkpoints.map((c) => ({ id: c.id, kid: c.kid })) },
    example,
    tampers,
  };
  await writeFile(OUT, JSON.stringify(vectors, null, 2) + '\n');
  console.log(`wrote ${OUT}: ${feed.entries.length} entries, ${feed.checkpoints.length} checkpoints, ${tampers.length} tampers`);
} finally {
  client.close();
  await rm(dir, { recursive: true, force: true });
}
