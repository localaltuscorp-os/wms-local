/**
 * THE HISTORICAL SNAPSHOT — what an invoice must keep so that editing the
 * Billing Master never rewrites the past.
 *
 * PURE. No `server-only`, no database. The writer (the server actions) and any
 * future reader (an invoice renderer) share this one definition, so a snapshot
 * written today is read back with the same field names it was stored under.
 *
 * ── THE REQUIREMENT, AND WHAT IT ACTUALLY DEMANDS ──────────────────────────
 * "If the entity's address / GST / PAN / bank details / proprietor / signature /
 * logo are changed later in Billing Master, old invoices must NOT unexpectedly
 * change."
 *
 * An invoice that stores `entity_id` and joins to the master at render time
 * fails that requirement by construction: the join always returns TODAY's
 * values. Re-printing a two-year-old invoice would show the current bank
 * account, and a customer paying from that re-print would pay into an account
 * that was not the one they were originally billed from. So the invoice must
 * hold the VALUES, not a pointer to them. That is what this produces.
 *
 * ── WHY IT CARRIES STORAGE PATHS AND NOT URLs ──────────────────────────────
 * The logo and signature are part of the invoice's appearance and must be
 * frozen with the rest of it. What is frozen is the `storage_path` — the
 * permanent address of the object — never a signed URL, which expires in
 * minutes and would leave an old invoice pointing at a dead link. A replaced
 * logo is a NEW object at a new path, so an old snapshot keeps resolving to the
 * image that was actually printed.
 *
 * ── THERE IS NO INVOICE TABLE IN THIS APPLICATION ──────────────────────────
 * /billing is a read-only dashboard over a Google Sheet; nothing creates or
 * persists an invoice. So nothing calls this from an invoice today, and the
 * brief's trigger point ("when an invoice is created/finalized") does not
 * exist yet. Two things follow, and both are deliberate:
 *
 *   1. Every Billing Master write appends the snapshot to
 *      `billing_entity_versions`, so the history exists from the first edit.
 *      Had that waited for invoicing, every change made in the meantime would
 *      be unrecoverable — the one part of this that cannot be added later.
 *   2. When invoicing is built, it stores `snapshotBillingEntity(...)` on the
 *      invoice row at finalisation. That is the whole integration: one call,
 *      and old invoices stop depending on the master entirely.
 */

/**
 * The snapshot's shape version.
 *
 * Stored INSIDE the payload because these rows are immutable and outlive the
 * code that wrote them. A reader five years from now needs to know which shape
 * it is holding; without this it would have to guess from which keys happen to
 * be present, and a missing optional field is indistinguishable from an older
 * layout that never had it.
 */
export const BILLING_SNAPSHOT_VERSION = 1;

/** One stored file, as it stood at snapshot time. */
export interface SnapshotFileRef {
  /** The permanent object address — NOT a signed URL (see the header). */
  storagePath: string;
  fileName: string;
  mimeType: string | null;
}

/**
 * Everything a tax invoice prints about its issuing entity, frozen.
 *
 * Every field is explicitly nullable rather than optional: a null says "this
 * entity had no bank branch recorded when the invoice was issued", while an
 * absent key would be ambiguous between that and "this snapshot was written by
 * code that did not yet know about branches".
 */
export interface BillingEntitySnapshot {
  v: number;
  /** When the snapshot was taken, ISO 8601. */
  takenAt: string;

  entityId: string;
  name: string;

  proprietorName: string | null;
  proprietorDesignation: string | null;

  address: string | null;
  cellNo: string | null;
  email: string | null;
  website: string | null;

  panNo: string | null;
  gstNo: string | null;
  sacCodes: string[];

  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  branch: string | null;

  logo: SnapshotFileRef | null;
  signature: SnapshotFileRef | null;
}

/** The entity columns a snapshot reads. Structural, so both the Drizzle row
 *  and a hand-built object satisfy it. */
export interface SnapshotEntityInput {
  id: string;
  name: string;
  proprietorName: string | null;
  proprietorDesignation: string | null;
  address: string | null;
  cellNo: string | null;
  email: string | null;
  website: string | null;
  panNo: string | null;
  gstNo: string | null;
  sacCodes: string[] | null;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  branch: string | null;
}

export interface SnapshotFileInput {
  kind: "logo" | "signature" | "document";
  storagePath: string;
  fileName: string;
  mimeType: string | null;
}

function refOf(files: readonly SnapshotFileInput[], kind: "logo" | "signature"): SnapshotFileRef | null {
  const f = files.find((x) => x.kind === kind);
  return f ? { storagePath: f.storagePath, fileName: f.fileName, mimeType: f.mimeType } : null;
}

/**
 * Freeze an entity.
 *
 * `takenAt` is injectable so a caller writing several rows in one transaction
 * can stamp them identically, and so the tests are not time-dependent.
 *
 * Billing DOCUMENTS are deliberately not included. They are the entity's own
 * paperwork — a GST registration certificate, a cancelled cheque — not
 * something an invoice prints, and copying an unbounded list of them into every
 * invoice would bloat the row for no reader. The logo and the signature are
 * included precisely because they DO appear on the invoice.
 */
export function snapshotBillingEntity(
  entity: SnapshotEntityInput,
  files: readonly SnapshotFileInput[] = [],
  takenAt: Date = new Date(),
): BillingEntitySnapshot {
  return {
    v: BILLING_SNAPSHOT_VERSION,
    takenAt: takenAt.toISOString(),

    entityId: entity.id,
    name: entity.name,

    proprietorName: entity.proprietorName,
    proprietorDesignation: entity.proprietorDesignation,

    address: entity.address,
    cellNo: entity.cellNo,
    email: entity.email,
    website: entity.website,

    panNo: entity.panNo,
    gstNo: entity.gstNo,
    // Normalised to an array here so every reader can iterate without a null
    // check, even for a row written before the column had its NOT NULL default.
    sacCodes: entity.sacCodes ?? [],

    bankName: entity.bankName,
    accountName: entity.accountName,
    accountNumber: entity.accountNumber,
    ifsc: entity.ifsc,
    branch: entity.branch,

    logo: refOf(files, "logo"),
    signature: refOf(files, "signature"),
  };
}

/** Why a version row was written. */
export type SnapshotReason = "created" | "updated" | "files_changed" | "deleted";

/**
 * Serialise with keys in a STABLE order, at every depth.
 *
 * ── WHY THIS IS NOT PARANOIA ───────────────────────────────────────────────
 * `snapshotsDiffer` compares a snapshot READ BACK FROM POSTGRES against one
 * freshly built in JavaScript, and Postgres `jsonb` does not preserve key
 * order: it stores keys sorted by length and then alphabetically. So the two
 * objects come back with the same values in a different order, and a plain
 * `JSON.stringify` comparison reports them as different every single time.
 *
 * That is not a cosmetic difference. It defeated the exact thing
 * `snapshotsDiffer` exists to do — every save appended a version row claiming
 * the entity had changed, including saves that changed nothing, which is the
 * unreadable history the function was written to prevent. Caught by
 * scripts/verify-billing-master.ts on live data; a unit test comparing two
 * in-memory objects could not have caught it, because both would have had
 * declaration order.
 *
 * `Array.prototype.sort` on the KEYS only — array VALUES keep their order,
 * because the order of `sacCodes` is part of the data.
 *
 * EXPORTED so the verification harness compares snapshots the same way the
 * application does. Both previous harness defects in this repo came from a
 * check that reimplemented what it was checking and got it subtly wrong.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const parts = Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${parts.join(",")}}`;
}

/**
 * Do two snapshots differ in anything an invoice would print?
 *
 * Used to skip a version row when a save changed nothing material — a no-op
 * save should not add a row that claims the entity changed, because the
 * point-in-time query answers "what did it look like on date D" by finding the
 * newest row at or before D, and a run of identical rows makes that history
 * longer without making it more accurate.
 *
 * `takenAt` is excluded: it is when the photograph was taken, not part of what
 * it shows. Everything else is compared by VALUE, in a canonical key order, so
 * the answer does not depend on which side came out of the database.
 */
export function snapshotsDiffer(a: BillingEntitySnapshot, b: BillingEntitySnapshot): boolean {
  const strip = ({ takenAt: _takenAt, ...rest }: BillingEntitySnapshot) => rest;
  return canonicalJson(strip(a)) !== canonicalJson(strip(b));
}
