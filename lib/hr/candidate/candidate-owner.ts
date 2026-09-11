import "server-only";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidateIntake, type Employee } from "@/db/schema";
import { requireCandidate } from "@/lib/auth/current";
import { resolveAccessLink } from "@/lib/hr/candidate/access-link";
import { readCandidateLinkCookie } from "@/lib/hr/candidate/access-link-cookie";

/**
 * The candidate-form owner guard. Resolves the caller's OWN intake row via the
 * server-side `me.candidateIntakeId` link (which rides the already-cached
 * getCurrentEmployee row — zero extra query for the link). A candidate can never
 * name, enumerate, or create another row: every owner-scoped write targets
 * `rowId` alone. Built on `requireCandidate` (NOT requireUser, which would
 * redirect a candidate away).
 */
export async function requireCandidateOwner(): Promise<{
  me: Employee;
  rowId: string;
  submitted: boolean;
  /**
   * TRUE when the caller got here on an access link rather than a sign-in.
   *
   * It is the one behavioural difference between the two paths, and it exists
   * because submit means different things on each. A signed-in candidate's
   * account is burned on submit (it was minted for that one form), so their form
   * is sealed. A link candidate keeps their link for its full 30 days precisely
   * so they can come back and correct what they sent — which is the whole point
   * of the no-login flow — so their form stays editable.
   */
  viaLink: boolean;
}> {
  // ── THE NO-LOGIN PATH (migration 0221) ───────────────────────────────────
  // Tried FIRST, and resolved here rather than in the three write actions, so
  // `saveOwnCandidateDraft`, `uploadOwnCandidateFile` and `submitOwnCandidateForm`
  // are reached by both routes through ONE guard. There is deliberately no second
  // implementation to keep in step: a public path with its own copy of the
  // ownership checks is how the weaker of the two eventually drifts.
  //
  // The cookie is HttpOnly and path-scoped to `/c` (access-link-cookie.ts), and
  // holds an opaque token that proves nothing by itself — `resolveAccessLink`
  // re-reads the row, the clock, the revocation and the candidate's liveness on
  // every call. A forged or stale cookie simply returns null and falls through
  // to the ordinary signed-in check below, which then bounces.
  const linkToken = await readCandidateLinkCookie();
  if (linkToken) {
    const ctx = await resolveAccessLink(linkToken);
    if (ctx) return { me: ctx.candidate, rowId: ctx.intakeId, submitted: ctx.submitted, viaLink: true };
    // A cookie that no longer resolves means the link expired or was revoked
    // mid-visit. Send them to the page that can issue a new one rather than to
    // /login, which they have no account for.
    redirect("/c/resume" as Route);
  }

  const me = await requireCandidate();
  if (!me.candidateIntakeId) redirect("/hub" as Route);
  const [row] = await db
    .select({ id: candidateIntake.id, submittedAt: candidateIntake.submittedAt })
    .from(candidateIntake)
    .where(eq(candidateIntake.id, me.candidateIntakeId))
    .limit(1);
  if (!row) redirect("/hub" as Route);
  return { me, rowId: row.id, submitted: row.submittedAt != null, viaLink: false };
}
