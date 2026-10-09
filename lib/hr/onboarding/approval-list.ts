import "server-only";

import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, onboardingApprovals, onboardingSubmissions } from "@/db/schema";
import { onboardingReviewSummary } from "@/lib/hr/onboarding/approval-summary";

export type OnboardingApprovalRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  submittedAt: string;
  updatedAt: string;
  summary: string;
  status: "pending" | "approved" | "rejected";
  decisionNote: string | null;
};

function isMissingRelation(error: unknown): boolean {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } } | null;
  return candidate?.code === "42P01" || candidate?.cause?.code === "42P01";
}

export async function isOnboardingApprovalWorkflowReady(): Promise<boolean> {
  const [row] = (await db.execute(sql`
    select to_regclass('public.onboarding_approvals') as table_name
  `)) as unknown as Array<{ table_name: string | null }>;
  return row?.table_name != null;
}

export async function listOnboardingApprovalRows(): Promise<OnboardingApprovalRow[]> {
  let decisions: Array<{ submissionId: string; status: string; decisionNote: string | null }> = [];
  try {
    decisions = await db.select({ submissionId: onboardingApprovals.submissionId, status: onboardingApprovals.status, decisionNote: onboardingApprovals.decisionNote })
      .from(onboardingApprovals);
  } catch (error) {
    if (!isMissingRelation(error)) throw error;
  }
  const decisionsBySubmissionId = new Map(decisions.map((decision) => [decision.submissionId, decision]));
  const rows = await db.select({
    id: onboardingSubmissions.id,
    employeeId: onboardingSubmissions.employeeId,
    employeeName: employees.name,
    fields: onboardingSubmissions.fields,
    files: onboardingSubmissions.files,
    submittedAt: onboardingSubmissions.submittedAt,
    updatedAt: onboardingSubmissions.updatedAt,
  })
    .from(onboardingSubmissions)
    .innerJoin(employees, eq(employees.id, onboardingSubmissions.employeeId))
    .where(eq(onboardingSubmissions.status, "submitted"))
    .orderBy(desc(onboardingSubmissions.submittedAt), sql`lower(${employees.name})`);

  return rows.map((row) => {
    const decision = decisionsBySubmissionId.get(row.id);
    return {
      id: row.id,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      submittedAt: row.submittedAt?.toISOString() ?? row.updatedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      summary: onboardingReviewSummary(
        (row.fields as Record<string, string> | null) ?? {},
        (row.files as Record<string, unknown> | null) ?? {},
      ),
      status: decision?.status === "approved" || decision?.status === "rejected" ? decision.status : "pending",
      decisionNote: decision?.decisionNote ?? null,
    };
  });
}
