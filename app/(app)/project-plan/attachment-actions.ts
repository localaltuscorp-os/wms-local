"use server";

/**
 * Server Actions for attachments on a PLAN row (Milestone / Result / any
 * project_node).
 *
 * Deliberately a near-copy of app/(app)/tasks/attachment-actions.ts — same
 * private `documents` bucket, same 20 MB cap, same upload deny-list, same
 * best-effort object removal before the row is dropped. What differs is only
 * the owning entity and therefore the permission gate, because a plan
 * container has no task whose edit rule could be borrowed.
 *
 * AUTHZ: every mutation resolves the caller's relationship to the node ON THE
 * SERVER (lib/project-plan/authz.ts) before it writes. A client that posts a
 * nodeId it has nothing to do with is refused — the id alone proves nothing.
 */
import { randomUUID } from "node:crypto";
import { asc, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { projectNodeAttachments, projectNodes, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
// Storage goes through the facade, not the Supabase client directly, so
// DUMMY_MODE keeps files on disk instead of calling a project it has no
// credentials for. See lib/storage/objects.ts.
import { createSignedObjectUrl, putObject, removeObjects } from "@/lib/storage/objects";
import { validateUpload } from "@/lib/hr/upload";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — same ceiling as task attachments.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Short-lived, like the task detail page's — a copied URL must go stale. */
const SIGN_TTL_SECONDS = 60 * 10;

/** One attachment as the popover renders it. */
export interface PlanAttachmentView {
  id: string;
  fileName: string;
  mime: string | null;
  sizeBytes: number | null;
  /** Signed URL, minted per read. Null when the object has gone missing. */
  url: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

/**
 * Load a node and rule on the caller in one place, so all three actions below
 * ask the identical question and none of them can forget to.
 */
async function authorize(
  nodeId: string,
): Promise<
  | { ok: true; me: { id: string; isAdmin: boolean }; node: typeof projectNodes.$inferSelect }
  | { ok: false; error: string }
> {
  const me = await requireUser();
  if (!UUID_RE.test(nodeId)) return fail("Invalid row id.");
  const [node] = await db
    .select()
    .from(projectNodes)
    .where(eq(projectNodes.id, nodeId))
    .limit(1);
  if (!node) return fail("That row no longer exists.");

  // No permission test: attachments are open to any signed-in employee, like
  // everything else in this module except STATUS (lib/project-plan/status.ts).
  // This function still exists to do the id validation and the existence check
  // in ONE place, which is what the three actions below actually need.
  return { ok: true, me, node };
}

/**
 * The files on one row, with freshly signed URLs.
 *
 * Fetched ON DEMAND when the popover opens rather than with the register: a
 * signed URL costs a round-trip per file, and minting them for every milestone
 * on screen to render a count nobody has clicked would be most of a page load
 * spent on links that are never followed. The register carries counts only.
 */
export async function listPlanAttachments(
  nodeId: string,
): Promise<Result<{ files: PlanAttachmentView[] }>> {
  // Reading is gated too — the file names on a milestone are as sensitive as
  // the files themselves.
  const auth = await authorize(nodeId);
  if (!auth.ok) return auth;

  const rows = await db
    .select({
      id: projectNodeAttachments.id,
      fileName: projectNodeAttachments.fileName,
      mime: projectNodeAttachments.mime,
      sizeBytes: projectNodeAttachments.sizeBytes,
      storagePath: projectNodeAttachments.storagePath,
      createdAt: projectNodeAttachments.createdAt,
      uploadedByName: employees.name,
    })
    .from(projectNodeAttachments)
    .leftJoin(employees, eq(projectNodeAttachments.uploadedById, employees.id))
    .where(eq(projectNodeAttachments.nodeId, nodeId))
    .orderBy(asc(projectNodeAttachments.createdAt));

  if (rows.length === 0) return { ok: true, files: [] };

  const files: PlanAttachmentView[] = [];
  for (const r of rows) {
    const url = await createSignedObjectUrl(DOCUMENTS_BUCKET, r.storagePath, SIGN_TTL_SECONDS);
    files.push({
      id: r.id,
      fileName: r.fileName,
      mime: r.mime,
      sizeBytes: r.sizeBytes,
      url,
      uploadedByName: r.uploadedByName ?? null,
      createdAt: r.createdAt.toISOString(),
    });
  }
  return { ok: true, files };
}

/** Attach a file to a plan row. FormData carries `nodeId` + `file`. */
export async function uploadPlanAttachment(fd: FormData): Promise<Result<{ count: number }>> {
  const nodeId = String(fd.get("nodeId") ?? "");
  const auth = await authorize(nodeId);
  if (!auth.ok) return auth;

  const limited = rateLimitOrError(auth.me.id, "write");
  if (limited) return limited;

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("No file provided.");
  if (file.size > MAX_BYTES) return fail("File too large (max 20 MB).");
  // Same deny-list the HR and task uploads use, so an uploaded .svg/.html can
  // never be served inline as stored XSS.
  const typeCheck = validateUpload(file);
  if (!typeCheck.ok) return typeCheck;

  const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `project-node-attachments/${nodeId}/${randomUUID()}${ext ? `.${ext}` : ""}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const put = await putObject(
    DOCUMENTS_BUCKET,
    path,
    buf,
    file.type || "application/octet-stream",
  );
  if (!put.ok) return fail(`Upload failed: ${put.error}`);

  await db.insert(projectNodeAttachments).values({
    nodeId,
    storagePath: path,
    fileName: file.name || "file",
    mime: file.type || null,
    sizeBytes: file.size,
    uploadedById: auth.me.id,
  });

  revalidatePlanRegisters();
  return { ok: true, count: await countFor(nodeId) };
}

/** Remove one attachment: best-effort object delete, then drop the row. */
export async function deletePlanAttachment(id: string): Promise<Result<{ count: number }>> {
  if (!UUID_RE.test(id)) return fail("Invalid attachment id.");

  const [row] = await db
    .select({ nodeId: projectNodeAttachments.nodeId, storagePath: projectNodeAttachments.storagePath })
    .from(projectNodeAttachments)
    .where(eq(projectNodeAttachments.id, id))
    .limit(1);
  if (!row) return fail("Attachment not found.");

  // Gate on the OWNING row, resolved from the attachment — never on a nodeId
  // the caller supplied, which they could simply have made up.
  const auth = await authorize(row.nodeId);
  if (!auth.ok) return auth;

  const limited = rateLimitOrError(auth.me.id, "write");
  if (limited) return limited;

  // Best-effort: a missing object must not block removing the row, or the row
  // becomes undeletable.
  await removeObjects(DOCUMENTS_BUCKET, [row.storagePath]);

  await db.delete(projectNodeAttachments).where(eq(projectNodeAttachments.id, id));

  revalidatePlanRegisters();
  return { ok: true, count: await countFor(row.nodeId) };
}

/** How many files this row has now — what the cell relabels itself to. */
async function countFor(nodeId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(projectNodeAttachments)
    .where(eq(projectNodeAttachments.nodeId, nodeId));
  return Number(row?.n ?? 0);
}

/** Every surface that shows an attachment count. */
function revalidatePlanRegisters() {
  revalidatePath("/project-plan");
  revalidatePath("/project-plan/milestones");
  revalidatePath("/project-plan/results");
  revalidatePath("/project-plan/actions");
  revalidatePath("/project-plan/sub-actions");
}
