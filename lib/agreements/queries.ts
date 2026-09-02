import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agreements,
  employees,
  designations,
  payingEntities,
  salaryProfiles,
  type Agreement,
} from "@/db/schema";
import type { AgreementEmployee, AgreementRow } from "./types";

function isoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Active employees + the fields an agreement auto-fills from. */
export async function rosterForAgreements(): Promise<AgreementEmployee[]> {
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      department: employees.department,
      joinedAt: employees.joinedAt,
      designation: designations.name,
      entity: payingEntities.name,
      annualCtc: salaryProfiles.annualCtc,
    })
    .from(employees)
    .leftJoin(designations, eq(designations.id, employees.designationId))
    .leftJoin(payingEntities, eq(payingEntities.id, employees.payingEntityId))
    .leftJoin(salaryProfiles, eq(salaryProfiles.employeeId, employees.id))
    .where(eq(employees.isActive, true))
    .orderBy(employees.name);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    designation: r.designation,
    department: r.department,
    entity: r.entity,
    joiningDate: isoDate(r.joinedAt),
    annualCtc: r.annualCtc,
  }));
}

function toRow(a: Agreement, employeeName: string): AgreementRow {
  return {
    id: a.id,
    employeeId: a.employeeId,
    employeeName,
    type: a.type,
    status: a.status,
    title: a.title,
    signToken: a.signToken,
    signedName: a.signedName,
    signedAt: a.signedAt ? a.signedAt.toISOString() : null,
    sentAt: a.sentAt ? a.sentAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
  };
}

/** All agreements (admin tracker), newest first, with the employee name joined. */
export async function listAgreements(): Promise<AgreementRow[]> {
  const rows = await db
    .select({ a: agreements, employeeName: employees.name })
    .from(agreements)
    .innerJoin(employees, eq(employees.id, agreements.employeeId))
    .orderBy(desc(agreements.createdAt));
  return rows.map((r) => toRow(r.a, r.employeeName));
}

/** Agreements belonging to one employee (their own view). */
export async function agreementsForEmployee(employeeId: string): Promise<AgreementRow[]> {
  const rows = await db
    .select({ a: agreements, employeeName: employees.name })
    .from(agreements)
    .innerJoin(employees, eq(employees.id, agreements.employeeId))
    .where(eq(agreements.employeeId, employeeId))
    .orderBy(desc(agreements.createdAt));
  return rows.map((r) => toRow(r.a, r.employeeName));
}

/** Full agreement + employee name by id (admin) — for preview/edit. */
export async function getAgreement(
  id: string,
): Promise<{ agreement: Agreement; employeeName: string } | null> {
  const [row] = await db
    .select({ a: agreements, employeeName: employees.name })
    .from(agreements)
    .innerJoin(employees, eq(employees.id, agreements.employeeId))
    .where(eq(agreements.id, id))
    .limit(1);
  return row ? { agreement: row.a, employeeName: row.employeeName } : null;
}

/** Full agreement by its unguessable sign token (employee sign link). */
export async function getAgreementByToken(
  token: string,
): Promise<{ agreement: Agreement; employeeName: string } | null> {
  const [row] = await db
    .select({ a: agreements, employeeName: employees.name })
    .from(agreements)
    .innerJoin(employees, eq(employees.id, agreements.employeeId))
    .where(eq(agreements.signToken, token))
    .limit(1);
  return row ? { agreement: row.a, employeeName: row.employeeName } : null;
}
