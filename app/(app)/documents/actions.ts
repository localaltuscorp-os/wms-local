"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { documents, documentEvents, type Document, type Employee } from "@/db/schema";

/** The columns document mutations actually need (see authorizeDocumentMutation). */
type DocCore = Pick<
  Document,
  "id" | "title" | "description" | "storagePath" | "mimeType" | "sizeBytes" | "uploadedById"
>;
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const TitleSchema = z.string().trim().min(1, "Title is required").max(200, "Title too long");
const DescSchema = z.string().trim().max(2000).optional();
const MAX_BYTES = 25 * 1024 * 1024;

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

/**
 * Phase 3.5 — write an append-only audit row for every document mutation.
 * Swallow-and-warn so a logging failure never crashes the mutation that
 * already succeeded. `documentTitle` is snapshotted so a delete-event
 * still reads sensibly after the document row is gone.
 */
async function logDocEvent(input: {
  documentId: string | null;
  documentTitle: string;
  actorId: string;
  eventType: "created" | "renamed" | "description_changed" | "file_replaced" | "deleted";
  fromValue?: unknown;
  toValue?: unknown;
}): Promise<void> {
  try {
    await db.insert(documentEvents).values({
      documentId: input.documentId,
      documentTitle: input.documentTitle,
      actorId: input.actorId,
      eventType: input.eventType,
      fromValue: (input.fromValue ?? null) as never,
      toValue: (input.toValue ?? null) as never,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[documents] audit write failed", err);
  }
}

/**
 * Loads a document and asserts the caller is allowed to mutate it.
 * Permission rule: uploader OR admin. The previous implementation only
 * checked `requireUser()` — any signed-in user could PATCH another
 * user's document by guessing the UUID.
 *
 * Returns the doc row on success, a Result-shaped error otherwise so
 * the caller can `return` it directly without further work.
 */
async function authorizeDocumentMutation(
  id: string,
  me: Employee,
): Promise<{ ok: true; doc: DocCore } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid id" };
  }
  // EXPLICIT column list — never a bare findFirst/select on `documents`: the
  // schema carries migration-0142 columns (goal_id / weekly_goal_id) that may
  // be unapplied in prod, and enumerating them would 500 every mutation here.
  const [doc] = await db
    .select({
      id: documents.id,
      title: documents.title,
      description: documents.description,
      storagePath: documents.storagePath,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      uploadedById: documents.uploadedById,
    })
    .from(documents)
    .where(eq(documents.id, id))
    .limit(1);
  if (!doc) return { ok: false, error: "Document not found" };
  if (!me.isAdmin && doc.uploadedById !== me.id) {
    return { ok: false, error: "Forbidden" };
  }
  return { ok: true, doc };
}

/**
 * Server-side guard against the obvious dangerous uploads. The client
 * passes `file.type` verbatim, which a malicious caller can spoof —
 * but it's still useful as a coarse first filter, paired with an
 * extension deny-list on the filename (which is harder to lie about
 * without it looking suspicious to a human admin reviewing later).
 *
 * NOT a substitute for magic-byte sniffing; if document integrity
 * matters more, layer a `file-type` check on top of this.
 */
const DISALLOWED_EXTENSIONS =
  /\.(exe|com|cmd|bat|msi|scr|pif|vbs|js|mjs|cjs|jar|sh|bash|app|dmg|ps1|psm1|reg|hta|cpl|gadget|html?|xhtml|svgz?)$/i;
const DISALLOWED_MIME_TYPES = new Set<string>([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-mach-binary",
  "application/vnd.microsoft.portable-executable",
  "application/x-sh",
  "application/x-shellscript",
  "text/x-shellscript",
  // Inline-renderable types — served from the signed-URL storage domain they
  // would execute script (stored XSS). Block at upload so they never land.
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
]);

function validateUploadShape(file: File): { ok: true } | { ok: false; error: string } {
  if (DISALLOWED_EXTENSIONS.test(file.name)) {
    return { ok: false, error: "This file type is not allowed." };
  }
  if (file.type && DISALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, error: "This file type is not allowed." };
  }
  return { ok: true };
}

export async function uploadDocument(form: FormData): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const titleRes = TitleSchema.safeParse(form.get("title"));
  if (!titleRes.success) return { ok: false, error: titleRes.error.issues[0]!.message };
  const descRes = DescSchema.safeParse(form.get("description") ?? undefined);
  if (!descRes.success) return { ok: false, error: "Description too long" };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pick a file to upload." };
  }
  if (file.size > MAX_BYTES) return { ok: false, error: "File exceeds 25 MB." };
  const shape = validateUploadShape(file);
  if (!shape.ok) return shape;

  const path = `${crypto.randomUUID()}/${safeName(file.name)}`;
  const admin = getSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  let inserted;
  try {
    [inserted] = await db
      .insert(documents)
      .values({
        title: titleRes.data,
        description: descRes.data ?? null,
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
  await logDocEvent({
    documentId: inserted.id,
    documentTitle: titleRes.data,
    actorId: me.id,
    eventType: "created",
    toValue: { title: titleRes.data, description: descRes.data ?? null, mimeType: file.type || null, sizeBytes: file.size },
  });
  revalidatePath("/documents");
  return { ok: true, id: inserted.id };
}

export async function updateDocument(
  id: string,
  fields: { title?: string; description?: string | null },
): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const auth = await authorizeDocumentMutation(id, me);
  if (!auth.ok) return auth;

  const patch: { title?: string; description?: string | null; updatedAt: Date } = { updatedAt: new Date() };
  if (fields.title !== undefined) {
    const t = TitleSchema.safeParse(fields.title);
    if (!t.success) return { ok: false, error: t.error.issues[0]!.message };
    patch.title = t.data;
  }
  if (fields.description !== undefined) {
    patch.description = fields.description ? fields.description.trim().slice(0, 2000) : null;
  }
  // Belt-and-braces: even though authorizeDocumentMutation already
  // checked ownership, scope the WHERE so a concurrent ownership
  // transfer between the auth check and this UPDATE can't escalate.
  await db
    .update(documents)
    .set(patch)
    .where(
      me.isAdmin
        ? eq(documents.id, id)
        : and(eq(documents.id, id), eq(documents.uploadedById, me.id)),
    );

  // Emit audit rows for whichever fields actually changed.
  const titleChanged = patch.title !== undefined && patch.title !== auth.doc.title;
  const descChanged =
    patch.description !== undefined && (patch.description ?? null) !== (auth.doc.description ?? null);
  if (titleChanged) {
    await logDocEvent({
      documentId: id,
      documentTitle: patch.title ?? auth.doc.title,
      actorId: me.id,
      eventType: "renamed",
      fromValue: { title: auth.doc.title },
      toValue: { title: patch.title },
    });
  }
  if (descChanged) {
    await logDocEvent({
      documentId: id,
      documentTitle: patch.title ?? auth.doc.title,
      actorId: me.id,
      eventType: "description_changed",
      fromValue: { description: auth.doc.description },
      toValue: { description: patch.description },
    });
  }

  revalidatePath("/documents");
  return { ok: true };
}

export async function replaceDocumentFile(id: string, form: FormData): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const auth = await authorizeDocumentMutation(id, me);
  if (!auth.ok) return auth;

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pick a file." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File exceeds 25 MB." };
  const shape = validateUploadShape(file);
  if (!shape.ok) return shape;

  const admin = getSupabaseAdmin();
  const path = `${crypto.randomUUID()}/${safeName(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream" });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  await db
    .update(documents)
    .set({ storagePath: path, mimeType: file.type || null, sizeBytes: file.size, updatedAt: new Date() })
    .where(
      me.isAdmin
        ? eq(documents.id, id)
        : and(eq(documents.id, id), eq(documents.uploadedById, me.id)),
    );
  await logDocEvent({
    documentId: id,
    documentTitle: auth.doc.title,
    actorId: me.id,
    eventType: "file_replaced",
    fromValue: { storagePath: auth.doc.storagePath, mimeType: auth.doc.mimeType, sizeBytes: auth.doc.sizeBytes },
    toValue: { storagePath: path, mimeType: file.type || null, sizeBytes: file.size },
  });
  // Best-effort cleanup of the old object.
  await admin.storage.from(DOCUMENTS_BUCKET).remove([auth.doc.storagePath]).catch(() => {});
  revalidatePath("/documents");
  return { ok: true };
}

export async function deleteDocument(id: string): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const auth = await authorizeDocumentMutation(id, me);
  // Distinguish "not there" from "forbidden" so the UI can show the
  // right message — the prior code returned ok:true on missing rows,
  // which silently masked permission denials.
  if (!auth.ok) return auth;

  const admin = getSupabaseAdmin();
  await admin.storage.from(DOCUMENTS_BUCKET).remove([auth.doc.storagePath]).catch(() => {});
  await db
    .delete(documents)
    .where(
      me.isAdmin
        ? eq(documents.id, id)
        : and(eq(documents.id, id), eq(documents.uploadedById, me.id)),
    );
  // Write the audit row AFTER the delete (documentId becomes a dangling
  // ref but the row's set-null FK keeps it pointing at NULL cleanly;
  // documentTitle is the persistent label).
  await logDocEvent({
    documentId: null,
    documentTitle: auth.doc.title,
    actorId: me.id,
    eventType: "deleted",
    fromValue: { id, title: auth.doc.title, storagePath: auth.doc.storagePath },
  });
  revalidatePath("/documents");
  return { ok: true };
}
