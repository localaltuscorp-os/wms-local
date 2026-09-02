import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, designations, onboardingSubmissions } from "@/db/schema";
import type { CandidateRow } from "@/app/(app)/hr/candidate-actions";

/**
 * The HR-Record person list — the CURRENT EMPLOYEES (active roster), mapped into
 * the `CandidateRow` shape the HR-Record screen already renders. This replaces
 * the old candidate-intake source so the picker shows real staff, not
 * recruitment records. Each person's id is their `employees.id`, which every
 * HR-Record status loader now resolves directly (see ./resolve-person).
 *
 * `pct` (drives the "Details missing" badge) reflects whether the employee has
 * completed their self-service Onboarding Form — a live nudge for the "all
 * employee records filled by employees" rollout: submitted = 100, draft = 50,
 * nothing = 0.
 */
export async function listEmployeeRecords(): Promise<CandidateRow[]> {
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      phone: employees.whatsappPhone,
      department: employees.department,
      designation: designations.name,
      avatarUrl: employees.avatarUrl,
      createdAt: employees.createdAt,
      onboardingStatus: onboardingSubmissions.status,
    })
    .from(employees)
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .leftJoin(onboardingSubmissions, eq(onboardingSubmissions.employeeId, employees.id))
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));

  return rows.map((r) => ({
    id: r.id,
    fullName: r.name,
    positionApplied: r.designation ?? null,
    mobile: r.phone ?? null,
    email: r.email,
    status: "active",
    submitted: true,
    pct: r.onboardingStatus === "submitted" ? 100 : r.onboardingStatus === "draft" ? 50 : 0,
    createdAt: r.createdAt,
    department: r.department ?? null,
    gender: null,
    position: r.designation ?? null,
    recruiterName: null,
    avatarUrl: r.avatarUrl ?? null,
  }));
}
