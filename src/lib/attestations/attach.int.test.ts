import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addOrg } from "../../../tests/helpers/auth";
import { tempDb, type TempDb } from "../../../tests/helpers/db";
import { attestations, ledgerEntries } from "../db/schema";
import type { PlotPolygon } from "../geo/types";
import { maybeCheckpoint } from "../ledger/checkpoint";
import { setOnAppended } from "../ledger/hashchain";
import { localMediaStore } from "../media/store";
import { registerPlot, setOnPlotGeometrySaved } from "../plots/plots";
import {
  AttestationError,
  attachAttestation,
  listAttestations,
  type AttestationErrorCode,
} from "./attach";

// TSK-13.1 / TC-058 (integration half): an organic certificate is stored content-addressed, its SHA-256,
// issuer and validity are anchored as an `attestation` in the same transaction, and the ledger payload is
// public-safe (EV16). DISC4: the file is only proved unchanged since it was recorded.

vi.hoisted(() => {
  process.env.LOG_LEVEL = "silent";
});

const P01 = (
  JSON.parse(
    readFileSync(
      join(
        __dirname,
        "..",
        "..",
        "..",
        "evals",
        "fixtures",
        "plots",
        "P01.geojson",
      ),
      "utf8",
    ),
  ) as { geometry: PlotPolygon }
).geometry;
const MB10 = 10 * 1024 * 1024;

const pdf = (extra = "certificate body") =>
  new TextEncoder().encode(`%PDF-1.7\n${extra}\n%%EOF\n`);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

let t: TempDb;
let plotA: string;
let plotA2: string;
let plotB: string;
const store = () => localMediaStore(t.dir);
const input = (
  over: Partial<Parameters<typeof attachAttestation>[1]> = {},
) => ({
  orgId: "ORG-A",
  plotId: plotA,
  file: pdf(),
  issuer: "INDOCERT",
  validFrom: "2026-01-01",
  validTo: "2027-01-01",
  ...over,
});
const deps = () => ({
  store: store(),
  now: () => new Date("2026-10-05T04:00:00.000Z"),
});

beforeEach(async () => {
  t = await tempDb();
  await addOrg(t.db, "ORG-A", "fpo");
  await addOrg(t.db, "ORG-B", "fpo");
  setOnPlotGeometrySaved(async () => undefined);
  const reg = (orgId: string, name: string) =>
    registerPlot(t.db, orgId, {
      newFarmer: { name, identifier: "AADHAAR-123" },
      crop: "arabica",
      geometry: P01,
    });
  plotA = (await reg("ORG-A", "Kaveri Gowda")).plotId;
  plotA2 = (await reg("ORG-A", "Devaiah Ponnappa")).plotId;
  plotB = (await reg("ORG-B", "Other Farmer")).plotId;
});
afterEach(async () => {
  setOnAppended(maybeCheckpoint);
  setOnPlotGeometrySaved(undefined);
  await t.cleanup();
});

async function refused(
  over: Partial<Parameters<typeof attachAttestation>[1]>,
): Promise<AttestationErrorCode> {
  const before = (await t.db.select().from(ledgerEntries)).length;
  const err = await attachAttestation(t.db, input(over), deps()).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AttestationError);
  expect(
    (await t.db.select().from(ledgerEntries)).length,
    "nothing anchored",
  ).toBe(before);
  expect(await t.db.select().from(attestations), "no row").toEqual([]);
  return (err as AttestationError).code;
}

describe("attachAttestation (TC-058)", () => {
  it("stores the PDF by its SHA-256 and anchors the attestation with the exact public-safe payload", async () => {
    const file = pdf();
    const expectedHash = createHash("sha256").update(file).digest("hex");
    const r = await attachAttestation(t.db, input({ file }), deps());
    expect(r.fileHash).toBe(expectedHash);
    expect(r.id).toMatch(/^AT-[0-9A-Z]{8}$/);

    // the file is on disk at DATA_DIR/attestations/<sha256>.pdf and is byte-identical
    const abs = join(t.dir, "attestations", `${expectedHash}.pdf`);
    expect(existsSync(abs)).toBe(true);
    expect(new Uint8Array(readFileSync(abs))).toEqual(file);

    const [row] = await t.db.select().from(attestations);
    expect(row).toEqual({
      id: r.id,
      plotId: plotA,
      type: "organic",
      fileHash: expectedHash,
      filePath: `attestations/${expectedHash}.pdf`,
      issuer: "INDOCERT",
      validFrom: "2026-01-01",
      validTo: "2027-01-01",
      anchorSeq: r.anchorSeq,
    });

    const [entry] = await t.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.seq, r.anchorSeq));
    expect(entry!.kind).toBe("attestation");
    expect(JSON.parse(entry!.payload)).toEqual({
      v: 1,
      attestationId: r.id,
      plotId: plotA,
      type: "organic",
      fileHash: expectedHash,
      issuer: "INDOCERT",
      validFrom: "2026-01-01",
      validTo: "2027-01-01",
    });
    expect(entry!.ts).toBe("2026-10-05T04:00:00.000Z");
  });

  it("the anchored payload holds no farmer data and none of the forbidden keys (EV16)", async () => {
    const r = await attachAttestation(t.db, input(), deps());
    const [entry] = await t.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.seq, r.anchorSeq));
    for (const secret of ["Kaveri", "Gowda", "AADHAAR", "PR-"])
      expect(entry!.payload).not.toContain(secret);
    const keys = Object.keys(JSON.parse(entry!.payload) as object);
    for (const bad of [
      "__proto__",
      "constructor",
      "prototype",
      "farmerId",
      "producerId",
    ])
      expect(keys).not.toContain(bad);
  });

  it("trims the issuer before it is stored and anchored", async () => {
    const r = await attachAttestation(
      t.db,
      input({ issuer: "  INDOCERT  " }),
      deps(),
    );
    const [row] = await t.db
      .select()
      .from(attestations)
      .where(eq(attestations.id, r.id));
    expect(row!.issuer).toBe("INDOCERT");
    const [entry] = await t.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.seq, r.anchorSeq));
    expect(JSON.parse(entry!.payload)).toMatchObject({ issuer: "INDOCERT" });
  });

  it("a PNG renamed .pdf is not_pdf: nothing is stored or anchored", async () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
    ]);
    expect(await refused({ file: png })).toBe("not_pdf");
    expect(existsSync(join(t.dir, "attestations", `${sha(png)}.pdf`))).toBe(
      false,
    );
    expect(await refused({ file: new Uint8Array() })).toBe("not_pdf");
    expect(await refused({ file: new TextEncoder().encode("%PD") })).toBe(
      "not_pdf",
    );
    // the magic must be at the very start
    expect(await refused({ file: new TextEncoder().encode(" %PDF-1.7") })).toBe(
      "not_pdf",
    );
  });

  it("a file over 10 MB is too_large; exactly 10 MB is accepted", async () => {
    const big = new Uint8Array(MB10 + 1);
    big.set(pdf().subarray(0, 5));
    expect(await refused({ file: big })).toBe("too_large");
    const edge = new Uint8Array(MB10);
    edge.set(pdf().subarray(0, 5));
    const r = await attachAttestation(t.db, input({ file: edge }), deps());
    expect(r.fileHash).toBe(sha(edge));
  });

  it("validTo before validFrom, or a date that is not a calendar date, is bad_dates", async () => {
    expect(
      await refused({ validFrom: "2027-01-02", validTo: "2027-01-01" }),
    ).toBe("bad_dates");
    for (const bad of [
      "2026-02-30",
      "2026-13-01",
      "01/01/2026",
      "2026-1-1",
      "",
      "tomorrow",
      "2026-01-01T00:00:00Z",
    ]) {
      expect(await refused({ validFrom: bad }), `validFrom ${bad}`).toBe(
        "bad_dates",
      );
      expect(await refused({ validTo: bad }), `validTo ${bad}`).toBe(
        "bad_dates",
      );
    }
  });

  it("one-day validity (validTo = validFrom) is allowed", async () => {
    const r = await attachAttestation(
      t.db,
      input({ validFrom: "2026-06-01", validTo: "2026-06-01" }),
      deps(),
    );
    expect(r.anchorSeq).toBeGreaterThan(0);
  });

  it("a blank issuer is issuer_required; an over-long one is issuer_too_long", async () => {
    expect(await refused({ issuer: "" })).toBe("issuer_required");
    expect(await refused({ issuer: "   \t " })).toBe("issuer_required");
    expect(await refused({ issuer: "x".repeat(121) })).toBe("issuer_too_long");
  });

  it("control characters in the issuer are refused (they would reach every surface)", async () => {
    expect(await refused({ issuer: "INDO\u0000CERT" })).toBe("issuer_required");
    expect(await refused({ issuer: "INDO\nCERT" })).toBe("issuer_required");
  });

  it("another org's plot and an unknown plot are both plot_not_found; the file is not stored", async () => {
    const file = pdf("someone else");
    expect(await refused({ plotId: plotB, file })).toBe("plot_not_found");
    expect(await refused({ plotId: "PL-00000000", file })).toBe(
      "plot_not_found",
    );
    expect(existsSync(join(t.dir, "attestations", `${sha(file)}.pdf`))).toBe(
      false,
    );
  });

  it("a failure injected into the ledger append leaves no row, no entry and no orphan file (TC-010 pattern)", async () => {
    const file = pdf("orphan check");
    const before = (await t.db.select().from(ledgerEntries)).length;
    setOnAppended(async () => {
      throw new Error("injected");
    });
    await expect(
      attachAttestation(t.db, input({ file }), deps()),
    ).rejects.toThrow("injected");
    setOnAppended(maybeCheckpoint);
    expect(await t.db.select().from(attestations)).toEqual([]);
    expect((await t.db.select().from(ledgerEntries)).length).toBe(before);
    expect(existsSync(join(t.dir, "attestations", `${sha(file)}.pdf`))).toBe(
      false,
    );
  });

  it("a failed attach never deletes a file another attestation already references", async () => {
    const file = pdf("shared certificate");
    const first = await attachAttestation(t.db, input({ file }), deps());
    setOnAppended(async () => {
      throw new Error("injected");
    });
    await expect(
      attachAttestation(t.db, input({ file, plotId: plotA2 }), deps()),
    ).rejects.toThrow("injected");
    setOnAppended(maybeCheckpoint);
    expect(
      existsSync(join(t.dir, "attestations", `${first.fileHash}.pdf`)),
    ).toBe(true);
    expect((await t.db.select().from(attestations)).length).toBe(1);
  });

  it("the same certificate on two plots shares one stored file and gets two anchors", async () => {
    const file = pdf("cooperative-wide certificate");
    const a = await attachAttestation(
      t.db,
      input({ file, plotId: plotA }),
      deps(),
    );
    const b = await attachAttestation(
      t.db,
      input({ file, plotId: plotA2 }),
      deps(),
    );
    expect(a.fileHash).toBe(b.fileHash);
    expect(a.id).not.toBe(b.id);
    expect(a.anchorSeq).not.toBe(b.anchorSeq);
    expect(
      (
        await t.db
          .select()
          .from(attestations)
          .orderBy(asc(attestations.anchorSeq))
      ).map((r) => r.plotId),
    ).toEqual([plotA, plotA2]);
  });

  it("listAttestations returns the org plot’s attestations newest first, and nothing for another org’s plot", async () => {
    const first = await attachAttestation(
      t.db,
      input({ file: pdf("one"), issuer: "FIRST" }),
      deps(),
    );
    const second = await attachAttestation(
      t.db,
      input({ file: pdf("two"), issuer: "SECOND" }),
      deps(),
    );
    expect(
      (await listAttestations(t.db, "ORG-A", plotA)).map((a) => [
        a.id,
        a.issuer,
      ]),
    ).toEqual([
      [second.id, "SECOND"],
      [first.id, "FIRST"],
    ]);
    expect(await listAttestations(t.db, "ORG-B", plotA)).toEqual([]);
    expect(await listAttestations(t.db, "ORG-A", plotA2)).toEqual([]);
  });
});

// The table gets the same provenance guards as the others (§4.2, S8, TP14; migrations 0010/0013): no
// anchor, no row; no replace, update or delete. Attempted directly in SQL.
describe("attestations table guards (raw SQL)", () => {
  const insert = (verb: string, id: string, anchor: number, extra = "") =>
    t.client.execute(
      `${verb} INTO attestations (id, plot_id, type, file_hash, file_path, issuer, valid_from, valid_to, anchor_seq) VALUES ('${id}', '${plotA}', 'organic', '${"a".repeat(64)}', 'attestations/x.pdf', 'I', '2026-01-01', '2027-01-01', ${anchor}) ${extra}`,
    );

  it("a row without an existing ledger entry is refused (anchor FK)", async () => {
    await expect(insert("INSERT", "AT-RAW00001", 999_999)).rejects.toThrow(
      /FOREIGN KEY/i,
    );
  });

  it("REPLACE, INSERT OR REPLACE, an upsert, UPDATE and DELETE are all refused; the row is unchanged", async () => {
    const r = await attachAttestation(t.db, input(), deps());
    for (const verb of ["INSERT OR REPLACE", "REPLACE", "INSERT"]) {
      await expect(insert(verb, r.id, r.anchorSeq), verb).rejects.toThrow(
        "UNIQUE: attestation already exists",
      );
    }
    await expect(
      insert(
        "INSERT",
        r.id,
        r.anchorSeq,
        `ON CONFLICT(id) DO UPDATE SET issuer = 'X'`,
      ),
    ).rejects.toThrow("attestation already exists");
    await expect(
      t.client.execute(`UPDATE attestations SET issuer = 'FORGED'`),
    ).rejects.toThrow("never updated");
    await expect(
      t.client.execute(
        `UPDATE attestations SET file_hash = '${"b".repeat(64)}'`,
      ),
    ).rejects.toThrow("never updated");
    await expect(t.client.execute(`DELETE FROM attestations`)).rejects.toThrow(
      "never deleted",
    );
    const rows = await t.db.select().from(attestations);
    expect(rows.map((x) => [x.id, x.issuer])).toEqual([[r.id, "INDOCERT"]]);
  });

  it("a type other than organic is refused", async () => {
    const r = await attachAttestation(t.db, input(), deps());
    await expect(
      t.client.execute(
        `INSERT INTO attestations (id, plot_id, type, file_hash, file_path, issuer, valid_from, valid_to, anchor_seq) VALUES ('AT-RAW00002', '${plotA}', 'fairtrade', '${"a".repeat(64)}', 'x', 'I', '2026-01-01', '2027-01-01', ${r.anchorSeq})`,
      ),
    ).rejects.toThrow(/CHECK/i);
  });
});
