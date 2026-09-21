import "server-only";

import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingEntityFiles,
  billingEntityVersions,
  employees,
  payingEntities,
} from "@/db/schema";
import { createSignedObjectUrl } from "@/lib/storage/objects";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { canEditModule, canViewModule } from "@/lib/permissions/resolve";
import type { BillingEntitySnapshot } from "@/lib/billing/entity-snapshot";
import type { EntityFileKind } from "@/lib/billing/entity-master";

/**
 * BILLING MASTER — the reads.
 *
 * Every column is listed EXPLICITLY, never `select()` over the whole table.
 * That is this repo's standing rule for `paying_entities`' neighbours (see
 * app/(app)/documents/actions.ts) and it earns its keep here: this table gained
 * fourteen columns in migration 0226, and a bare select would 500 every one of
 * these queries against a database where that migration has not run yet.
 */

/** Signed-URL lifetime for a logo, signature or document. Ten minutes is long
 *  enough to render a page and short enough that a leaked URL is worthless. */
const FILE_URL_TTL_SECONDS = 10 * 60;

/* ════════════════════════════════════════════════════════════════════════════
   PERMISSIONS — the four the brief names, resolved in one place.
   ════════════════════════════════════════════════════════════════════════════ */

export interface BillingEntityAccess {
  /** Entity View — may open Billing Master and read entity fields. */
  entityView: boolean;
  /** Entity Edit — may create an entity and change its fields. */
  entityEdit: boolean;
  /** File View — may see the logo, signature and documents. */
  fileView: boolean;
  /** File Manage — may upload, replace and remove them. */
  fileManage: boolean;
}

/**
 * Resolve all four capabilities from the permission matrix.
 *
 * ── THE CASCADE IS APPLIED HERE, ON PURPOSE ────────────────────────────────
 * The matrix nests only three levels deep, so `admin.masters.billing-files` is
 * a SIBLING of `admin.masters.billing` rather than its child, and the matrix
 * therefore does not cascade one into the other for us. It must still cascade:
 * the files live inside the entity workspace, so somebody who cannot view the
 * entity cannot meaningfully — or safely — be handed its bank documents.
 *
 * Hence the AND. It only ever NARROWS, which is the same direction the matrix
 * itself is allowed to move in.
 */
export async function billingEntityAccess(): Promise<BillingEntityAccess> {
  const [entityView, entityEdit, fileView, fileManage] = await Promise.all([
    canViewModule("admin.masters.billing"),
    canEditModule("admin.masters.billing"),
    canViewModule("admin.masters.billing-files"),
    canEditModule("admin.masters.billing-files"),
  ]);
  return {
    entityView,
    entityEdit,
    // No entity access ⇒ no file access, whatever the files node says.
    fileView: entityView && fileView,
    fileManage: entityView && fileManage,
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   THE LIST
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * One row of the main list.
 *
 * Deliberately NOT the whole record — the brief: "Do not overload the main
 * table with every field. Detailed information should be available by opening
 * the entity." So this carries the seven columns the list shows plus what the
 * search box needs to match on, and nothing else. Bank details in particular
 * are not shipped to a browser that is only rendering a list.
 */
export interface BillingEntityRow {
  id: string;
  name: string;
  proprietorName: string | null;
  gstNo: string | null;
  panNo: string | null;
  cellNo: string | null;
  email: string | null;
  isActive: boolean;
  sortOrder: number;
  /** How many employees are paid through this entity — the same usage signal
   *  the Paying Entities roster shows, and a hint about what a delete affects. */
  employeeCount: number;
  /** How many files are attached. A count, not the files: the list does not
   *  need signed URLs it will not render. */
  fileCount: number;
}

export async function listBillingEntities(): Promise<BillingEntityRow[]> {
  /**
   * Counted as scalar SUBQUERIES rather than two LEFT JOINs and a GROUP BY.
   * Joining both children at once multiplies the rows (five employees × three
   * files = fifteen), which makes each count the other's cardinality and
   * silently reports 15 where it means 5. `count(DISTINCT …)` would also fix it;
   * the subqueries read more plainly and keep the GROUP BY off a table that is
   * about to grow a wide row.
   */
  const employeeCount = sql<number>`(
    SELECT count(*)::int FROM ${employees}
     WHERE ${employees.payingEntityId} = ${payingEntities.id}
  )`;
  const fileCount = sql<number>`(
    SELECT count(*)::int FROM ${billingEntityFiles}
     WHERE ${billingEntityFiles.entityId} = ${payingEntities.id}
  )`;

  return await db
    .select({
      id: payingEntities.id,
      name: payingEntities.name,
      proprietorName: payingEntities.proprietorName,
      gstNo: payingEntities.gstNo,
      panNo: payingEntities.panNo,
      cellNo: payingEntities.cellNo,
      email: payingEntities.email,
      isActive: payingEntities.isActive,
      sortOrder: payingEntities.sortOrder,
      employeeCount,
      fileCount,
    })
    .from(payingEntities)
    .orderBy(asc(payingEntities.sortOrder), asc(payingEntities.name));
}

/* ════════════════════════════════════════════════════════════════════════════
   THE DETAIL
   ════════════════════════════════════════════════════════════════════════════ */

export interface BillingEntityFileView {
  id: string;
  kind: EntityFileKind;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedAt: Date;
  uploadedByName: string | null;
  /**
   * A short-lived signed URL, or null when one could not be minted.
   *
   * Null is a real state, not an error to throw on: the bucket may be
   * unreachable or the object missing, and the useful behaviour is to still
   * show the file's NAME, TYPE and UPLOAD DATE — which the brief asks for — with
   * the preview unavailable, rather than to fail the whole workspace because
   * one thumbnail could not be signed.
   */
  url: string | null;
}

export interface BillingEntityDetail {
  id: string;
  name: string;
  isActive: boolean;

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

  employeeCount: number;
  updatedAt: Date;
  updatedByName: string | null;

  /** Empty when the viewer lacks File View — see `loadBillingEntityDetail`. */
  files: BillingEntityFileView[];
}

/** The entity columns, in one place, so the detail and the snapshot agree. */
const DETAIL_COLUMNS = {
  id: payingEntities.id,
  name: payingEntities.name,
  isActive: payingEntities.isActive,
  proprietorName: payingEntities.proprietorName,
  proprietorDesignation: payingEntities.proprietorDesignation,
  address: payingEntities.address,
  cellNo: payingEntities.cellNo,
  email: payingEntities.email,
  website: payingEntities.website,
  panNo: payingEntities.panNo,
  gstNo: payingEntities.gstNo,
  sacCodes: payingEntities.sacCodes,
  bankName: payingEntities.bankName,
  accountName: payingEntities.accountName,
  accountNumber: payingEntities.accountNumber,
  ifsc: payingEntities.ifsc,
  branch: payingEntities.branch,
  updatedAt: payingEntities.updatedAt,
} as const;

/** The raw entity row — what the snapshot writer needs, with no file signing. */
export async function loadBillingEntityRow(id: string) {
  const [row] = await db
    .select(DETAIL_COLUMNS)
    .from(payingEntities)
    .where(eq(payingEntities.id, id))
    .limit(1);
  return row ?? null;
}

/** The file rows for an entity, unsigned — what the snapshot writer needs. */
export async function loadBillingEntityFileRows(entityId: string) {
  return await db
    .select({
      id: billingEntityFiles.id,
      kind: billingEntityFiles.kind,
      storagePath: billingEntityFiles.storagePath,
      fileName: billingEntityFiles.fileName,
      mimeType: billingEntityFiles.mimeType,
    })
    .from(billingEntityFiles)
    .where(eq(billingEntityFiles.entityId, entityId));
}

/**
 * The full record for the workspace.
 *
 * `includeFiles` is passed by the caller from `billingEntityAccess().fileView`
 * and gates the read itself rather than the render. Loading the files and
 * letting the UI hide them would ship every signed URL to a browser that is not
 * allowed to have them — and a signed URL IS the access, so a hidden one is
 * still a working link to a bank document. Same reasoning as the Employee
 * Master stripping CTC server-side instead of hiding the column.
 */
export async function loadBillingEntityDetail(
  id: string,
  includeFiles: boolean,
): Promise<BillingEntityDetail | null> {
  const updatedBy = employees;

  const [row] = await db
    .select({
      ...DETAIL_COLUMNS,
      updatedByName: updatedBy.name,
      employeeCount: sql<number>`(
        SELECT count(*)::int FROM ${employees}
         WHERE ${employees.payingEntityId} = ${payingEntities.id}
      )`,
    })
    .from(payingEntities)
    .leftJoin(updatedBy, eq(updatedBy.id, payingEntities.updatedById))
    .where(eq(payingEntities.id, id))
    .limit(1);

  if (!row) return null;

  const files = includeFiles ? await loadFileViews(id) : [];

  return {
    ...row,
    sacCodes: row.sacCodes ?? [],
    files,
  };
}

async function loadFileViews(entityId: string): Promise<BillingEntityFileView[]> {
  const uploader = employees;
  const rows = await db
    .select({
      id: billingEntityFiles.id,
      kind: billingEntityFiles.kind,
      storagePath: billingEntityFiles.storagePath,
      fileName: billingEntityFiles.fileName,
      mimeType: billingEntityFiles.mimeType,
      sizeBytes: billingEntityFiles.sizeBytes,
      uploadedAt: billingEntityFiles.createdAt,
      uploadedByName: uploader.name,
    })
    .from(billingEntityFiles)
    .leftJoin(uploader, eq(uploader.id, billingEntityFiles.uploadedById))
    .where(eq(billingEntityFiles.entityId, entityId))
    // Logo, then signature, then documents newest-first — the order the
    // workspace renders them in, decided here so the UI does not re-sort.
    .orderBy(asc(billingEntityFiles.kind), desc(billingEntityFiles.createdAt));

  return await Promise.all(
    rows.map(async ({ storagePath, ...f }) => ({
      ...f,
      kind: f.kind as EntityFileKind,
      url: await createSignedObjectUrl(DOCUMENTS_BUCKET, storagePath, FILE_URL_TTL_SECONDS),
    })),
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   §6 BILLING MODULE INTEGRATION
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Resolve an entity from the NAME a billing surface holds.
 *
 * ── WHY BY NAME ────────────────────────────────────────────────────────────
 * Because that is the key every existing billing-adjacent surface actually
 * has. The /billing ledger carries the entity as a bare string out of column AJ
 * of a Google Sheet; the salary tables store `company_name`; `lib/hr/entities.ts`
 * is joined to `paying_entities.name` by migration 0158. An id-only lookup
 * would be tidier and would answer none of them.
 *
 * ── IT RETURNS NULL FOR AN UNKNOWN NAME. THIS IS THE POINT. ────────────────
 * `getEntity()` in lib/hr/entities.ts resolves anything it does not recognise
 * to Altus Corp, silently — a sensible default for a letterhead, and a
 * genuinely dangerous one for a tax invoice, where it means printing the wrong
 * legal issuer, the wrong GST number and the wrong bank account on a document
 * somebody will pay against. So this does not guess. An unmatched name is a
 * null the caller must handle.
 *
 * Matching is case- and whitespace-insensitive because the sheet's spelling is
 * hand-typed, but it is otherwise exact: no fuzzy `includes()` fallbacks, for
 * the same reason.
 */
export async function resolveBillingEntityByName(
  name: string | null | undefined,
): Promise<BillingEntityDetail | null> {
  const wanted = (name ?? "").replace(/\s+/g, " ").trim();
  if (!wanted) return null;

  const [row] = await db
    .select({ id: payingEntities.id })
    .from(payingEntities)
    .where(sql`lower(${payingEntities.name}) = lower(${wanted})`)
    .limit(1);

  if (!row) return null;
  // Files included: the caller is a billing surface that needs the logo and
  // signature. Entity-file permissions are enforced on the ADMIN surface; a
  // rendered invoice needs its own issuer's mark regardless of who prints it.
  return await loadBillingEntityDetail(row.id, true);
}

/** Active entities, for a billing entity picker. */
export async function listBillingEntityOptions(): Promise<
  { id: string; name: string }[]
> {
  return await db
    .select({ id: payingEntities.id, name: payingEntities.name })
    .from(payingEntities)
    .where(eq(payingEntities.isActive, true))
    .orderBy(asc(payingEntities.sortOrder), asc(payingEntities.name));
}

/* ════════════════════════════════════════════════════════════════════════════
   §7 POINT-IN-TIME
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * What did this entity look like at `at`?
 *
 * The newest version row at or before that moment. Returns null when the entity
 * predates the version history — which is honest: for an entity nobody has
 * edited since migration 0226, there is no evidence of what it held earlier, and
 * returning today's values would be a guess dressed as a record.
 *
 * This is the read an invoice reprint wants when the invoice itself carries no
 * snapshot, and the reconciliation tool wants when checking what was printed.
 */
export async function billingEntitySnapshotAt(
  entityId: string,
  at: Date,
): Promise<BillingEntitySnapshot | null> {
  const [row] = await db
    .select({ snapshot: billingEntityVersions.snapshot })
    .from(billingEntityVersions)
    .where(
      and(
        eq(billingEntityVersions.entityId, entityId),
        lte(billingEntityVersions.createdAt, at),
      ),
    )
    .orderBy(desc(billingEntityVersions.createdAt))
    .limit(1);

  return (row?.snapshot as BillingEntitySnapshot | undefined) ?? null;
}

/** The change history for one entity, newest first — what the workspace shows. */
export async function listBillingEntityVersions(
  entityId: string,
  limit = 20,
): Promise<
  { id: string; reason: string; createdAt: Date; actorName: string | null }[]
> {
  const actor = employees;
  return await db
    .select({
      id: billingEntityVersions.id,
      reason: billingEntityVersions.reason,
      createdAt: billingEntityVersions.createdAt,
      actorName: actor.name,
    })
    .from(billingEntityVersions)
    .leftJoin(actor, eq(actor.id, billingEntityVersions.actorId))
    .where(eq(billingEntityVersions.entityId, entityId))
    .orderBy(desc(billingEntityVersions.createdAt))
    .limit(limit);
}
