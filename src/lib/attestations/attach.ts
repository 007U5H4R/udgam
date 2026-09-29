import { and, desc, eq } from "drizzle-orm";
import { env } from "../config/env";
import { sha256Hex } from "../crypto";
import { writeTx, type Db } from "../db/client";
import { attestations, farmers, plots } from "../db/schema";
import { newId } from "../ids";
import { append } from "../ledger/hashchain";
import { localMediaStore, type MediaStore } from "../media/store";

// An organic certificate as an attestation (technical-plan §4.1, §8.1, TKT-13, DISC4). An issuer claims
// the plot is certified; Udgam only proves that the certificate file has not changed since it was
// recorded. The file is stored content-addressed (DATA_DIR/attestations/<sha256>.pdf), and its SHA-256,
// the issuer and the validity dates are anchored as an `attestation` ledger entry in the same write
// transaction as the row.
//
// The ledger payload is public-safe (EV16): IDs, the file hash, the issuer's name and two dates; never
// the farmer's name or identifier, and never a key named __proto__, constructor or prototype (the proof
// feed rejects those).

/** Certificate size cap (technical-plan §22 TSK-13.1). */
export const MAX_ATTESTATION_BYTES = 10 * 1024 * 1024;
/** Longest issuer name stored. */
export const MAX_ISSUER_CHARS = 120;

export type AttestationErrorCode =
  | "not_pdf"
  | "too_large"
  | "bad_dates"
  | "issuer_required"
  | "issuer_too_long"
  | "plot_not_found";

export class AttestationError extends Error {
  constructor(readonly code: AttestationErrorCode) {
    super(code);
    this.name = "AttestationError";
  }
}

export type AttachAttestationInput = {
  orgId: string;
  plotId: string;
  file: Uint8Array;
  issuer: string;
  /** `YYYY-MM-DD` */
  validFrom: string;
  /** `YYYY-MM-DD`, on or after `validFrom` */
  validTo: string;
};

export type AttachAttestationDeps = { store?: MediaStore; now?: () => Date };

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const isPdf = (b: Uint8Array) =>
  b.length >= PDF_MAGIC.length && PDF_MAGIC.every((c, i) => b[i] === c);

/** A real calendar date in `YYYY-MM-DD` form (2026-02-30 is not one). */
export function isCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** True when the text holds a control character or a line or paragraph separator. */
const hasControl = (s: string) =>
  [...s].some((ch) => {
    const c = ch.codePointAt(0)!;
    return c < 0x20 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029;
  });

function checkedIssuer(raw: string): string {
  const issuer = typeof raw === "string" ? raw.trim() : "";
  if (issuer === "" || hasControl(issuer))
    throw new AttestationError("issuer_required");
  if ([...issuer].length > MAX_ISSUER_CHARS)
    throw new AttestationError("issuer_too_long");
  return issuer;
}

async function plotInOrg(
  db: Db,
  orgId: string,
  plotId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: plots.id })
    .from(plots)
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(and(eq(plots.id, plotId), eq(farmers.orgId, orgId)))
    .limit(1);
  return row !== undefined;
}

/**
 * Record an organic certificate for one of the org's plots. Validates (size, PDF magic bytes, issuer,
 * dates), stores the file under its SHA-256, then writes the row and its `attestation` anchor in one
 * transaction. A failure leaves no row, no entry and no orphan file (a file another attestation
 * references is never removed).
 */
export async function attachAttestation(
  db: Db,
  input: AttachAttestationInput,
  deps: AttachAttestationDeps = {},
): Promise<{ id: string; fileHash: string; anchorSeq: number }> {
  const { file } = input;
  if (file.length > MAX_ATTESTATION_BYTES)
    throw new AttestationError("too_large");
  if (!isPdf(file)) throw new AttestationError("not_pdf");
  const issuer = checkedIssuer(input.issuer);
  const { validFrom, validTo } = input;
  if (
    !isCalendarDate(validFrom) ||
    !isCalendarDate(validTo) ||
    validTo < validFrom
  )
    throw new AttestationError("bad_dates");
  if (!(await plotInOrg(db, input.orgId, input.plotId)))
    throw new AttestationError("plot_not_found");

  const store = deps.store ?? localMediaStore(env.DATA_DIR);
  const now = deps.now ?? (() => new Date());
  const fileHash = await sha256Hex(file);
  const id = newId("AT-");
  const { path } = await store.put(file, fileHash, "application/pdf");
  try {
    const anchorSeq = await writeTx(db, async (tx) => {
      // Re-checked inside the transaction: the plot is the org's at the moment the row is written.
      const [plot] = await tx
        .select({ id: plots.id })
        .from(plots)
        .innerJoin(farmers, eq(farmers.id, plots.farmerId))
        .where(and(eq(plots.id, input.plotId), eq(farmers.orgId, input.orgId)))
        .limit(1);
      if (!plot) throw new AttestationError("plot_not_found");
      const anchor = await append(
        tx,
        "attestation",
        {
          v: 1,
          attestationId: id,
          plotId: input.plotId,
          type: "organic",
          fileHash,
          issuer,
          validFrom,
          validTo,
        },
        now,
      );
      await tx.insert(attestations).values({
        id,
        plotId: input.plotId,
        type: "organic",
        fileHash,
        filePath: path,
        issuer,
        validFrom,
        validTo,
        anchorSeq: anchor.seq,
      });
      return anchor.seq;
    });
    store.release(path);
    return { id, fileHash, anchorSeq };
  } catch (err) {
    // Release first: removeIfUnused never deletes a file that a request still holds.
    store.release(path);
    await store
      .removeIfUnused(
        path,
        async () =>
          (
            await db
              .select({ id: attestations.id })
              .from(attestations)
              .where(eq(attestations.filePath, path))
              .limit(1)
          ).length > 0,
      )
      .catch(() => false);
    throw err;
  }
}

export type AttestationRecord = {
  id: string;
  plotId: string;
  fileHash: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  anchorSeq: number;
};

const columns = {
  id: attestations.id,
  plotId: attestations.plotId,
  fileHash: attestations.fileHash,
  issuer: attestations.issuer,
  validFrom: attestations.validFrom,
  validTo: attestations.validTo,
  anchorSeq: attestations.anchorSeq,
};

/** The attestations on one of the org's plots, newest first. Another org's plot has none (TC-019). */
export async function listAttestations(
  db: Db,
  orgId: string,
  plotId: string,
): Promise<AttestationRecord[]> {
  return db
    .select(columns)
    .from(attestations)
    .innerJoin(plots, eq(plots.id, attestations.plotId))
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(and(eq(attestations.plotId, plotId), eq(farmers.orgId, orgId)))
    .orderBy(desc(attestations.anchorSeq));
}

/** One attestation on one of the org's plots, with the stored file's path, or null. */
export async function getAttestation(
  db: Db,
  orgId: string,
  plotId: string,
  attestationId: string,
): Promise<(AttestationRecord & { filePath: string }) | null> {
  const [row] = await db
    .select({ ...columns, filePath: attestations.filePath })
    .from(attestations)
    .innerJoin(plots, eq(plots.id, attestations.plotId))
    .innerJoin(farmers, eq(farmers.id, plots.farmerId))
    .where(
      and(
        eq(attestations.id, attestationId),
        eq(attestations.plotId, plotId),
        eq(farmers.orgId, orgId),
      ),
    )
    .limit(1);
  return row ?? null;
}
