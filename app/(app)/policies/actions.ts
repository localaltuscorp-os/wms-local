"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { documents } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { isPolicyCategory } from "@/lib/hr/policy-types";
import { POLICY_STORAGE_PREFIX, policyStoragePath } from "@/lib/hr/sections";
import { safeFileName, validateUpload } from "@/lib/hr/upload";
import type { Employee } from "@/db/schema";
import type { PolicyCategory } from "@/lib/hr/policy-types";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const TitleSchema = z.string().trim().min(1, "Give the policy a title").max(200, "Title too long");

/** Policies are company-wide; only admins/super-admins upload or remove them. */
function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/** Upload one policy document. Admin-only. FormData: title, category, description?, file. */
export async function uploadPolicy(form: FormData): Promise<Result<{ id: string }>> {
  if (!hrSupportEnabled()) return { ok: false, error: "HR module is off." };
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const titleRes = TitleSchema.safeParse(form.get("title"));
  if (!titleRes.success) return { ok: false, error: titleRes.error.issues[0]!.message };

  const category = String(form.get("category") ?? "");
  if (!isPolicyCategory(category)) return { ok: false, error: "Pick a category." };

  const description = String(form.get("description") ?? "").trim().slice(0, 2000) || null;

  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Pick a file to upload." };
  const shape = validateUpload(file);
  if (!shape.ok) return shape;

  const path = policyStoragePath(category as PolicyCategory, crypto.randomUUID(), safeFileName(file.name));
  const admin = getSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

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
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!inserted) return { ok: false, error: "Insert returned no row" };

  revalidatePath("/policies");
  return { ok: true, id: inserted.id };
}

/** Delete a policy document (admin-only). Guards the hr-policies/ prefix so this
 *  can never remove an unrelated document-library row. */
export async function deletePolicy(id: string): Promise<Result> {
  if (!hrSupportEnabled()) return { ok: false, error: "HR module is off." };
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
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

  await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).remove([row.storagePath]).catch(() => {});
  // Delete guarded by the prefix as well, so a bad id can't reach other rows.
  await db.delete(documents).where(eq(documents.id, id));
  revalidatePath("/policies");
  return { ok: true };
}
