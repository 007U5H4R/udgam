import { and, desc, eq } from "drizzle-orm";
import { env } from "../config/env";
import { sha256Hex } from "../crypto";
import { writeTx, type Db } from "../db/client";
import { attestations, farmers, plots } from "../db/schema";
import { newId } from "../ids";
import { append } from "../ledger/hashchain";
import { log as defaultLog } from "../log";
import { localMediaStore, type MediaStore } from "../media/store";
import { istDate } from "../verification/evidence";

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
/** Earliest validity date accepted. */
export const MIN_VALID_DATE = "2000-01-01";
/** How far past today (IST) a validity date may reach. */
export const MAX_YEARS_AHEAD = 10;

export type AttestationErrorCode =
  | "not_pdf"
  | "too_large"
  | "bad_dates"
  | "issuer_required"
  | "issuer_invalid"
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

export type AttachAttestationDeps = {
  store?: MediaStore;
  now?: () => Date;
  log?: Pick<typeof defaultLog, "error">;
};

const errClass = (err: unknown) =>
  err instanceof Error ? err.constructor.name : typeof err;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const isPdf = (b: Uint8Array) =>
  b.length >= PDF_MAGIC.length && PDF_MAGIC.every((c, i) => b[i] === c);

/** A real calendar date in `YYYY-MM-DD` form (2026-02-30 is not one). */
export function isCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * True when the text holds a control character (C0, C1), a line or paragraph separator, or an invisible
 * format character: the bidi controls (U+200E/F, U+202A–202E, U+2066–2069), the zero-width ones
 * (U+200B–200D, U+2060, U+FEFF) and the rest of Unicode's format class. The issuer is anchored and shown
 * on the public certificate for good, so nothing in it may reorder or hide the text around it.
 */
const hasControl = (s: string) => /[\p{Cc}\p{Cf}\u2028\u2029]/u.test(s);

/**
 * Wording an issuer's name may not carry (DISC4, CF-11): the same phrases the wording guard keeps out of
 * the product copy (tests/wording-guard.test.ts), checked on the NFKC form so look-alike letters count.
 * Written with a leading `\b` so this file itself passes that guard.
 */
const BANNED_IN_ISSUER: readonly RegExp[] = [
  /\bverified\s+organic/i,
  /\borganic\s+verified/i,
  /\borganically\s+verified/i,
  /\bfraud/i,
  /\bfake\b/i,
  /\bcheat/i,
];

function checkedIssuer(raw: string): string {
  const issuer = typeof raw === "string" ? raw.trim() : "";
  if (issuer === "") throw new AttestationError("issuer_required");
  if (hasControl(issuer)) throw new AttestationError("issuer_invalid");
  const plain = issuer.normalize("NFKC");
  if (BANNED_IN_ISSUER.some((p) => p.test(plain)))
    throw new AttestationError("issuer_invalid");
  if ([...issuer].length > MAX_ISSUER_CHARS)
    throw new AttestationError("issuer_too_long");
  return issuer;
}

/** Real calendar dates, in order, from 2000 on and at most ten years past today (IST). */
function datesOk(validFrom: string, validTo: string, now: Date): boolean {
  if (!isCalendarDate(validFrom) || !isCalendarDate(validTo)) return false;
  const today = istDate(now.toISOString());
  const latest = `${Number(today.slice(0, 4)) + MAX_YEARS_AHEAD}${today.slice(4)}`;
  return validFrom >= MIN_VALID_DATE && validTo >= validFrom && validTo <= latest;
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
  const now = deps.now ?? (() => new Date());
  if (!datesOk(validFrom, validTo, now()))
    throw new AttestationError("bad_dates");
  if (!(await plotInOrg(db, input.orgId, input.plotId)))
    throw new AttestationError("plot_not_found");

  const store = deps.store ?? localMediaStore(env.DATA_DIR);
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
    try {
      await store.removeIfUnused(
        path,
        async () =>
          (
            await db
              .select({ id: attestations.id })
              .from(attestations)
              .where(eq(attestations.filePath, path))
              .limit(1)
          ).length > 0,
      );
    } catch (cleanupErr) {
      // An orphan file is harmless but must be seen; the error class only (the message holds a path).
      (deps.log ?? defaultLog).error(
        { errClass: errClass(cleanupErr) },
        "attestation.file_cleanup_failed",
      );
    }
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
