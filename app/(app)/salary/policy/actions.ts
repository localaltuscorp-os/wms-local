"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { salaryPolicies, salaryPolicyConsents } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { getCurrentPolicy } from "@/lib/queries/salary-policy";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const PATH = "/salary/policy";

const MAX_PDF_BYTES = 25 * 1024 * 1024; // mirror documents/actions.ts
const MAX_SIG_BYTES = 5 * 1024 * 1024;
const SIG_MIME = new Set<string>(["image/png", "image/jpeg"]);

/**
 * Admin: publish a new versioned salary-policy PDF. Validates the file is a PDF
 * (mime + size, mirroring documents/actions.ts), uploads it to the documents
 * bucket under `salary-policies/`, then in a single transaction flips every
 * existing policy to is_current=false and inserts the new current row. On a DB
 * failure the just-uploaded object is removed (compensating delete).
 */
export async function uploadSalaryPolicy(form: FormData): Promise<Result> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const versionRaw = form.get("version");
  const version = typeof versionRaw === "string" ? versionRaw.trim() : "";
  if (!version) return { ok: false, error: "A version label is required." };
  if (version.length > 40) return { ok: false, error: "Version label too long (max 40)." };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pick a PDF to upload." };
  }
  if (file.type && file.type !== "application/pdf") {
    return { ok: false, error: "The policy must be a PDF." };
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return { ok: false, error: "The policy must be a PDF." };
  }
  if (file.size > MAX_PDF_BYTES) return { ok: false, error: "File exceeds 25 MB." };

  const path = `salary-policies/${crypto.randomUUID()}.pdf`;
  const admin = getSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: "application/pdf", upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  try {
    await db.transaction(async (tx) => {
      await tx.update(salaryPolicies).set({ isCurrent: false });
      await tx.insert(salaryPolicies).values({
        version,
        storagePath: path,
        uploadedById: me.id,
        isCurrent: true,
      });
    });
  } catch (err) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Employee: record their consent to the CURRENT salary policy by uploading a
 * signature image (a canvas-drawn PNG, or an uploaded PNG/JPEG). The signing
 * employee is always `me.id` (never client-supplied) and the policy version is
 * the server-side current version (a client-passed version is ignored to
 * prevent signing a stale/forged version). Idempotent on (employee, version):
 * a second submit for the same version does nothing.
 */
export async function submitConsent(form: FormData): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  // Re-fetch the current policy server-side — never trust a client version.
  const policy = await getCurrentPolicy();
  if (!policy) return { ok: false, error: "No salary policy is published yet." };

  const kindRaw = form.get("signatureKind");
  const signatureKind = kindRaw === "image" ? "image" : kindRaw === "draw" ? "draw" : null;
  if (!signatureKind) return { ok: false, error: "Invalid signature kind." };

  const file = form.get("signature");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Draw or upload a signature first." };
  }
  if (!SIG_MIME.has(file.type)) {
    return { ok: false, error: "Signature must be a PNG or JPEG image." };
  }
  if (file.size > MAX_SIG_BYTES) return { ok: false, error: "Signature exceeds 5 MB." };

  const ext = file.type === "image/jpeg" ? "jpg" : "png";
  const path = `salary-signatures/${me.id}/${crypto.randomUUID()}.${ext}`;
  const admin = getSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  try {
    await db
      .insert(salaryPolicyConsents)
      .values({
        employeeId: me.id,
        policyVersion: policy.version,
        signatureKind,
        signaturePath: path,
      })
      .onConflictDoNothing({
        target: [salaryPolicyConsents.employeeId, salaryPolicyConsents.policyVersion],
      });
  } catch (err) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  revalidatePath(PATH);
  return { ok: true };
}
