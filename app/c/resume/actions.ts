"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { rateLimitOrError } from "@/lib/rate-limit";
import { issueAccessLink, intakeIdForEmail } from "@/lib/hr/candidate/access-link";
import { sendCandidateAccessLink } from "@/lib/hr/candidate/access-link-email";

/**
 * "Email me a new link" — the self-service recovery path for a candidate whose
 * link expired, or who deleted the mail.
 *
 * THIS PAGE IS PUBLIC AND UNAUTHENTICATED, SO THE ANSWER IS ALWAYS THE SAME
 * SENTENCE. Saying "no candidate with that email" to a stranger turns this form
 * into a way to ask whether a named person applied here — exactly what an
 * applicant's current employer would like to know. Every outcome (no record, no
 * live candidate row, a mail failure) returns the identical `{ ok: true }`; only
 * the throttle is allowed to speak up, and it says nothing about the address.
 *
 * The address typed in is only ever a LOOKUP KEY. `sendCandidateAccessLink`
 * reads the destination off the candidate's own row, so guessing someone's email
 * cannot have their link delivered anywhere.
 *
 * THIS PATH DOES NOT REVOKE THE CANDIDATE'S EXISTING LINK. Anyone can post any
 * address here, so revoking would let a stranger who knows someone applied cut
 * that person off mid-form by typing their email — silently, because this page
 * tells nobody anything by design. Instead an ADDITIONAL link is issued (capped
 * in `issueAccessLink`); every one of them was mailed to the candidate's own
 * address and nowhere else. HR's own re-send still revokes, because there the
 * caller is authenticated and the intent is explicit.
 */
export async function requestCandidateFormLink(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = (email ?? "").trim().toLowerCase();

  // Throttled on the submitted address BEFORE any lookup: the limiter is the
  // only thing between this endpoint and someone mailing a candidate over and
  // over, and keying it on the input means the cost is paid even when nothing
  // matches — which also keeps the two cases similar in timing.
  const limited = rateLimitOrError(`candidate-link:${clean}`, "write");
  if (limited) return { ok: false, error: "Too many requests — please wait a minute and try again." };

  if (!clean || !clean.includes("@")) return { ok: true };

  try {
    const intakeId = await intakeIdForEmail(clean);
    if (!intakeId) return { ok: true };

    // A link resolves through the candidate's employees row, so no row — or a
    // closed one (hired / rejected / withdrawn) — means no link. Silently:
    // `resolveAccessLink` would refuse it on arrival anyway, and mailing a URL
    // that cannot open is worse than mailing nothing.
    const emp = await db.query.employees.findFirst({
      where: eq(employees.candidateIntakeId, intakeId),
    });
    if (!emp || !emp.candidateActive) return { ok: true };

    const { token, expiresAt } = await issueAccessLink(intakeId, null, { revokeExisting: false });
    await sendCandidateAccessLink(intakeId, token, expiresAt);
  } catch {
    // Never leak the failure mode — the visitor gets the same sentence.
  }
  return { ok: true };
}
