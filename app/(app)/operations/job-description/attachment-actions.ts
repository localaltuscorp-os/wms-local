"use server";

/**
 * SOP FILES ON A JOB DESCRIPTION — upload, attach, delete.
 *
 * The reimbursement documents' design (app/(app)/reimbursements/
 * attachment-actions.ts), not a second one:
 *
 *   1. `createJdUploadUrl` mints the object path (under the caller's own
 *      prefix) and a signed upload URL; the BROWSER puts the bytes straight to
 *      Storage, so a file never rides a size-capped serverless request.
 *   2. The refs `{ kind, path, fileName, size }` come back — to `createJdEntry`
 *      when the JD is new, or to `attachJdFiles` when it already exists — and
 *      each becomes a `jd_attachments` row.
 *
 * DUMMY_MODE has no Storage to sign against, so step 1 answers `direct: false`
 * and the bytes go through `uploadJdFileDirect`, which writes to
 * `.dummy-storage` (lib/storage/objects.ts) and is refused outside dummy mode.
 *
 * WRITING IS HR STAFF ONLY, like every other JD write (actions.ts); opening a
 * file is anyone's who can read the Bank (app/api/jd/attachments/[id]).
 */

import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { jdAttachments, jdEntries } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { DOCUMENTS_BUCKET, getSupabaseAdmin, storageErrorMessage } from "@/lib/supabase/admin";
import { removeObjects } from "@/lib/storage/objects";
import {
  JD_MAX_FILES_PER_KIND,
  JD_ATTACHMENT_META,
  buildJdAttachmentRows,
  checkJdFile,
  employeeIdFromJdPath,
  isJdAttachmentKind,
  jdObjectPrefix,
  resolvedJdMime,
  safeObjectName,
  type JdUploadRef,
} from "@/lib/jd/attachments";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateJd() {
  revalidatePath("/operations/job-description");
  revalidatePath("/operations/masters", "layout");
}

/** A signed target the browser uploads ONE file to. */
export async function createJdUploadUrl(input: {
  kind: string;
  fileName: string;
  size: number;
}): Promise<Result<{ direct: boolean; bucket: string; path: string; token: string | null }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!isJdAttachmentKind(input.kind)) return fail("Unknown attachment box.");
  const fileName = String(input.fileName ?? "");
  const check = checkJdFile(input.kind, { name: fileName, size: Number(input.size ?? 0) });
  if (!check.ok) return check;

  // A fresh uuid per file: two "SOP.pdf" uploads cannot collide or overwrite.
  const path = `${jdObjectPrefix(me.id)}/${randomUUID()}/${safeObjectName(fileName)}`;
  if (DUMMY_MODE) return { ok: true, direct: false, bucket: DOCUMENTS_BUCKET, path, token: null };

  try {
    const { data, error } = await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return fail(storageErrorMessage(error?.message ?? "Could not start the upload."));
    return { ok: true, direct: true, bucket: DOCUMENTS_BUCKET, path, token: data.token };
  } catch (err) {
    return fail(storageErrorMessage(err instanceof Error ? err.message : String(err)));
  }
}

/** LOCAL-DEV ONLY — the bytes through the server, when there is no Storage to sign against. */
export async function uploadJdFileDirect(fd: FormData): Promise<Result<{ path: string }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!DUMMY_MODE) return fail("Uploads must go straight to file storage. Reload the page and try again.");

  const file = fd.get("file");
  const kind = String(fd.get("kind") ?? "");
  const path = String(fd.get("path") ?? "");
  if (!(file instanceof File)) return fail("No file provided.");
  if (!isJdAttachmentKind(kind)) return fail("Unknown attachment box.");
  const check = checkJdFile(kind, { name: file.name, size: file.size });
  if (!check.ok) return check;
  if (employeeIdFromJdPath(path) !== me.id) return fail("Invalid upload target.");

  const { putObject } = await import("@/lib/storage/objects");
  const put = await putObject(
    DOCUMENTS_BUCKET,
    path,
    Buffer.from(await file.arrayBuffer()),
    resolvedJdMime(kind, file.name) ?? "application/octet-stream",
  );
  if (!put.ok) return fail(storageErrorMessage(put.error));
  return { ok: true, path };
}

/**
 * Throw away an upload that was never saved — the × on a file in the New JD
 * form. Only the caller's own path, and only if no JD points at it yet.
 */
export async function discardJdUpload(path: string): Promise<Result> {
  const me = await requireHrStaff();
  if (employeeIdFromJdPath(String(path ?? "")) !== me.id) return fail("Invalid upload.");
  const used = await db
    .select({ id: jdAttachments.id })
    .from(jdAttachments)
    .where(eq(jdAttachments.storagePath, path))
    .limit(1);
  if (used.length > 0) return fail("That file is already saved on a job description.");
  await removeObjects(DOCUMENTS_BUCKET, [path]);
  return { ok: true };
}

/** Add files to a job description that already exists (the detail drawer). */
export async function attachJdFiles(input: { jdId: string; refs: JdUploadRef[] }): Promise<Result<{ count: number }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const jdId = String(input.jdId ?? "");
  if (!UUID_RE.test(jdId)) return fail("Invalid job description.");
  const [jd] = await db.select({ id: jdEntries.id }).from(jdEntries).where(eq(jdEntries.id, jdId)).limit(1);
  if (!jd) return fail("That job description no longer exists.");

  const built = buildJdAttachmentRows(input.refs ?? [], me.id, jdId);
  if (!built.ok) return built;
  if (built.rows.length === 0) return fail("No files to attach.");

  // The per-box limit counts what is already there.
  for (const kind of new Set(built.rows.map((r) => r.kind))) {
    const [counted] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(jdAttachments)
      .where(and(eq(jdAttachments.jdId, jdId), eq(jdAttachments.kind, kind)));
    const adding = built.rows.filter((r) => r.kind === kind).length;
    if ((counted?.n ?? 0) + adding > JD_MAX_FILES_PER_KIND) {
      return fail(`${JD_ATTACHMENT_META[kind].title} can hold at most ${JD_MAX_FILES_PER_KIND} files.`);
    }
  }

  await db.insert(jdAttachments).values(built.rows);
  revalidateJd();
  return { ok: true, count: built.rows.length };
}

/** Delete one saved file: best-effort object removal, then the row. */
export async function deleteJdAttachment(id: string): Promise<Result> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID_RE.test(String(id ?? ""))) return fail("Invalid attachment.");

  const [row] = await db
    .select({ storagePath: jdAttachments.storagePath })
    .from(jdAttachments)
    .where(eq(jdAttachments.id, id))
    .limit(1);
  if (!row) return fail("That file is already gone.");

  // The row is the record; a stray object left behind is harmless.
  await removeObjects(DOCUMENTS_BUCKET, [row.storagePath]).catch(() => {});
  await db.delete(jdAttachments).where(eq(jdAttachments.id, id));
  revalidateJd();
  return { ok: true };
}
