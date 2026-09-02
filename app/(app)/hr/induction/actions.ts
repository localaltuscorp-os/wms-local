"use server";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, onboardingSubmissions } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { getOnboarding } from "@/lib/queries/onboarding";

/**
 * Induction — server actions. The post-joining Induction confirms the new
 * joiner's details rather than re-asking for them: it AUTO-FILLS from the
 * employee's already-submitted onboarding form (`onboarding_submissions.fields`)
 * and presents a read-only summary the employee / HR confirm. Load-neutral: a
 * couple of indexed reads + the existing onboarding loader. HR-gated.
 */

export interface InductionPerson {
  id: string;
  name: string;
  submittedAt: string | null;
}

/** Employees whose onboarding form is SUBMITTED — the inductable roster. */
export async function listInductionEmployees(): Promise<InductionPerson[]> {
  await requireHrStaff();
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      submittedAt: onboardingSubmissions.submittedAt,
    })
    .from(onboardingSubmissions)
    .innerJoin(employees, eq(employees.id, onboardingSubmissions.employeeId))
    .where(and(eq(onboardingSubmissions.status, "submitted"), eq(employees.isActive, true)))
    .orderBy(desc(onboardingSubmissions.submittedAt))
    .limit(300);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    submittedAt: r.submittedAt ? String(r.submittedAt) : null,
  }));
}

export interface InductionData {
  employeeName: string;
  designation: string | null;
  status: "draft" | "submitted" | null;
  submittedAt: string | null;
  /** The raw onboarding field map — the client groups it by section for display. */
  fields: Record<string, string>;
}

/** The prefilled induction summary for one employee — from their onboarding form. */
export async function getInduction(
  employeeId: string,
): Promise<{ ok: true; data: InductionData } | { ok: false; error: string }> {
  await requireHrStaff();
  if (!/^[0-9a-f-]{36}$/i.test(employeeId)) return { ok: false, error: "Invalid employee." };
  try {
    const view = await getOnboarding(employeeId);
    if (!view) return { ok: false, error: "Employee not found." };
    return {
      ok: true,
      data: {
        employeeName: view.employee.name,
        designation: view.employee.designation,
        status: view.status,
        submittedAt: view.submittedAt,
        fields: view.fields,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load induction details." };
  }
}
