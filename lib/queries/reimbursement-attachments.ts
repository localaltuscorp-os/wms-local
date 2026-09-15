import "server-only";
import { count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { moduleSubmissionAttachments } from "@/db/schema";

/**
 * How many documents each claim carries — ONE query for the whole page.
 *
 * The claim card needs a "2 files" badge whether or not anyone opens it, and
 * the list renders up to 300 claims. Counting per card would be 300 queries;
 * signing every file's URL up front would be worse still (a storage round-trip
 * each) for links nobody clicks. So the page loads counts in one grouped read
 * and the signed URLs are minted on demand when a card is expanded — see
 * `listClaimAttachments` in app/(app)/reimbursements/attachment-actions.ts.
 *
 * Ids absent from the result simply have no files; callers read `?? 0`.
 */
export async function attachmentCountsBySubmission(
  submissionIds: readonly string[],
): Promise<Map<string, number>> {
  if (submissionIds.length === 0) return new Map();

  const rows = await db
    .select({
      submissionId: moduleSubmissionAttachments.submissionId,
      n: count(),
    })
    .from(moduleSubmissionAttachments)
    .where(inArray(moduleSubmissionAttachments.submissionId, [...submissionIds]))
    .groupBy(moduleSubmissionAttachments.submissionId);

  return new Map(rows.map((r) => [r.submissionId, Number(r.n)]));
}

/** How many documents one claim carries. */
export async function attachmentCountFor(submissionId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(moduleSubmissionAttachments)
    .where(eq(moduleSubmissionAttachments.submissionId, submissionId));
  return Number(row?.n ?? 0);
}
