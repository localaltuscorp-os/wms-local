"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  billingEntityFiles,
  billingEntityVersions,
  employees,
  payingEntities,
  settingsEvents,
} from "@/db/schema";
import { requireAdmin, forbiddenError } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { requireModuleEdit, canViewModule } from "@/lib/permissions/resolve";
import { BILLING_ENTITY_DELETE_REFUSAL } from "@/lib/security/capabilities";
import { mayDeleteBillingEntity } from "@/lib/billing/delete-guard";
import { putObject, removeObjects } from "@/lib/storage/objects";
import { DOCUMENTS_BUCKET, storageErrorMessage } from "@/lib/supabase/admin";
import { validateUpload, safeFileName } from "@/lib/hr/upload";
import {
  BillingEntityFieldsSchema,
  CreateBillingEntitySchema,
  isEntityFileKind,
  imageKindError,
  isSingletonFileKind,
  cleanText,
  type EntityFileKind,
} from "@/lib/billing/entity-master";
import {
  snapshotBillingEntity,
  snapshotsDiffer,
  type SnapshotReason,
} from "@/lib/billing/entity-snapshot";
import {
  billingEntityAccess,
  loadBillingEntityDetail,
  loadBillingEntityRow,
  loadBillingEntityFileRows,
  type BillingEntityDetail,
} from "@/lib/queries/billing-entities";

/**
 * BILLING MASTER — every mutation, and the authorization for each.
 *
 * ── WHY EACH ACTION RE-AUTHORIZES ──────────────────────────────────────────
 * The `(admin)` layout already redirects non-admins, and the page already hides
 * controls the viewer may not use. Neither of those protects anything: a server
 * action is an HTTP endpoint the browser can POST to directly, whether or not
 * the button that calls it ever rendered. So each function below starts from
 * nothing and re-establishes who is asking.
 *
 * The brief's list — create entity, edit entity, upload file, replace file,
 * remove file, delete entity — is exactly the set of exported functions here,
 * and each one opens with its own guard.
 */

const PATH = "/admin/billing-master";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const IdSchema = z.string().uuid("That entity could not be found.");

/* ════════════════════════════════════════════════════════════════════════════
   AUDIT + HISTORY
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * The admin audit row. Swallow-and-warn, following every other admin master:
 * a logging failure must not fail a write that already succeeded, because that
 * would leave the database changed and report an error.
 */
async function audit(input: {
  entityId: string | null;
  entityName: string;
  actorId: string;
  eventType: string;
  fromValue?: unknown;
  toValue?: unknown;
}): Promise<void> {
  try {
    await db.insert(settingsEvents).values({
      scope: "billing_entity",
      targetId: input.entityId,
      actorId: input.actorId,
      eventType: input.eventType,
      fromValue: (input.fromValue ?? null) as never,
      toValue: (input.toValue ?? null) as never,
      note: input.entityName,
    });
  } catch (err) {
    console.warn("[billing-master] audit write failed", err);
  }
}

/**
 * Append the point-in-time snapshot (§7).
 *
 * ── NOT swallow-and-warn, unlike the audit row above ───────────────────────
 * This one is checked, because it is not a log — it is the only record of what
 * an invoice issued today was issued under. A silently dropped version row
 * means a future reprint has nothing to reconstruct from, and nobody would
 * discover it until they needed it. The caller reports the failure.
 *
 * Skipped when nothing an invoice prints actually changed: a no-op save must
 * not add a row claiming the entity changed, or the point-in-time query returns
 * a run of identical versions that is longer without being more accurate.
 */
async function writeVersion(
  entityId: string,
  reason: SnapshotReason,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await loadBillingEntityRow(entityId);
  if (!row) return { ok: false, error: "That entity could not be found." };
  const files = await loadBillingEntityFileRows(entityId);
  const snapshot = snapshotBillingEntity(row, files);

  if (reason === "updated" || reason === "files_changed") {
    const [latest] = await db
      .select({ snapshot: billingEntityVersions.snapshot })
      .from(billingEntityVersions)
      .where(eq(billingEntityVersions.entityId, entityId))
      .orderBy(sql`${billingEntityVersions.createdAt} DESC`)
      .limit(1);
    const prev = latest?.snapshot as ReturnType<typeof snapshotBillingEntity> | undefined;
    if (prev && !snapshotsDiffer(prev, snapshot)) return { ok: true };
  }

  try {
    await db.insert(billingEntityVersions).values({
      entityId,
      entityName: row.name,
      snapshot: snapshot as never,
      reason,
      actorId,
    });
  } catch (err) {
    return {
      ok: false,
      error: `Saved, but the history record failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return { ok: true };
}

/* ════════════════════════════════════════════════════════════════════════════
   GUARDS
   ════════════════════════════════════════════════════════════════════════════ */

/** Admin + Entity Edit. Throws 403 when the matrix denies edit. */
async function requireEntityEdit() {
  const me = await requireAdmin();
  await requireModuleEdit("admin.masters.billing");
  return me;
}

/**
 * Admin + File Manage, AND Entity View.
 *
 * The second half is the cascade the three-level matrix cannot express for us:
 * `admin.masters.billing-files` is a sibling of `admin.masters.billing`, not a
 * child, so denying the entity does not automatically deny its files. Somebody
 * who may not open the entity must not be able to POST a new bank document into
 * it, so the AND is applied here — the same AND `billingEntityAccess()` applies
 * when deciding what to render.
 */
async function requireFileManage() {
  const me = await requireAdmin();
  await requireModuleEdit("admin.masters.billing-files");
  if (!(await canViewModule("admin.masters.billing"))) throw forbiddenError();
  return me;
}

/* ════════════════════════════════════════════════════════════════════════════
   READ (for the workspace)
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Load one entity for the workspace.
 *
 * A read, but still guarded — the workspace fetches through this on open, and
 * it returns bank details. `fileView` decides whether the files are loaded at
 * all rather than whether they are rendered: a signed URL IS the access, so
 * shipping one to a browser that may not have it and hiding it in the UI would
 * hand over the document.
 */
export async function fetchBillingEntityDetail(
  id: string,
): Promise<ActionResult<{ detail: BillingEntityDetail }>> {
  await requireAdmin();
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const access = await billingEntityAccess();
  if (!access.entityView) return { ok: false, error: "You cannot view billing entities." };

  const detail = await loadBillingEntityDetail(parsed.data, access.fileView);
  if (!detail) return { ok: false, error: "That entity could not be found." };
  return { ok: true, detail };
}

/* ════════════════════════════════════════════════════════════════════════════
   CREATE
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Reject a name that already belongs to another entity.
 *
 * `paying_entities.name` is UNIQUE, so the database would refuse it anyway —
 * but as a constraint-violation string, which is not a sentence anybody should
 * be shown. Checked case-insensitively because "Unleashed" and "unleashed" are
 * the same company, and the unique index is not.
 */
async function nameTakenError(name: string, exceptId?: string): Promise<string | null> {
  const clash = await db
    .select({ id: payingEntities.id, name: payingEntities.name })
    .from(payingEntities)
    .where(sql`lower(${payingEntities.name}) = lower(${name})`)
    .limit(1);
  const found = clash[0];
  if (!found || found.id === exceptId) return null;
  return `“${found.name}” already exists in the Billing Master.`;
}

export async function createBillingEntity(input: {
  name: string;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireEntityEdit();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateBillingEntitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };

  const taken = await nameTakenError(parsed.data.name);
  if (taken) return { ok: false, error: taken };

  let inserted;
  try {
    [inserted] = await db
      .insert(payingEntities)
      .values({ name: parsed.data.name, updatedById: me.id })
      .returning({ id: payingEntities.id });
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!inserted) return { ok: false, error: "The entity could not be created." };

  const version = await writeVersion(inserted.id, "created", me.id);
  if (!version.ok) return version;

  await audit({
    entityId: inserted.id,
    entityName: parsed.data.name,
    actorId: me.id,
    eventType: "entity_created",
    toValue: { name: parsed.data.name },
  });

  revalidatePath(PATH);
  return { ok: true, id: inserted.id };
}

/* ════════════════════════════════════════════════════════════════════════════
   EDIT
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Save a SPARSE patch — only the fields the workspace actually changed.
 *
 * The Employee Master's dirty-set convention, and for the same safety reason
 * rather than to save bytes: a field this form did not render, or rendered but
 * nobody touched, arrives as `undefined` and is left alone. Sending the whole
 * form would let a section that failed to load blank the columns it was
 * supposed to show — which on this table means clearing a bank account.
 */
export async function updateBillingEntity(
  id: string,
  fields: unknown,
): Promise<ActionResult> {
  const me = await requireEntityEdit();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const idRes = IdSchema.safeParse(id);
  if (!idRes.success) return { ok: false, error: idRes.error.issues[0]!.message };

  const parsed = BillingEntityFieldsSchema.safeParse(fields);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  if (Object.keys(parsed.data).length === 0) return { ok: false, error: "No changes to save." };

  const before = await loadBillingEntityRow(idRes.data);
  if (!before) return { ok: false, error: "That entity could not be found." };

  if (parsed.data.name !== undefined) {
    const taken = await nameTakenError(parsed.data.name, idRes.data);
    if (taken) return { ok: false, error: taken };
  }

  /**
   * Build the patch, turning "" into null.
   *
   * The workspace sends a cleared input as an empty string; storing that would
   * make "recorded as blank" and "not recorded" two different states that look
   * identical everywhere, and `cleanText` already collapses the difference for
   * the text fields. Booleans and the SAC array pass through untouched.
   */
  const patch: Record<string, unknown> = { updatedById: me.id, updatedAt: new Date() };
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    if (key === "isActive" || key === "sacCodes") {
      patch[key] = value;
    } else if (typeof value === "string") {
      patch[key] = key === "name" ? value : cleanText(value);
    } else {
      patch[key] = value ?? null;
    }
  }

  try {
    await db.update(payingEntities).set(patch).where(eq(payingEntities.id, idRes.data));
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  const version = await writeVersion(idRes.data, "updated", me.id);
  if (!version.ok) return version;

  await audit({
    entityId: idRes.data,
    entityName: parsed.data.name ?? before.name,
    actorId: me.id,
    eventType: "entity_updated",
    // Only the fields that were sent, on both sides — so the audit row reads as
    // "what changed" rather than as a diff of the whole record against itself.
    fromValue: Object.fromEntries(
      Object.keys(parsed.data).map((k) => [k, (before as Record<string, unknown>)[k] ?? null]),
    ),
    toValue: parsed.data,
  });

  revalidatePath(PATH);
  return { ok: true };
}

/* ════════════════════════════════════════════════════════════════════════════
   FILES
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Upload — or REPLACE, for the logo and the signature.
 *
 * Expects FormData: entityId, kind, file.
 *
 * Replacement is handled here rather than by a separate action because the
 * database enforces one logo and one signature per entity (a partial unique
 * index), so "upload a second logo" has no valid meaning. Two actions would
 * also mean two guards to keep in step for one permission.
 */
export async function uploadBillingEntityFile(
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireFileManage();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const idRes = IdSchema.safeParse(String(form.get("entityId") ?? ""));
  if (!idRes.success) return { ok: false, error: idRes.error.issues[0]!.message };
  const entityId = idRes.data;

  const kindRaw = String(form.get("kind") ?? "");
  if (!isEntityFileKind(kindRaw)) return { ok: false, error: "Unknown file type." };
  const kind: EntityFileKind = kindRaw;

  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Pick a file to upload." };

  // The application's existing upload rules — size ceiling and the executable /
  // inline-renderable deny-list that every other HR surface uses. Not a second
  // policy: the brief asks to validate "according to the existing
  // file-storage rules", and this is them.
  const shape = validateUpload(file);
  if (!shape.ok) return { ok: false, error: shape.error };

  // Plus one rule of this feature's own: a logo or signature is drawn into a
  // document, so it must be an image.
  const imageErr = imageKindError(kind, file.type || null);
  if (imageErr) return { ok: false, error: imageErr };

  const [entity] = await db
    .select({ id: payingEntities.id, name: payingEntities.name })
    .from(payingEntities)
    .where(eq(payingEntities.id, entityId))
    .limit(1);
  if (!entity) return { ok: false, error: "That entity could not be found." };

  // What is being replaced, if anything. Read BEFORE the upload so the old
  // object can be cleaned up only once the new row is safely in place.
  const existing = isSingletonFileKind(kind)
    ? await db
        .select({ id: billingEntityFiles.id, storagePath: billingEntityFiles.storagePath })
        .from(billingEntityFiles)
        .where(
          sql`${billingEntityFiles.entityId} = ${entityId} AND ${billingEntityFiles.kind} = ${kind}`,
        )
        .limit(1)
    : [];

  const storagePath = `billing-entities/${entityId}/${kind}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const put = await putObject(
    DOCUMENTS_BUCKET,
    storagePath,
    buffer,
    file.type || "application/octet-stream",
  );
  if (!put.ok) return { ok: false, error: storageErrorMessage(put.error) };

  let inserted;
  try {
    /**
     * Replace = delete the old ROW then insert the new one, in a transaction.
     *
     * Both statements together, because the partial unique index means the
     * insert fails while the old row is still there. A non-transactional
     * delete-then-insert would leave an entity with NO logo if the insert then
     * failed — worse than the state it started in.
     */
    inserted = await db.transaction(async (tx) => {
      const prior = existing[0];
      if (prior) {
        await tx.delete(billingEntityFiles).where(eq(billingEntityFiles.id, prior.id));
      }
      const [row] = await tx
        .insert(billingEntityFiles)
        .values({
          entityId,
          kind,
          storagePath,
          fileName: file.name.slice(0, 200),
          mimeType: file.type || null,
          sizeBytes: file.size,
          uploadedById: me.id,
        })
        .returning({ id: billingEntityFiles.id });
      return row;
    });
  } catch (err) {
    // The row never landed, so the object is garbage. Remove it rather than
    // leaving an unreferenced file in the bucket forever.
    await removeObjects(DOCUMENTS_BUCKET, [storagePath]);
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!inserted) {
    await removeObjects(DOCUMENTS_BUCKET, [storagePath]);
    return { ok: false, error: "The file could not be attached." };
  }

  // Now that the new row is committed, the replaced object is genuinely dead.
  // Best-effort: the row is the record, and a failed storage delete leaves an
  // orphaned object rather than a broken entity.
  const replaced = existing[0];
  if (replaced) await removeObjects(DOCUMENTS_BUCKET, [replaced.storagePath]);

  const version = await writeVersion(entityId, "files_changed", me.id);
  if (!version.ok) return version;

  await audit({
    entityId,
    entityName: entity.name,
    actorId: me.id,
    eventType: replaced ? "file_replaced" : "file_uploaded",
    fromValue: replaced ? { kind, storagePath: replaced.storagePath } : null,
    toValue: { kind, fileName: file.name, sizeBytes: file.size },
  });

  revalidatePath(PATH);
  return { ok: true, id: inserted.id };
}

/** Remove one attached file. File Manage only. */
export async function removeBillingEntityFile(fileId: string): Promise<ActionResult> {
  const me = await requireFileManage();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const idRes = IdSchema.safeParse(fileId);
  if (!idRes.success) return { ok: false, error: "That file could not be found." };

  const [found] = await db
    .select({
      id: billingEntityFiles.id,
      entityId: billingEntityFiles.entityId,
      kind: billingEntityFiles.kind,
      fileName: billingEntityFiles.fileName,
      storagePath: billingEntityFiles.storagePath,
      entityName: payingEntities.name,
    })
    .from(billingEntityFiles)
    .innerJoin(payingEntities, eq(payingEntities.id, billingEntityFiles.entityId))
    .where(eq(billingEntityFiles.id, idRes.data))
    .limit(1);
  if (!found) return { ok: false, error: "That file could not be found." };

  try {
    await db.delete(billingEntityFiles).where(eq(billingEntityFiles.id, found.id));
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Row first, object second. The row is the record: an orphaned object is
  // invisible, while a row pointing at a deleted object is a broken file in the
  // UI. Best-effort, for the same reason.
  await removeObjects(DOCUMENTS_BUCKET, [found.storagePath]);

  const version = await writeVersion(found.entityId, "files_changed", me.id);
  if (!version.ok) return version;

  await audit({
    entityId: found.entityId,
    entityName: found.entityName,
    actorId: me.id,
    eventType: "file_removed",
    fromValue: { kind: found.kind, fileName: found.fileName },
  });

  revalidatePath(PATH);
  return { ok: true };
}

/* ════════════════════════════════════════════════════════════════════════════
   DELETE — the narrowest thing in this file
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * What deleting this entity would take with it. Read by the confirmation.
 *
 * Gated on Entity View like every other read here, not merely on `requireAdmin`
 * — it discloses the entity's name and how many people are paid through it, and
 * an admin whom the matrix has shut out of Billing Master should not learn
 * either by calling this endpoint directly.
 */
export async function billingEntityDeleteImpact(
  id: string,
): Promise<ActionResult<{ name: string; employeeCount: number; fileCount: number; mayDelete: boolean }>> {
  await requireAdmin();
  if (!(await canViewModule("admin.masters.billing"))) {
    return { ok: false, error: "You cannot view billing entities." };
  }
  const idRes = IdSchema.safeParse(id);
  if (!idRes.success) return { ok: false, error: "That entity could not be found." };

  const [row] = await db
    .select({
      name: payingEntities.name,
      employeeCount: sql<number>`(
        SELECT count(*)::int FROM ${employees}
         WHERE ${employees.payingEntityId} = ${payingEntities.id}
      )`,
      fileCount: sql<number>`(
        SELECT count(*)::int FROM ${billingEntityFiles}
         WHERE ${billingEntityFiles.entityId} = ${payingEntities.id}
      )`,
    })
    .from(payingEntities)
    .where(eq(payingEntities.id, idRes.data))
    .limit(1);
  if (!row) return { ok: false, error: "That entity could not be found." };

  return { ok: true, ...row, mayDelete: await mayDeleteBillingEntity() };
}


/**
 * Delete an entity, its files and its stored objects.
 *
 * ── INVOICES DO NOT BLOCK THIS ─────────────────────────────────────────────
 * "The user has explicitly decided that deletion is allowed even when the
 * entity has existing invoices. Do NOT block deletion because of invoice
 * references." So there is no reference check that refuses. The confirmation
 * states the consequences; the decision is the operator's.
 *
 * `billing_entity_versions` rows deliberately SURVIVE. They carry no foreign
 * key for exactly this case: once the entity is gone they are the only record
 * of what past invoices were issued under, and cascading them away would
 * destroy the history this feature exists to protect.
 */
export async function deleteBillingEntity(
  id: string,
  confirmName: string,
): Promise<ActionResult> {
  const me = await requireAdmin();

  // The capability, BEFORE anything else is read or done.
  if (!(await mayDeleteBillingEntity())) {
    return { ok: false, error: BILLING_ENTITY_DELETE_REFUSAL };
  }

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const idRes = IdSchema.safeParse(id);
  if (!idRes.success) return { ok: false, error: "That entity could not be found." };

  const [entity] = await db
    .select({ id: payingEntities.id, name: payingEntities.name })
    .from(payingEntities)
    .where(eq(payingEntities.id, idRes.data))
    .limit(1);
  if (!entity) return { ok: false, error: "That entity could not be found." };

  /**
   * THE TYPED NAME IS CHECKED HERE, NOT ONLY IN THE DIALOG.
   *
   * The brief asks for a strong confirmation. A confirmation that exists only
   * in the browser is a formality — the action is reachable without it. So the
   * name the operator typed is a required argument and must match, which makes
   * the deliberateness a property of the request rather than of the UI.
   */
  if (confirmName.replace(/\s+/g, " ").trim().toLowerCase() !== entity.name.toLowerCase()) {
    return { ok: false, error: `Type the entity name exactly — “${entity.name}” — to confirm.` };
  }

  // Snapshot BEFORE deleting: the last version row is what a future reprint of
  // an old invoice has to work from, and after the delete there is nothing left
  // to snapshot.
  const version = await writeVersion(entity.id, "deleted", me.id);
  if (!version.ok) return version;

  const files = await db
    .select({ storagePath: billingEntityFiles.storagePath })
    .from(billingEntityFiles)
    .where(eq(billingEntityFiles.entityId, entity.id));

  try {
    // The file ROWS go with the entity by ON DELETE CASCADE.
    await db.delete(payingEntities).where(eq(payingEntities.id, entity.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    /**
     * `employees.paying_entity_id` is ON DELETE SET NULL, so the database does
     * NOT refuse — employees simply lose their payroll entity. That is a real
     * consequence rather than an error, and the confirmation says so out loud
     * with the affected head-count, because nothing here will stop it.
     *
     * This branch is kept for any OTHER reference that does restrict. A raw
     * constraint string is not a sentence to show anybody, and a future FK
     * added to this table should surface as an explanation rather than as
     * Postgres grammar.
     */
    if (/foreign key|violates/i.test(msg)) {
      return {
        ok: false,
        error:
          "Something still references this entity and the database will not remove it. Deactivate the entity instead, or tell the team which record is holding it.",
      };
    }
    return { ok: false, error: `DB: ${msg}` };
  }

  // Objects last, best-effort — the rows are gone, so a storage hiccup leaves
  // unreferenced bytes rather than a half-deleted entity.
  if (files.length > 0) {
    await removeObjects(
      DOCUMENTS_BUCKET,
      files.map((f) => f.storagePath),
    );
  }

  await audit({
    // `targetId` is kept even though the row is gone: the audit trail's job is
    // to answer "what happened to entity X", and it cannot without the id.
    entityId: entity.id,
    entityName: entity.name,
    actorId: me.id,
    eventType: "entity_deleted",
    fromValue: { name: entity.name, files: files.length },
  });

  revalidatePath(PATH);
  return { ok: true };
}
