"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { employeeDocuments, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { isDossierDocType } from "@/lib/dossier/types";
import type { Employee } from "@/db/schema";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_BYTES = 25 * 1024 * 1024;
const TitleSchema = z.string().trim().min(1, "Title is required").max(200, "Title too long");

// Same upload deny-list as the document library: block executables + inline-
// renderable types that would run script from the signed-URL storage domain.
const DISALLOWED_EXTENSIONS =
  /\.(exe|com|cmd|bat|msi|scr|pif|vbs|js|mjs|cjs|jar|sh|bash|app|dmg|ps1|psm1|reg|hta|cpl|gadget|html?|xhtml|svgz?)$/i;
const DISALLOWED_MIME_TYPES = new Set<string>([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-sh",
  "application/x-shellscript",
  "text/x-shellscript",
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
]);

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

function validateUploadShape(file: File): { ok: true } | { ok: false; error: string } {
  if (DISALLOWED_EXTENSIONS.test(file.name)) return { ok: false, error: "This file type is not allowed." };
  if (file.type && DISALLOWED_MIME_TYPES.has(file.type)) return { ok: false, error: "This file type is not allowed." };
  return { ok: true };
}

/** Dossier writes are admin-only (employees are read-only on their own file). */
function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/**
 * Upload one document into an employee's dossier. Admin-only. Expects FormData:
 * employeeId, docType, title, effectiveDate?, notes?, file.
 */
export async function uploadEmployeeDocument(form: FormData): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const employeeId = String(form.get("employeeId") ?? "");
  if (!z.string().uuid().safeParse(employeeId).success) return { ok: false, error: "Pick an employee." };

  const docType = String(form.get("docType") ?? "");
  if (!isDossierDocType(docType)) return { ok: false, error: "Unknown document type." };

  const titleRes = TitleSchema.safeParse(form.get("title"));
  if (!titleRes.success) return { ok: false, error: titleRes.error.issues[0]!.message };

  const effRaw = String(form.get("effectiveDate") ?? "").trim();
  const effectiveDate = effRaw && /^\d{4}-\d{2}-\d{2}$/.test(effRaw) ? effRaw : null;
  const notes = String(form.get("notes") ?? "").trim().slice(0, 2000) || null;

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pick a file to upload." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File exceeds 25 MB." };
  const shape = validateUploadShape(file);
  if (!shape.ok) return shape;

  // Confirm the employee exists (FK would catch it, but a clean message is nicer).
  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!emp) return { ok: false, error: "Employee not found." };

  const path = `dossier/${employeeId}/${crypto.randomUUID()}/${safeName(file.name)}`;
  const admin = getSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  let inserted;
  try {
    [inserted] = await db
      .insert(employeeDocuments)
      .values({
        employeeId,
        docType,
        title: titleRes.data,
        effectiveDate,
        storagePath: path,
        fileName: file.name.slice(0, 200),
        mimeType: file.type || null,
        sizeBytes: file.size,
        notes,
        uploadedById: me.id,
      })
      .returning({ id: employeeDocuments.id });
  } catch (err) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!inserted) return { ok: false, error: "Insert returned no row" };

  revalidatePath("/dossier");
  return { ok: true, id: inserted.id };
}

async function loadOwned(id: string): Promise<{ ok: true; row: typeof employeeDocuments.$inferSelect } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };
  const row = await db.query.employeeDocuments.findFirst({ where: eq(employeeDocuments.id, id) });
  if (!row) return { ok: false, error: "Document not found" };
  return { ok: true, row };
}

export async function updateEmployeeDocument(
  id: string,
  fields: { title?: string; effectiveDate?: string | null; notes?: string | null; docType?: string },
): Promise<Result> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const found = await loadOwned(id);
  if (!found.ok) return found;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (fields.title !== undefined) {
    const t = TitleSchema.safeParse(fields.title);
    if (!t.success) return { ok: false, error: t.error.issues[0]!.message };
    patch.title = t.data;
  }
  if (fields.effectiveDate !== undefined) {
    const e = (fields.effectiveDate ?? "").trim();
    patch.effectiveDate = e && /^\d{4}-\d{2}-\d{2}$/.test(e) ? e : null;
  }
  if (fields.notes !== undefined) {
    patch.notes = fields.notes ? fields.notes.trim().slice(0, 2000) : null;
  }
  if (fields.docType !== undefined) {
    if (!isDossierDocType(fields.docType)) return { ok: false, error: "Unknown document type." };
    patch.docType = fields.docType;
  }

  await db.update(employeeDocuments).set(patch).where(eq(employeeDocuments.id, id));
  revalidatePath("/dossier");
  return { ok: true };
}

export async function setEmployeeDocumentArchived(id: string, archived: boolean): Promise<Result> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const found = await loadOwned(id);
  if (!found.ok) return found;
  await db
    .update(employeeDocuments)
    .set({ archived, updatedAt: new Date() })
    .where(eq(employeeDocuments.id, id));
  revalidatePath("/dossier");
  return { ok: true };
}

export async function deleteEmployeeDocument(id: string): Promise<Result> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const found = await loadOwned(id);
  if (!found.ok) return found;

  await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).remove([found.row.storagePath]).catch(() => {});
  await db.delete(employeeDocuments).where(eq(employeeDocuments.id, id));
  revalidatePath("/dossier");
  return { ok: true };
}
