"use server";

import { revalidatePath } from "next/cache";
import { requireCandidateOwner } from "@/lib/hr/candidate/candidate-owner";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getPolicy, isPolicyKey } from "@/lib/hr/policies/registry";
import { candidatePolicyKeys, signCandidatePolicy } from "@/lib/hr/candidate/policy-signing";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";

/**
 * The candidate's own acceptance of one policy, taken over an access link.
 *
 * THE GUARD IS `requireCandidateOwner()` — the SAME one the interview form uses
 * (lib/hr/candidate/candidate-owner.ts). There is deliberately no second
 * ownership check written for this surface: the public path and the signed-in
 * path resolve identity through one function, so they cannot drift apart, and
 * the intake row is resolved from the cookie's token rather than from anything
 * the client sends. There is no "which candidate" parameter here to tamper with.
 *
 * The policy key IS checked against the registry, because it is the one thing
 * the client does choose — an unregistered or coming-soon key is refused rather
 * than filed as an acknowledgement of a document that does not exist.
 */
export async function signPolicyAsCandidate(input: {
  key: string;
  signedName: string;
  signaturePath: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { me, rowId, viaLink } = await requireCandidateOwner();

  // Signed-in candidates already have the DigiLocker flow, which produces far
  // stronger evidence. Routing them through the typed path would quietly
  // downgrade a signature that could have been verified.
  if (!viaLink) {
    return { ok: false, error: "Please sign this policy from your account." };
  }

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const key = (input.key ?? "").trim();
  if (!key || !isPolicyKey(key) || !getPolicy(key) || !candidatePolicyKeys().includes(key)) {
    return { ok: false, error: "That policy isn't available to sign." };
  }

  const signedName = (input.signedName ?? "").trim().replace(/\s+/g, " ");
  if (signedName.length < 2) return { ok: false, error: "Type your full name to sign." };
  if (signedName.length > 120) return { ok: false, error: "That name is too long." };

  /**
   * THE SIGNATURE IMAGE IS MANDATORY, AND CHECKED HERE.
   *
   * The button being disabled in the browser is a courtesy, not a rule - this
   * action is the only thing standing between a POST and a filed
   * acknowledgement, so the requirement has to be stated where it is enforced.
   *
   * The path must sit under this candidate's OWN prefix. It is handed out by
   * createPolicySignatureUploadUrl below and never composed by the client, so
   * a mismatch means the value was edited in flight - refused rather than
   * stored, which is how one candidate's record would otherwise come to point
   * at another's file.
   */
  const signaturePath = (input.signaturePath ?? "").trim();
  if (!signaturePath) {
    return { ok: false, error: "Upload a photo of your signature to sign." };
  }
  if (!signaturePath.startsWith(`candidate-intake/${me.id}/`)) {
    return { ok: false, error: "Invalid signature reference." };
  }

  await signCandidatePolicy({
    intakeId: rowId,
    employeeId: me.id,
    policyKey: key,
    signedName,
    signaturePath,
  });

  revalidatePath("/c/policies");
  revalidatePath(`/c/policies/${key}`);
  return { ok: true };
}

const SIG_MAX_BYTES = 8 * 1024 * 1024;
const SIG_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/**
 * A one-shot signed URL so the candidate's BROWSER puts their signature photo
 * STRAIGHT INTO SUPABASE STORAGE.
 *
 * The image never passes through the Next server. Routing it through a Server
 * Action would carry a phone photo through the Vercel function on a form a
 * candidate fills on their phone, over whatever connection they have - the
 * slow path, and the one with a hard body-size limit that makes the upload
 * fail outright rather than slowly.
 *
 * The PATH IS MINTED HERE and never accepted from the client, under the
 * candidate's own `candidate-intake/<employee id>/` prefix - the same prefix
 * every other candidate upload uses, and the one signPolicyAsCandidate above
 * re-checks before it stores the key.
 */
export async function createPolicySignatureUploadUrl(input: {
  mime?: string | null;
  size?: number | null;
}): Promise<{ ok: true; path: string; token: string; bucket: string } | { ok: false; error: string }> {
  const { me, viaLink } = await requireCandidateOwner();
  if (!viaLink) return { ok: false, error: "Please sign this policy from your account." };

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  const mime = (input.mime ?? "").toLowerCase();
  const ext = SIG_EXT[mime];
  if (!ext) return { ok: false, error: "Please upload a JPG, PNG or WebP image." };
  if (Number(input.size ?? 0) > SIG_MAX_BYTES) return { ok: false, error: "That image is over 8 MB." };

  const path = `candidate-intake/${me.id}/policy-signature-${randomUUID()}.${ext}`;
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
