"use server";

import { requireCandidateOwner } from "@/lib/hr/candidate/candidate-owner";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  saveOnboardingSubmission,
  mintOnboardingUploadUrl,
  type OnboardingSaveResult,
} from "@/lib/dossier/onboarding-submit";

/**
 * The onboarding form for a candidate who has NO LOGIN YET — reached on an
 * emailed access link (purpose "onboarding").
 *
 * THE GUARD IS `requireCandidateOwner()`, the same one the interview form and
 * the policy signing use. The record written is ALWAYS the caller's own
 * (`me.id`, resolved from the link cookie); any `employeeId` the browser posts is
 * ignored, so there is nothing here to tamper with. The form rules are shared
 * with the signed-in door through lib/dossier/onboarding-submit.ts.
 */
export async function submitOnboardingAsCandidate(form: FormData): Promise<OnboardingSaveResult> {
  const { me } = await requireCandidateOwner();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  return saveOnboardingSubmission(form, { employeeId: me.id, actorId: me.id });
}

export async function createOnboardingUploadUrlAsCandidate(input: {
  key: string;
  fileName: string;
  mime?: string | null;
  size?: number;
}): Promise<{ ok: true; path: string; token: string; bucket: string } | { ok: false; error: string }> {
  const { me } = await requireCandidateOwner();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  return mintOnboardingUploadUrl(me.id, input);
}
