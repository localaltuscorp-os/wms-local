import "server-only";
import { and, desc, eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { db } from "@/lib/db";
import {
  attendanceSheetDay,
  attendanceSheetMonth,
  compensationApprovals,
  employees,
  incentiveRequests,
  moduleSubmissions,
  salaryBreakup,
} from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { employeeDepartmentNames } from "@/lib/queries/departments";
import { matchesDepartment, ACCOUNTS_DEPARTMENT } from "@/lib/workspaces";
import { employeeEmailTargets } from "@/lib/email/recipients";
import { getResend, FROM, companyBcc, clampSubject } from "@/lib/email/resend";
import { notify } from "@/lib/notifications/dispatch";

export const APPROVAL_KINDS = ["attendance", "incentive", "reimbursement", "salary"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];
export type ApprovalStatus = "pending" | "approved" | "rejected" | "paid";

export type ApprovalRow = {
  kind: ApprovalKind;
  subjectId: string;
  employeeId: string;
  employeeName: string;
  periodMonth: string | null;
  label: string;
  amount: number;
  status: ApprovalStatus;
  note: string | null;
  daily: { day: number; code: string }[];
};

const amountOf = (raw: unknown) => {
  const n = Number(String(raw ?? "0").replace(/\brs\.?/gi, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function approvalStatus(row: { status: string } | undefined): ApprovalStatus {
  return row?.status === "approved" || row?.status === "rejected" || row?.status === "paid"
    ? row.status
    : "pending";
}

/** The Approval screen reads existing source records, so historic items never
 * disappear merely because this additive workflow table did not exist yet. */
export async function listCompensationApprovals(kind?: ApprovalKind): Promise<ApprovalRow[]> {
  const wanted = kind ? [kind] : APPROVAL_KINDS;
  const approvals = await db.select().from(compensationApprovals).where(kind ? eq(compensationApprovals.kind, kind) : undefined);
  const byKey = new Map(approvals.map((a) => [`${a.kind}:${a.subjectId}`, a]));
  const out: ApprovalRow[] = [];

  if (wanted.includes("attendance")) {
    const [months, days] = await Promise.all([
      db.select({ id: attendanceSheetMonth.id, employeeId: attendanceSheetMonth.employeeId, employeeName: employees.name, month: attendanceSheetMonth.month, worked: attendanceSheetMonth.totalDaysWorked })
        .from(attendanceSheetMonth).innerJoin(employees, eq(attendanceSheetMonth.employeeId, employees.id)).orderBy(desc(attendanceSheetMonth.month)),
      db.select({ employeeId: attendanceSheetDay.employeeId, month: attendanceSheetDay.month, day: attendanceSheetDay.day, code: attendanceSheetDay.statusCode })
        .from(attendanceSheetDay),
    ]);
    const dailyByKey = new Map<string, { day: number; code: string }[]>();
    for (const d of days) if (d.employeeId) {
      const key = `${d.employeeId}:${String(d.month)}`;
      dailyByKey.set(key, [...(dailyByKey.get(key) ?? []), { day: d.day, code: d.code }]);
    }
    for (const row of months) if (row.employeeId) {
      const a = byKey.get(`attendance:${row.id}`);
      out.push({ kind: "attendance", subjectId: row.id, employeeId: row.employeeId, employeeName: row.employeeName, periodMonth: String(row.month), label: `Monthly attendance · ${row.worked} worked days`, amount: 0, status: approvalStatus(a), note: a?.decisionNote ?? null, daily: dailyByKey.get(`${row.employeeId}:${String(row.month)}`) ?? [] });
    }
  }
  if (wanted.includes("incentive")) {
    const rows = await db.select({ id: incentiveRequests.id, employeeId: incentiveRequests.employeeId, employeeName: employees.name, createdAt: incentiveRequests.createdAt, type: incentiveRequests.type })
      .from(incentiveRequests).innerJoin(employees, eq(incentiveRequests.employeeId, employees.id)).orderBy(desc(incentiveRequests.createdAt));
    for (const row of rows) {
      const a = byKey.get(`incentive:${row.id}`);
      out.push({ kind: "incentive", subjectId: row.id, employeeId: row.employeeId, employeeName: row.employeeName, periodMonth: row.createdAt.toISOString().slice(0, 7), label: `Incentive request · ${row.type}`, amount: amountOf(a?.payableAmount), status: approvalStatus(a), note: a?.decisionNote ?? null, daily: [] });
    }
  }
  if (wanted.includes("reimbursement")) {
    const rows = await db.select({ id: moduleSubmissions.id, employeeId: moduleSubmissions.employeeId, employeeName: employees.name, createdAt: moduleSubmissions.createdAt, fields: moduleSubmissions.fields })
      .from(moduleSubmissions).innerJoin(employees, eq(moduleSubmissions.employeeId, employees.id))
      .where(and(eq(moduleSubmissions.module, "reimbursement"), eq(moduleSubmissions.archived, false))).orderBy(desc(moduleSubmissions.createdAt));
    for (const row of rows) {
      const a = byKey.get(`reimbursement:${row.id}`);
      out.push({ kind: "reimbursement", subjectId: row.id, employeeId: row.employeeId, employeeName: row.employeeName, periodMonth: row.createdAt.toISOString().slice(0, 7), label: "Reimbursement claim", amount: amountOf(a?.payableAmount ?? row.fields.amount), status: approvalStatus(a), note: a?.decisionNote ?? null, daily: [] });
    }
  }
  if (wanted.includes("salary")) {
    const rows = await db.select({ id: salaryBreakup.id, employeeId: salaryBreakup.employeeId, employeeName: employees.name, month: salaryBreakup.month, finalPayment: salaryBreakup.finalPayment })
      .from(salaryBreakup).innerJoin(employees, eq(salaryBreakup.employeeId, employees.id)).orderBy(desc(salaryBreakup.month));
    for (const row of rows) if (row.employeeId) {
      const a = byKey.get(`salary:${row.id}`);
      out.push({ kind: "salary", subjectId: row.id, employeeId: row.employeeId, employeeName: row.employeeName, periodMonth: String(row.month), label: "Monthly salary", amount: amountOf(a?.payableAmount ?? row.finalPayment), status: approvalStatus(a), note: a?.decisionNote ?? null, daily: [] });
    }
  }
  return out;
}

export function assertSuperAdmin(email: string | null | undefined) {
  return isSuperAdmin(email);
}

export async function isAccountsPayer(employee: { id: string; department: string | null }): Promise<boolean> {
  const structured = await employeeDepartmentNames(employee.id).catch(() => [] as string[]);
  const departments = employee.department ? [...structured, employee.department] : structured;
  return matchesDepartment(departments, ACCOUNTS_DEPARTMENT);
}

/** Alert every active super-admin when a new financial approval awaits review.
 * The notification dispatcher provides both inbox and email delivery. */
export async function notifySuperAdminsOfPendingApproval(input: { kind: ApprovalKind; actorId: string; employeeName: string }) {
  const recipients = await db.select({ id: employees.id, email: employees.email }).from(employees).where(eq(employees.isActive, true));
  await Promise.all(recipients.filter((person) => isSuperAdmin(person.email)).map((person) => notify({
    userId: person.id, actorId: input.actorId, kind: "status_changed",
    title: `Approval pending · ${input.kind}`,
    body: `${input.employeeName} has a ${input.kind} item waiting for approval.`, channels: ["email", "push"],
  })));
}

export async function decideCompensationApproval(input: { kind: ApprovalKind; subjectId: string; employeeId: string; periodMonth: string | null; amount: number; status: "approved" | "rejected"; note?: string | null; actorId: string }) {
  const source = (await listCompensationApprovals(input.kind)).find((row) => row.subjectId === input.subjectId);
  if (!source || source.employeeId !== input.employeeId) return { ok: false as const, error: "Approval item was not found." };
  if (source.status === "paid") return { ok: false as const, error: "A paid item cannot be re-approved or rejected." };
  const amount = Math.max(0, Math.round(input.amount * 100) / 100);
  if (input.status === "approved" && input.kind !== "attendance" && amount <= 0) return { ok: false as const, error: "Enter an approved amount greater than zero." };
  const now = new Date();
  await db.insert(compensationApprovals).values({ kind: input.kind, subjectId: input.subjectId, employeeId: source.employeeId, periodMonth: source.periodMonth ? `${source.periodMonth.slice(0, 7)}-01` : null, payableAmount: amount.toFixed(2), status: input.status, decisionNote: input.note?.trim() || null, decidedById: input.actorId, decidedAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [compensationApprovals.kind, compensationApprovals.subjectId], set: { payableAmount: amount.toFixed(2), status: input.status, decisionNote: input.note?.trim() || null, decidedById: input.actorId, decidedAt: now, updatedAt: now } });
  return { ok: true as const };
}

export async function compensationApprovalIsPayable(kind: ApprovalKind, subjectId: string): Promise<boolean> {
  const [row] = await db.select({ status: compensationApprovals.status })
    .from(compensationApprovals)
    .where(and(eq(compensationApprovals.kind, kind), eq(compensationApprovals.subjectId, subjectId)))
    .limit(1);
  return row?.status === "approved";
}

export async function markCompensationPaid(input: { kind: ApprovalKind; subjectId: string; actorId: string }): Promise<{ ok: true; row: ApprovalRow } | { ok: false; error: string }> {
  const rows = await listCompensationApprovals(input.kind);
  const row = rows.find((candidate) => candidate.subjectId === input.subjectId);
  if (!row) return { ok: false, error: "Approval item was not found." };
  if (row.status !== "approved") return { ok: false, error: "Only an approved item can be paid." };
  const now = new Date();
  await db.update(compensationApprovals).set({ status: "paid", paidAmount: row.amount.toFixed(2), paidById: input.actorId, paidAt: now, updatedAt: now })
    .where(and(eq(compensationApprovals.kind, input.kind), eq(compensationApprovals.subjectId, input.subjectId)));
  if (input.kind === "salary") {
    await db.update(salaryBreakup).set({ paid: true, amountPaid: row.amount.toFixed(2), paidAt: now, paidById: input.actorId }).where(eq(salaryBreakup.id, input.subjectId));
  }
  if (input.kind === "reimbursement") {
    const [claim] = await db.select({ adminFields: moduleSubmissions.adminFields }).from(moduleSubmissions).where(eq(moduleSubmissions.id, input.subjectId)).limit(1);
    if (claim) await db.update(moduleSubmissions).set({ adminFields: { ...claim.adminFields, payment_date: now.toISOString().slice(0, 10) }, updatedAt: now }).where(eq(moduleSubmissions.id, input.subjectId));
  }
  return { ok: true, row };
}

function receiptPdf(row: ApprovalRow, paidAt: Date): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margin: 54 }); const chunks: Buffer[] = [];
    pdf.on("data", (chunk) => chunks.push(Buffer.from(chunk))); pdf.on("end", () => resolve(Buffer.concat(chunks))); pdf.on("error", reject);
    pdf.fillColor("#E10600").fontSize(12).text("ALTUS CORP", { characterSpacing: 1 });
    pdf.fillColor("#111827").fontSize(22).text("Payment receipt", { continued: false });
    pdf.moveDown().fontSize(11).fillColor("#374151").text(`Payment type: ${row.kind}`);
    pdf.text(`Period: ${row.periodMonth ?? "Not month-specific"}`); pdf.text(`Amount paid: Rs. ${row.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
    pdf.text(`Paid on: ${paidAt.toLocaleDateString("en-IN")}`); pdf.moveDown().text("This is an automatically generated payment receipt."); pdf.end();
  });
}

export async function mailCompensationReceipt(row: ApprovalRow, paidAt: Date) {
  const [person] = await db.select({ name: employees.name, email: employees.email, officialEmail: employees.officialEmail, personalEmail: employees.personalEmail })
    .from(employees).where(eq(employees.id, row.employeeId)).limit(1);
  if (!person) return;
  const to = employeeEmailTargets(person); if (to.length === 0) return;
  const resend = getResend(); if (!resend) return;
  const pdf = await receiptPdf(row, paidAt);
  await resend.emails.send({ from: FROM, to, subject: clampSubject(`Payment receipt · ${row.kind} · Altus Corp`), html: `<p>Hello ${person.name}, your approved ${row.kind} payment of <strong>Rs. ${row.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong> has been recorded. Your receipt is attached.</p>`, attachments: [{ filename: `Altus-${row.kind}-receipt.pdf`, content: pdf }], ...companyBcc() });
}
