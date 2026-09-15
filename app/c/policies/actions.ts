"use server";

import { revalidatePath } from "next/cache";
import { requireCandidateOwner } from "@/lib/hr/candidate/candidate-owner";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getPolicy, isPolicyKey } from "@/lib/hr/policies/registry";
import { candidatePolicyKeys, signCandidatePolicy } from "@/lib/hr/candidate/policy-signing";

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

  await signCandidatePolicy({
    intakeId: rowId,
    employeeId: me.id,
    policyKey: key,
    signedName,
  });

  revalidatePath("/c/policies");
  revalidatePath(`/c/policies/${key}`);
  return { ok: true };
}
