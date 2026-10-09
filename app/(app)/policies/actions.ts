"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { documents } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { hrSupportEnabled } from "@/lib/hr/flag";
import {
  encodeOtherPolicyCategory,
  encodePolicyOriginalFileName,
  isPolicyCategory,
} from "@/lib/hr/policy-types";
import { POLICY_STORAGE_PREFIX, policyStoragePath } from "@/lib/hr/sections";
import { canPublishPolicies } from "@/lib/hr/policies/access";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { safeFileName, validateUpload } from "@/lib/hr/upload";
import { putObject, removeObjects } from "@/lib/storage/objects";
import type { Employee } from "@/db/schema";
import type { PolicyCategory } from "@/lib/hr/policy-types";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const TitleSchema = z.string().trim().min(1, "Give the policy a title").max(200, "Title too long");

/**
 * Policies are company-wide to READ and narrow to WRITE: HR staff and
 * super-admins publish or remove one (lib/hr/policies/access.ts). It was an
 * `isAdmin || isSuperAdmin` check until 2026-09-17 — more people hold the admin
 * flag than should hold the pen — and three named people until 2026-09-21, which
 * meant a deploy to change who they were.
 */
async function canPublish(me: Employee): Promise<boolean> {
  return await canPublishPolicies(me, DUMMY_MODE);
}

/** Upload one policy document. FormData: title, category, description?, file. */
export async function uploadPolicy(form: FormData): Promise<Result<{ id: string }>> {
  if (!hrSupportEnabled()) return { ok: false, error: "HR module is off." };
  const me = await requireUser();
  if (!(await canPublish(me))) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const titleRes = TitleSchema.safeParse(form.get("title"));
  if (!titleRes.success) return { ok: false, error: titleRes.error.issues[0]!.message };

  const category = String(form.get("category") ?? "");
  if (!isPolicyCategory(category)) return { ok: false, error: "Pick a category." };

  const descriptionInput = String(form.get("description") ?? "")
    .trim()
    // Reserve marker space when Other carries its user-facing category label.
    .slice(0, category === "other" ? 1880 : 2000);
  const otherCategory = String(form.get("otherCategory") ?? "").trim().replace(/\s+/g, " ");
  if (category === "other" && (!otherCategory || otherCategory.length > 80)) {
    return { ok: false, error: "Enter an Other category name (up to 80 characters)." };
  }
  const describedCategory = category === "other"
    ? encodeOtherPolicyCategory(descriptionInput, otherCategory)
    : descriptionInput || null;

  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Pick a file to upload." };
  const shape = validateUpload(file);
  if (!shape.ok) return shape;

  const path = policyStoragePath(category as PolicyCategory, crypto.randomUUID(), safeFileName(file.name));
  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await putObject(DOCUMENTS_BUCKET, path, buffer, file.type || "application/octet-stream");
  if (!upload.ok) return { ok: false, error: `Upload failed: ${upload.error}` };
  const description = encodePolicyOriginalFileName(describedCategory, file.name);

  let inserted;
  try {
    // Explicit column list only — never touch the 0142 goal/weekly columns.
    [inserted] = await db
      .insert(documents)
      .values({
        title: titleRes.data,
        description,
        storagePath: path,
        mimeType: file.type || null,
        sizeBytes: file.size,
        uploadedById: me.id,
      })
      .returning({ id: documents.id });
  } catch (err) {
    await removeObjects(DOCUMENTS_BUCKET, [path]).catch(() => {});
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!inserted) return { ok: false, error: "Insert returned no row" };

  revalidatePath("/policies");
  return { ok: true, id: inserted.id };
}

/** Delete a policy document. Guards the hr-policies/ prefix so this
 *  can never remove an unrelated document-library row. */
export async function deletePolicy(id: string): Promise<Result> {
  if (!hrSupportEnabled()) return { ok: false, error: "HR module is off." };
  const me = await requireUser();
  if (!(await canPublish(me))) return { ok: false, error: "Forbidden" };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };

  const [row] = await db
    .select({ id: documents.id, storagePath: documents.storagePath })
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Policy not found" };
  if (!row.storagePath.startsWith(POLICY_STORAGE_PREFIX)) {
    return { ok: false, error: "Not a policy document." };
  }

  await removeObjects(DOCUMENTS_BUCKET, [row.storagePath]).catch(() => {});
  // Delete guarded by the prefix as well, so a bad id can't reach other rows.
  await db.delete(documents).where(eq(documents.id, id));
  revalidatePath("/policies");
  return { ok: true };
}
