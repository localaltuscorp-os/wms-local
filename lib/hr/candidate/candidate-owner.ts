import "server-only";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { candidateIntake, type Employee } from "@/db/schema";
import { requireCandidate } from "@/lib/auth/current";

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
}> {
  const me = await requireCandidate();
  if (!me.candidateIntakeId) redirect("/hub" as Route);
  const [row] = await db
    .select({ id: candidateIntake.id, submittedAt: candidateIntake.submittedAt })
    .from(candidateIntake)
    .where(eq(candidateIntake.id, me.candidateIntakeId))
    .limit(1);
  if (!row) redirect("/hub" as Route);
  return { me, rowId: row.id, submitted: row.submittedAt != null };
}
