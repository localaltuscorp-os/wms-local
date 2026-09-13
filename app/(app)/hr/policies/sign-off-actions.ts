"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { employeePolicySignatures, policyCompliance } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { getPolicy, isPolicyKey } from "@/lib/hr/policies/registry";
import { currentPolicyVersion } from "@/lib/hr/policies/compliance-sync";

type R<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const SIG_MAX_BYTES = 8 * 1024 * 1024;
const SIG_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/**
 * EMPLOYEE POLICY SIGN-OFF — printed name, the date, and their signature image.
 *
 * ── THIS DOES NOT REPLACE DIGILOCKER ─────────────────────────────────────
 * The DigiLocker route (policy-view → /api/hr/policies/acknowledge →
 * /documents/sign) still exists and still produces the stronger record: a
 * verified identity and an archived signed PDF. This is the second way, always
 * available, and it is recorded in its own table so that nobody reading the
 * ledger later mistakes one for the other.
 *
 * Both mirror into `policy_compliance`, which is what every HR screen reads to
 * answer "who has acknowledged what". The mirror row carries a null
 * `docInstanceId` — the marker of an acknowledgement that has no signed
 * document instance behind it.
 *
 * ── THE SIGNATURE IMAGE IS THE POINT, SO IT IS CHECKED HERE ──────────────
 * A printed name proves only that somebody could type. The image is required,
 * and required in THIS function rather than only in the browser: a disabled
 * button is a courtesy, and this action is the only thing between a POST and a
 * filed acknowledgement. The path must also sit under the caller's own storage
 * prefix, because it is handed out by createPolicySignOffUploadUrl below and
 * never composed by the client — a mismatch means the value was edited in
 * flight.
 */
export async function signPolicyWithSignature(input: {
  key: string;
  signedName: string;
  signaturePath: string;
}): Promise<R> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const key = (input.key ?? "").trim();
  if (!key || !isPolicyKey(key) || !getPolicy(key)) {
    return { ok: false, error: "That policy isn't available to sign." };
  }

  const signedName = (input.signedName ?? "").trim().replace(/\s+/g, " ");
  if (signedName.length < 2) return { ok: false, error: "Print your full name to sign." };
  if (signedName.length > 120) return { ok: false, error: "That name is too long." };

  const signaturePath = (input.signaturePath ?? "").trim();
  if (!signaturePath) return { ok: false, error: "Attach your signature to sign." };
  if (!signaturePath.startsWith(`policy-signatures/${me.id}/`)) {
    return { ok: false, error: "Invalid signature reference." };
  }

  const version = await currentPolicyVersion(key);
  const now = new Date();

  // The honest record first, the ledger second: a failure can then only leave
  // the ledger BEHIND this table, never claiming a signature never taken.
  await db
    .insert(employeePolicySignatures)
    .values({
      employeeId: me.id,
      policyKey: key,
      version,
      signedName,
      signaturePath,
      signedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [employeePolicySignatures.employeeId, employeePolicySignatures.policyKey],
      // Re-signing re-stamps the version: signing again after a policy is
      // republished must not leave the row claiming the older text.
      set: { signedName, signaturePath, version, signedAt: now, updatedAt: now },
    });

  await db
    .insert(policyCompliance)
    .values({ policyKey: key, employeeId: me.id, version, status: "signed", signedAt: now })
    .onConflictDoUpdate({
      target: [policyCompliance.policyKey, policyCompliance.employeeId],
      set: { status: "signed", signedAt: now, version, updatedAt: now },
    });

  revalidatePath("/hr/policies");
  revalidatePath(`/hr/policies/${key}`);
  return { ok: true };
}

/**
 * A one-shot signed URL so the BROWSER puts the signature image straight into
 * Supabase Storage.
 *
 * The bytes never cross the Next server: a Server Action carrying a phone photo
 * pushes it through the Vercel function, which is both the slow path and the
 * one with a hard body-size limit. The path is minted HERE, under the caller's
 * own prefix, and never accepted from the client.
 */
export async function createPolicySignOffUploadUrl(input: {
  mime?: string | null;
  size?: number | null;
}): Promise<R<{ path: string; token: string; bucket: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const mime = (input.mime ?? "").toLowerCase();
  const ext = SIG_EXT[mime];
  if (!ext) return { ok: false, error: "Please upload a JPG, PNG or WebP image." };
  if (Number(input.size ?? 0) > SIG_MAX_BYTES) return { ok: false, error: "That image is over 8 MB." };

  const path = `policy-signatures/${me.id}/${randomUUID()}.${ext}`;
  try {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(DOCUMENTS_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) return { ok: false, error: error?.message ?? "Could not start the upload." };
    return { ok: true, path, token: data.token, bucket: DOCUMENTS_BUCKET };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start the upload." };
  }
}

/** This employee's typed-and-uploaded sign-off for one policy, or null. */
export async function myPolicySignOff(key: string) {
  const me = await requireUser();
  const [row] = await db
    .select()
    .from(employeePolicySignatures)
    .where(
      and(
        eq(employeePolicySignatures.employeeId, me.id),
        eq(employeePolicySignatures.policyKey, key),
      ),
    )
    .limit(1);
  return row ?? null;
}
