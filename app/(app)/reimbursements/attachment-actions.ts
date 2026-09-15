"use server";

/**
 * Server Actions for reimbursement DOCUMENTS.
 *
 * ── THE UPLOAD PATH DELIBERATELY AVOIDS THIS SERVER ────────────────────────
 * `createClaimUploadUrl` hands the browser a short-lived SIGNED UPLOAD URL for
 * a path it picks, and the browser PUTs the bytes straight to Supabase Storage.
 * The file never enters a Next.js request. That is not a micro-optimisation:
 *
 *   · On Vercel the serverless request body is capped (a few MB) well below a
 *     phone photo of a bill, so a receipt posted through a Server Action would
 *     simply fail — and fail for exactly the largest, most legitimate files.
 *   · Vercel's filesystem is ephemeral, so nothing written there survives the
 *     next deploy or even the next cold start.
 *
 * So Vercel handles the METADATA (this row, the permission check, the signed
 * link) and Supabase holds the DOCUMENT. Same private `documents` bucket the
 * task and project-plan attachments already use, reached through
 * lib/storage/objects.ts so DUMMY_MODE keeps working offline.
 *
 * ── AUTHORIZATION ──────────────────────────────────────────────────────────
 * Every action resolves the caller's relationship to the claim ON THE SERVER
 * before it reads or writes. A submission id proves nothing by itself: reading
 * a claim's files requires owning the claim or being an admin, and the object
 * path is re-checked against the caller's own prefix on the way in, so a client
 * cannot staple somebody else's receipt to its claim by echoing back a path.
 */

import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { employees, moduleSubmissionAttachments, moduleSubmissions } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { DOCUMENTS_BUCKET, getSupabaseAdmin, storageErrorMessage } from "@/lib/supabase/admin";
import { createSignedObjectUrl, removeObjects } from "@/lib/storage/objects";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import {
  canViewClaimDocuments,
  claimChangeRefusal,
} from "@/lib/reimbursements/claim-access";
import {
  buildClaimAttachmentRows,
  type ClaimUploadRef,
} from "@/lib/reimbursements/attachment-rows";
import {
  CLAIM_MAX_FILES,
  checkClaimFile,
  claimObjectPrefix,
  employeeIdFromClaimPath,
  isInlineViewable,
  isThumbnailable,
  legacyBillKind,
  resolvedMimeFor,
  safeObjectName,
} from "@/lib/reimbursements/attachment-rules";

// The upload-ref shape lives with the vetting logic; re-exported so the client
// components that build refs can import it from the actions they call.
export type { ClaimUploadRef };

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Signed-read TTL. Short on purpose: a copied link should go stale rather than
 * become a permanent unauthenticated door to a receipt. Matches the task and
 * plan attachment surfaces.
 */
const SIGN_TTL_SECONDS = 60 * 10;

/** One attachment as the claim card renders it. */
export interface ClaimAttachmentView {
  id: string;
  fileName: string;
  /** The type WE resolved from the extension — never the uploader's claim. */
  mime: string | null;
  sizeBytes: number | null;
  /** Freshly signed URL, minted per read. Null when the object has gone. */
  url: string | null;
  /** Opens in a tab (image / PDF) rather than downloading. */
  inline: boolean;
  /** Safe to show as an <img> preview. */
  thumbnail: boolean;
  uploadedByName: string | null;
  createdAt: string;
  /**
   * A pre-upload bill, surfaced from `fields.bill_url` rather than from an
   * attachment row — so it has no id to delete and no metadata beyond its path.
   */
  legacy?: boolean;
}

/* ────────────────────────────────────────────────────────────────────────────
   1. Mint an upload target
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * A signed URL the BROWSER uploads one claim document to.
 *
 * The path is built here, under the caller's OWN prefix, so the client can
 * choose neither the bucket nor whose folder the object lands in. The file is
 * vetted by name and size before a token is issued — there is no point handing
 * out a token for a file that will be refused on submit.
 *
 * DUMMY_MODE has no Supabase to sign against, so it returns `direct: false` and
 * the caller falls back to posting the bytes through `uploadClaimFileDirect`
 * below. That fallback is a LOCAL-DEV path only; see its own note.
 */
export async function createClaimUploadUrl(input: {
  fileName: string;
  mime?: string | null;
  size?: number;
}): Promise<
  Result<{ direct: boolean; bucket: string; path: string; token: string | null }>
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const fileName = String(input.fileName ?? "");
  const check = checkClaimFile({ name: fileName, size: Number(input.size ?? 0) });
  if (!check.ok) return check;

  // `randomUUID()` per file, so two uploads of "receipt.pdf" cannot collide and
  // no upload can overwrite an existing object.
  const path = `${claimObjectPrefix(me.id)}/${randomUUID()}/${safeObjectName(fileName)}`;

  if (DUMMY_MODE) {
    return { ok: true, direct: false, bucket: DOCUMENTS_BUCKET, path, token: null };
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(DOCUMENTS_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return fail(storageErrorMessage(error?.message ?? "Could not start the upload."));
    }
    return { ok: true, direct: true, bucket: DOCUMENTS_BUCKET, path, token: data.token };
  } catch (err) {
    return fail(storageErrorMessage(err instanceof Error ? err.message : String(err)));
  }
}

/**
 * LOCAL-DEV FALLBACK ONLY — post the bytes through the server.
 *
 * Reached solely when `createClaimUploadUrl` reported `direct: false`, which
 * only happens in DUMMY_MODE, where there is no Supabase project to sign
 * against and lib/storage/objects.ts writes to disk instead. Refused outright
 * otherwise, so a misbehaving client cannot opt into routing production
 * receipts through the app server — the thing this design exists to avoid.
 */
export async function uploadClaimFileDirect(fd: FormData): Promise<Result<{ path: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!DUMMY_MODE) {
    return fail("Uploads must go straight to file storage. Reload the page and try again.");
  }

  const file = fd.get("file");
  const path = String(fd.get("path") ?? "");
  if (!(file instanceof File)) return fail("No file provided.");

  const check = checkClaimFile({ name: file.name, size: file.size });
  if (!check.ok) return check;
  // The path must be one WE minted, for THIS caller.
  if (employeeIdFromClaimPath(path) !== me.id) return fail("Invalid upload target.");

  const { putObject } = await import("@/lib/storage/objects");
  const put = await putObject(
    DOCUMENTS_BUCKET,
    path,
    Buffer.from(await file.arrayBuffer()),
    resolvedMimeFor(file.name) ?? "application/octet-stream",
  );
  if (!put.ok) return fail(storageErrorMessage(put.error));
  return { ok: true, path };
}

/* ────────────────────────────────────────────────────────────────────────────
   2. Record the refs against a claim
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Attach further documents to an EXISTING claim.
 *
 * Only the claimant, and only while the claim is still pending: a receipt added
 * after an admin has approved or rejected the claim would change the evidence
 * behind a decision already taken. Admins are not given this either — an admin
 * who needs a different document should reopen the claim.
 */
export async function attachClaimFiles(input: {
  submissionId: string;
  refs: ClaimUploadRef[];
}): Promise<Result<{ count: number }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const id = String(input.submissionId ?? "");
  if (!UUID_RE.test(id)) return fail("Invalid claim.");

  const [sub] = await db
    .select({
      id: moduleSubmissions.id,
      module: moduleSubmissions.module,
      employeeId: moduleSubmissions.employeeId,
      status: moduleSubmissions.status,
    })
    .from(moduleSubmissions)
    .where(eq(moduleSubmissions.id, id))
    .limit(1);
  if (!sub) return fail("That claim no longer exists.");
  // `module_submissions` is shared with Record Reference and Participant
  // Breakthrough, and this action's rules — the object prefix, the type
  // allow-list, the size cap — are all REIMBURSEMENT rules. A submission from
  // another module is not a claim, so it is refused rather than quietly given
  // an attachment surface no screen will ever show.
  if (sub.module !== "reimbursement") return fail("That is not a reimbursement claim.");
  // The rule lives in lib/reimbursements/claim-access.ts — see it for why an
  // ADMIN cannot change documents even though they can read them.
  const refusal = claimChangeRefusal(sub, me);
  if (refusal) return fail(refusal);

  const existing = await db
    .select({ id: moduleSubmissionAttachments.id })
    .from(moduleSubmissionAttachments)
    .where(eq(moduleSubmissionAttachments.submissionId, id));
  if (existing.length + (input.refs?.length ?? 0) > CLAIM_MAX_FILES) {
    return fail(`A claim can hold at most ${CLAIM_MAX_FILES} documents.`);
  }

  const built = buildClaimAttachmentRows(input.refs ?? [], me, id);
  if (!built.ok) return built;
  if (built.rows.length === 0) return fail("No documents to attach.");

  await db.insert(moduleSubmissionAttachments).values(built.rows);
  revalidatePath("/reimbursements");
  return { ok: true, count: existing.length + built.rows.length };
}

/* ────────────────────────────────────────────────────────────────────────────
   3. Read them back
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The documents on one claim, with freshly signed URLs.
 *
 * ── FETCHED ON DEMAND ──────────────────────────────────────────────────────
 * Signing costs a round-trip per file, and the list page can show a hundred
 * claims. Minting links for every receipt on screen to render an attachment
 * count nobody has clicked would be most of a page load spent on URLs that are
 * never followed — so the card asks for these when it is expanded.
 *
 * ── GATED ON THE CLAIM, NOT ON THE ID ──────────────────────────────────────
 * The caller must own the claim or be an admin. Reading FILE NAMES is gated too,
 * not just the bytes: "Rutvisha-medical-bill.pdf" is itself information.
 */
export async function listClaimAttachments(
  submissionId: string,
): Promise<Result<{ files: ClaimAttachmentView[] }>> {
  const me = await requireUser();
  const id = String(submissionId ?? "");
  if (!UUID_RE.test(id)) return fail("Invalid claim.");

  const [sub] = await db
    .select({
      employeeId: moduleSubmissions.employeeId,
      module: moduleSubmissions.module,
      fields: moduleSubmissions.fields,
    })
    .from(moduleSubmissions)
    .where(eq(moduleSubmissions.id, id))
    .limit(1);
  if (!sub) return fail("That claim no longer exists.");
  if (sub.module !== "reimbursement") return fail("That is not a reimbursement claim.");
  if (!canViewClaimDocuments(sub, me)) {
    return fail("You can't view this claim's documents.");
  }

  const rows = await db
    .select({
      id: moduleSubmissionAttachments.id,
      fileName: moduleSubmissionAttachments.fileName,
      mime: moduleSubmissionAttachments.mime,
      sizeBytes: moduleSubmissionAttachments.sizeBytes,
      storagePath: moduleSubmissionAttachments.storagePath,
      createdAt: moduleSubmissionAttachments.createdAt,
      uploadedByName: employees.name,
    })
    .from(moduleSubmissionAttachments)
    .leftJoin(employees, eq(moduleSubmissionAttachments.uploadedById, employees.id))
    .where(eq(moduleSubmissionAttachments.submissionId, id))
    .orderBy(asc(moduleSubmissionAttachments.createdAt));

  const files: ClaimAttachmentView[] = [];

  // ── THE PRE-UPLOAD BILL ───────────────────────────────────────────────────
  // Claims filed by the ANDROID APP put their receipt in the private
  // `documents` bucket and recorded only the PATH in `fields.bill_url` — there
  // is no attachment row for it. On the web those claims used to render a link
  // built by prefixing the path with "https://", which never resolved. Signing
  // it here puts every one of those bills back within reach, read-only (there
  // is no row to delete, and the mobile app still writes the field).
  //
  // An external http(s) link is NOT included: it needs no signing and the card
  // shows it as a "Receipt link" chip instead.
  const legacyBill = String(sub.fields?.bill_url ?? "").trim();
  if (legacyBillKind(legacyBill) === "path") {
    const name = legacyBill.split("/").pop() || "bill";
    files.push({
      id: `legacy:${id}`,
      fileName: name,
      mime: resolvedMimeFor(name),
      sizeBytes: null,
      url: await createSignedObjectUrl(DOCUMENTS_BUCKET, legacyBill, SIGN_TTL_SECONDS),
      inline: isInlineViewable(name),
      thumbnail: isThumbnailable(name),
      uploadedByName: null,
      createdAt: new Date(0).toISOString(),
      legacy: true,
    });
  }

  for (const r of rows) {
    files.push({
      id: r.id,
      fileName: r.fileName,
      // Re-resolved from the name rather than served from the column, so a row
      // written before this rule (or by hand) still gets OUR answer.
      mime: resolvedMimeFor(r.fileName) ?? r.mime,
      sizeBytes: r.sizeBytes,
      url: await createSignedObjectUrl(DOCUMENTS_BUCKET, r.storagePath, SIGN_TTL_SECONDS),
      inline: isInlineViewable(r.fileName),
      thumbnail: isThumbnailable(r.fileName),
      uploadedByName: r.uploadedByName ?? null,
      createdAt: r.createdAt.toISOString(),
    });
  }
  return { ok: true, files };
}

/* ────────────────────────────────────────────────────────────────────────────
   4. Remove one
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Delete a document from a claim: best-effort object removal, then the row.
 *
 * Same window as adding — the claimant, while the claim is still pending. The
 * object delete is best-effort because a missing object must not make the row
 * undeletable; the row is the record, and a stray object is harmless.
 */
export async function deleteClaimAttachment(id: string): Promise<Result<{ count: number }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID_RE.test(String(id ?? ""))) return fail("Invalid attachment.");

  const [row] = await db
    .select({
      submissionId: moduleSubmissionAttachments.submissionId,
      storagePath: moduleSubmissionAttachments.storagePath,
    })
    .from(moduleSubmissionAttachments)
    .where(eq(moduleSubmissionAttachments.id, id))
    .limit(1);
  if (!row) return fail("That document is already gone.");

  // Gate on the OWNING claim, resolved FROM the attachment — never on an id the
  // caller supplied, which they could have made up.
  const [sub] = await db
    .select({
      employeeId: moduleSubmissions.employeeId,
      status: moduleSubmissions.status,
      module: moduleSubmissions.module,
    })
    .from(moduleSubmissions)
    .where(eq(moduleSubmissions.id, row.submissionId))
    .limit(1);
  if (!sub) return fail("That claim no longer exists.");
  if (sub.module !== "reimbursement") return fail("That is not a reimbursement claim.");
  const refusal = claimChangeRefusal(sub, me);
  if (refusal) return fail(refusal);

  await removeObjects(DOCUMENTS_BUCKET, [row.storagePath]);
  await db.delete(moduleSubmissionAttachments).where(eq(moduleSubmissionAttachments.id, id));

  const left = await db
    .select({ id: moduleSubmissionAttachments.id })
    .from(moduleSubmissionAttachments)
    .where(eq(moduleSubmissionAttachments.submissionId, row.submissionId));

  revalidatePath("/reimbursements");
  return { ok: true, count: left.length };
}
