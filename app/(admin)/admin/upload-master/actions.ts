"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { settingsEvents, templateFiles } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { requireModuleEdit } from "@/lib/permissions/resolve";
import { afterResponse } from "@/lib/after";
import { DOCUMENTS_BUCKET, storageErrorMessage } from "@/lib/supabase/admin";
import { putObject, removeObjects } from "@/lib/storage/objects";
import { safeFileName, validateUpload } from "@/lib/hr/upload";
import { XLSX_CONTENT_TYPE, templateDef } from "@/lib/templates/registry";

/**
 * UPLOAD MASTER — replace / delete the bulk-import template files.
 *
 * The files live in DOCUMENTS_BUCKET under a `templates/<key>/<uuid>/` prefix,
 * and the `template_files` row is the record of where the override lives. The
 * download routes resolve "override if present, else built-in", so a replace
 * applies sitewide the moment the row commits.
 */

const NODE = "admin.masters.upload-master";
const PATH = "/admin/upload-master";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

async function audit(actorId: string, eventType: string, note: string): Promise<void> {
  try {
    await db.insert(settingsEvents).values({
      scope: "template_files",
      targetId: null,
      actorId,
      eventType,
      fromValue: null,
      toValue: null,
      note,
    });
  } catch (err) {
    console.warn("[upload-master] audit write failed", err);
  }
}

/**
 * Upload a replacement template for one key.
 *
 * The previous override's object (if any) is removed AFTER the new row commits,
 * best-effort — the database row is the record, and a stray object is worse than
 * a broken reference.
 */
export async function uploadTemplate(form: FormData): Promise<ActionResult<{ key: string }>> {
  const me = await requireAdmin();
  await requireModuleEdit(NODE);
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const keyRaw = form.get("key");
  const key = typeof keyRaw === "string" ? keyRaw : "";
  const def = templateDef(key);
  if (!def) return { ok: false, error: "Unknown template." };

  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Pick a file to upload." };
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, error: "Upload a .xlsx template file." };
  const shape = validateUpload(file);
  if (!shape.ok) return { ok: false, error: shape.error };

  const storagePath = `templates/${key}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
  const contentType = file.type || XLSX_CONTENT_TYPE;
  const buffer = Buffer.from(await file.arrayBuffer());

  const put = await putObject(DOCUMENTS_BUCKET, storagePath, buffer, contentType);
  if (!put.ok) return { ok: false, error: storageErrorMessage(put.error) };

  let previousPath: string | null = null;
  try {
    const existing = await db
      .select({ storagePath: templateFiles.storagePath })
      .from(templateFiles)
      .where(eq(templateFiles.key, key))
      .limit(1);

    const current = existing[0];
    if (current) {
      previousPath = current.storagePath;
      await db
        .update(templateFiles)
        .set({
          storagePath,
          contentType,
          fileName: safeFileName(file.name),
          fileSize: file.size,
          updatedById: me.id,
          updatedAt: new Date(),
        })
        .where(eq(templateFiles.key, key));
    } else {
      await db.insert(templateFiles).values({
        key,
        storagePath,
        contentType,
        fileName: safeFileName(file.name),
        fileSize: file.size,
        updatedById: me.id,
      });
    }
  } catch (err: unknown) {
    // DB write failed — drop the just-uploaded object so it does not orphan.
    await removeObjects(DOCUMENTS_BUCKET, [storagePath]);
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (previousPath) {
    afterResponse(() => removeObjects(DOCUMENTS_BUCKET, [previousPath]));
  }
  await audit(me.id, "template_replaced", def.name);
  revalidatePath(PATH);
  return { ok: true, key };
}

/**
 * Delete the overrides for one or more keys, reverting them to built-in.
 *
 * Skips keys with no override; reports what actually changed.
 */
export async function deleteTemplates(keys: string[]): Promise<ActionResult<{ deleted: number }>> {
  const me = await requireAdmin();
  await requireModuleEdit(NODE);
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!Array.isArray(keys) || keys.length === 0) return { ok: false, error: "Pick templates to delete." };
  const valid = keys.filter((k) => templateDef(k));
  if (valid.length === 0) return { ok: false, error: "Unknown template." };

  const toDelete = await db
    .select({ key: templateFiles.key, storagePath: templateFiles.storagePath })
    .from(templateFiles)
    .where(inArray(templateFiles.key, valid));

  if (toDelete.length > 0) {
    await db.delete(templateFiles).where(inArray(templateFiles.key, toDelete.map((t) => t.key)));
    await removeObjects(DOCUMENTS_BUCKET, toDelete.map((t) => t.storagePath));
  }

  await audit(me.id, "template_deleted", toDelete.map((t) => t.key).join(", ") || "(none)");
  revalidatePath(PATH);
  return { ok: true, deleted: toDelete.length };
}
