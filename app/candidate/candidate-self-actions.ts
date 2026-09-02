"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { candidateIntake } from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { RECRUITER_ONLY_KEYS } from "@/lib/hr/candidate/intake-schema";
import { requireCandidateOwner } from "@/lib/hr/candidate/candidate-owner";
import { disableCandidateAccountByIntakeId } from "@/lib/hr/candidate/account-lifecycle";

/**
 * OWNER-SCOPED candidate self-fill actions. Every write authenticates via
 * `requireCandidateOwner()` (which resolves the caller's OWN intake row) and
 * targets that `rowId` alone — the incoming form id is DISCARDED, so a candidate
 * can never write another row. Recruiter-only fields are stripped + rehydrated,
 * uploads are pinned under the caller's own storage prefix, and a submitted form
 * is locked. These mirror the HR actions' shapes so they drop into the wizard's
 * injected `actions`.
 */

type R<T> = ({ ok: true } & T) | { ok: false; error: string };

type DraftInput = {
  id?: string;
  values?: Record<string, string>;
  instances?: Record<string, string[]>;
  photoPath?: string | null;
  signaturePath?: string | null;
};

/** A candidate may only reference storage under their OWN prefix. */
function ownsPath(path: string | null | undefined, prefix: string): boolean {
  return path == null || path === "" || path.startsWith(prefix);
}

/** Save the caller's own draft (id-less; recruiter fields stripped + rehydrated). */
export async function saveOwnCandidateDraft(input: DraftInput): Promise<R<{ id: string }>> {
  const { me, rowId, submitted } = await requireCandidateOwner();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (submitted) return { ok: false, error: "Your form is already submitted." };

  const prefix = `candidate-intake/${me.id}/`;
  if (!ownsPath(input.photoPath, prefix) || !ownsPath(input.signaturePath, prefix)) {
    return { ok: false, error: "Invalid file reference." };
  }

  // Load the stored answers so we can rehydrate recruiter-only fields the
  // candidate can neither see nor overwrite (HR fills those later).
  const [existing] = await db
    .select({ data: candidateIntake.data })
    .from(candidateIntake)
    .where(eq(candidateIntake.id, rowId))
    .limit(1);
  const stored = (existing?.data ?? {}) as Record<string, string>;

  const values: Record<string, string> = { ...(input.values ?? {}) };
  for (const k of RECRUITER_ONLY_KEYS) {
    delete values[k]; // candidate can't write these…
    if (stored[k] != null) values[k] = stored[k]; // …but a stored value survives
  }

  try {
    await db
      .update(candidateIntake)
      .set({
        fullName: (values["personal.fullName"] ?? "").slice(0, 200),
        positionApplied: values["personal.position"] || null,
        mobile: values["personal.mobile"] || null,
        email: values["personal.email"] || null,
        data: values,
        instances: (input.instances ?? {}) as Record<string, unknown>,
        photoPath: input.photoPath ?? null,
        signaturePath: input.signaturePath ?? null,
        updatedAt: new Date(),
        // status / submittedAt / evaluation / evaluationV2 are NEVER set here.
      })
      .where(eq(candidateIntake.id, rowId));
    return { ok: true, id: rowId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}

/** Upload the caller's own photo/signature under their OWN storage prefix. */
export async function uploadOwnCandidateFile(fd: FormData): Promise<R<{ path: string }>> {
  const { me, submitted } = await requireCandidateOwner();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (submitted) return { ok: false, error: "Your form is already submitted." };

  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file provided." };
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "File too large (max 8 MB)." };
  const rawKind = String(fd.get("kind") ?? "");
  const kind = rawKind === "photo" || rawKind === "sign" ? rawKind : null;
  if (!kind) return { ok: false, error: "Unsupported upload kind." };
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  // Owner-scoped prefix — the save action rejects any path outside it.
  const path = `candidate-intake/${me.id}/${kind}/${randomUUID()}.${ext || "bin"}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error } = await getSupabaseAdmin()
    .storage.from(DOCUMENTS_BUCKET)
    .upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) return { ok: false, error: `Upload failed: ${error.message}` };
  return { ok: true, path };
}

/** Submit the caller's own form → locks it AND deactivates the guest account. */
export async function submitOwnCandidateForm(
  _id?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { me, rowId, submitted } = await requireCandidateOwner();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (submitted) return { ok: true }; // already done — idempotent

  await db
    .update(candidateIntake)
    .set({ submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(candidateIntake.id, rowId));

  // Close the guest login for good (Firebase disabled + tokens revoked).
  await disableCandidateAccountByIntakeId(rowId, "submitted").catch(() => {});
  revalidatePath("/candidate/form");
  return { ok: true };
}
