import { desc, eq, sql } from "drizzle-orm";
import { compensationApprovals, ctcBreakups, designations, employees } from "@/db/schema";
import { db } from "@/lib/db";
import {
  annualOf,
  computeTotals,
  CTC_COMPONENTS,
  monthlyOf,
  parseFields,
  REASON_LABELS,
  type CtcGroup,
} from "@/lib/hr/ctc/model";

export type CtcApprovalComponent = {
  id: string;
  label: string;
  group: CtcGroup;
  monthly: number;
  annual: number;
};

export type CtcApprovalRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  designation: string;
  department: string;
  version: number;
  reason: string;
  effectiveDate: string | null;
  updatedAt: string;
  grossMonthly: number;
  netMonthly: number;
  ctcMonthly: number;
  ctcAnnual: number;
  status: "pending" | "approved" | "rejected";
  decisionNote: string | null;
  components: CtcApprovalComponent[];
};

/** Read-only CTC register used by the Admin Approvals workspace. */
export async function listCtcApprovalRows(): Promise<CtcApprovalRow[]> {
  let decisions: Array<{ subjectId: string; status: string; decisionNote: string | null }> = [];
  try {
    decisions = await db.select({ subjectId: compensationApprovals.subjectId, status: compensationApprovals.status, decisionNote: compensationApprovals.decisionNote })
      .from(compensationApprovals)
      .where(eq(compensationApprovals.kind, "ctc"));
  } catch (error) {
    const candidate = error as { code?: unknown; cause?: { code?: unknown } } | null;
    if (candidate?.code !== "42P01" && candidate?.cause?.code !== "42P01") throw error;
  }
  const decisionsBySubjectId = new Map(decisions.map((decision) => [decision.subjectId, decision]));
  const rows = await db
    .select({
      id: ctcBreakups.id,
      employeeId: ctcBreakups.employeeId,
      employeeName: employees.name,
      designation: designations.name,
      department: employees.department,
      version: ctcBreakups.version,
      reason: ctcBreakups.reason,
      effectiveDate: ctcBreakups.effectiveDate,
      fields: ctcBreakups.fields,
      updatedAt: ctcBreakups.updatedAt,
    })
    .from(ctcBreakups)
    .innerJoin(employees, eq(employees.id, ctcBreakups.employeeId))
    .leftJoin(designations, eq(designations.id, employees.designationId))
    .orderBy(desc(ctcBreakups.updatedAt), sql`lower(${employees.name})`);

  return rows.map((row) => {
    const decision = decisionsBySubjectId.get(row.id);
    const { components } = parseFields(row.fields);
    const totals = computeTotals(components);
    return {
      id: row.id,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      designation: row.designation ?? "-",
      department: row.department ?? "-",
      version: row.version,
      reason: REASON_LABELS[row.reason as keyof typeof REASON_LABELS] ?? row.reason,
      effectiveDate: row.effectiveDate ?? null,
      updatedAt: row.updatedAt.toISOString(),
      grossMonthly: totals.grossMonthly,
      netMonthly: totals.netMonthly,
      ctcMonthly: totals.ctcMonthly,
      ctcAnnual: totals.ctcAnnual,
      status: decision?.status === "approved" || decision?.status === "rejected" ? decision.status : "pending",
      decisionNote: decision?.decisionNote ?? null,
      components: CTC_COMPONENTS
        .map((component) => {
          const value = components[component.id] ?? 0;
          return {
            id: component.id,
            label: component.label,
            group: component.group,
            monthly: monthlyOf(component, value),
            annual: annualOf(component, value),
          };
        })
        .filter((component) => component.monthly > 0 || component.annual > 0),
    };
  });
}
