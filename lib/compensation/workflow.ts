import "server-only";
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { db } from "@/lib/db";
import {
  attendanceSheetDay,
  attendanceSheetMonth,
  attendanceLogs,
  compensationApprovals,
  employees,
  incentiveRequests,
  moduleSubmissionAttachments,
  moduleSubmissions,
  salaryBreakup,
  superAdminGrants,
} from "@/db/schema";
import { employeeDepartmentNames } from "@/lib/queries/departments";
import { matchesDepartment, ACCOUNTS_DEPARTMENT } from "@/lib/workspaces";
import { employeeEmailTargets } from "@/lib/email/recipients";
import { getResend, FROM, companyBcc, clampSubject } from "@/lib/email/resend";
import { notify } from "@/lib/notifications/dispatch";
import { sendDocumentTemplate, uploadMedia } from "@/lib/whatsapp/media";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { legacyBillKind } from "@/lib/reimbursements/attachment-rules";
import { hasDatabaseSuperAdminGrant } from "@/lib/security/super-admin-grants";

export const APPROVAL_KINDS = ["attendance", "incentive", "reimbursement", "salary"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];
export type ApprovalStatus = "pending" | "approved" | "rejected" | "paid";

export type AttendancePerformanceDay = {
  date: string;
  day: number;
  code: string;
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number | null;
};

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
  /** Reimbursement document metadata only; signed file links are minted on demand. */
  attachmentCount?: number;
  /** Legacy external receipt link, when the claim still carries one. */
  receiptUrl?: string | null;
  daily: AttendancePerformanceDay[];
};

const amountOf = (raw: unknown) => {
  const n = Number(String(raw ?? "0").replace(/\brs\.?/gi, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function approvalStatus(row: { status: string } | undefined): ApprovalStatus {
  if (row?.status === "approved" || row?.status === "rejected" || row?.status === "paid") {
    return row.status;
  }
  return "pending";
}

/** Check the PostgreSQL SQLSTATE so unrelated database failures are never hidden. */
function isMissingDatabaseRelation(error: unknown): boolean {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } } | null;
  return candidate?.code === "42P01" || candidate?.cause?.code === "42P01";
}

function externalReceiptUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * Source records may be read before this additive workflow is installed, but
 * decisions and payments must remain unavailable until its audit table exists.
 */
export async function isCompensationApprovalWorkflowReady(): Promise<boolean> {
  const [row] = (await db.execute(sql`
    select to_regclass('public.compensation_approvals') as table_name
  `)) as unknown as Array<{ table_name: string | null }>;
  return row?.table_name != null;
}

/** The Approval screen reads existing source records, so historic items never
 * disappear merely because this additive workflow table did not exist yet. */
export async function listCompensationApprovals(kind?: ApprovalKind): Promise<ApprovalRow[]> {
  const wanted = kind ? [kind] : APPROVAL_KINDS;
  let approvals: (typeof compensationApprovals.$inferSelect)[] = [];
  if (await isCompensationApprovalWorkflowReady()) {
    try {
      approvals = await db.select().from(compensationApprovals).where(kind ? eq(compensationApprovals.kind, kind) : undefined);
    } catch (error) {
      if (!isMissingDatabaseRelation(error)) throw error;
    }
  }
  const byKey = new Map(approvals.map((a) => [`${a.kind}:${a.subjectId}`, a]));
  const out: ApprovalRow[] = [];

  if (wanted.includes("attendance")) {
    const [months, days] = await Promise.all([
      db.select({ id: attendanceSheetMonth.id, employeeId: attendanceSheetMonth.employeeId, employeeName: employees.name, month: attendanceSheetMonth.month, worked: attendanceSheetMonth.totalDaysWorked })
        .from(attendanceSheetMonth).innerJoin(employees, eq(attendanceSheetMonth.employeeId, employees.id)).orderBy(desc(attendanceSheetMonth.month)),
      db.select({ employeeId: attendanceSheetDay.employeeId, month: attendanceSheetDay.month, day: attendanceSheetDay.day, date: attendanceSheetDay.date, code: attendanceSheetDay.statusCode })
        .from(attendanceSheetDay),
    ]);
    const attendanceEmployeeIds = [...new Set(months.map((row) => row.employeeId).filter((id): id is string => !!id))];
    const attendanceMonths = months.map((row) => String(row.month)).sort();
    const firstMonth = attendanceMonths[0];
    const lastMonth = attendanceMonths.at(-1);
    const lastDay = lastMonth ? new Date(Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)), 0)).toISOString().slice(0, 10) : null;
    const punches = attendanceEmployeeIds.length && firstMonth && lastDay
      ? await db.select({ employeeId: attendanceLogs.employeeId, logDate: attendanceLogs.logDate, kind: attendanceLogs.kind, loggedAt: attendanceLogs.loggedAt })
        .from(attendanceLogs)
        .where(and(inArray(attendanceLogs.employeeId, attendanceEmployeeIds), gte(attendanceLogs.logDate, firstMonth), lte(attendanceLogs.logDate, lastDay)))
      : [];
    const punchesByKey = new Map<string, { checkIn: string | null; checkOut: string | null }>();
    for (const punch of punches) {
      const key = `${punch.employeeId}:${String(punch.logDate)}`;
      const current = punchesByKey.get(key) ?? { checkIn: null, checkOut: null };
      if (punch.kind === "in") current.checkIn = punch.loggedAt.toISOString();
      if (punch.kind === "out") current.checkOut = punch.loggedAt.toISOString();
      punchesByKey.set(key, current);
    }
    const dailyByKey = new Map<string, AttendancePerformanceDay[]>();
    for (const d of days) if (d.employeeId) {
      const key = `${d.employeeId}:${String(d.month)}`;
      const date = d.date ? String(d.date) : `${String(d.month).slice(0, 7)}-${String(d.day).padStart(2, "0")}`;
      const punchesForDay = punchesByKey.get(`${d.employeeId}:${date}`) ?? { checkIn: null, checkOut: null };
      const workedMinutes = punchesForDay.checkIn && punchesForDay.checkOut
        ? Math.max(0, Math.round((new Date(punchesForDay.checkOut).getTime() - new Date(punchesForDay.checkIn).getTime()) / 60_000))
        : null;
      dailyByKey.set(key, [...(dailyByKey.get(key) ?? []), { date, day: d.day, code: d.code, ...punchesForDay, workedMinutes }]);
    }
    for (const row of months) if (row.employeeId) {
      const a = byKey.get(`attendance:${row.id}`);
      const daily = (dailyByKey.get(`${row.employeeId}:${String(row.month)}`) ?? []).sort((left, right) => left.date.localeCompare(right.date));
      out.push({ kind: "attendance", subjectId: row.id, employeeId: row.employeeId, employeeName: row.employeeName, periodMonth: String(row.month), label: `Monthly attendance · ${row.worked} worked days`, amount: 0, status: approvalStatus(a), note: a?.decisionNote ?? null, daily });
    }
  }
  if (wanted.includes("incentive")) {
    const rows = await db.select({ id: incentiveRequests.id, employeeId: incentiveRequests.employeeId, employeeName: employees.name, createdAt: incentiveRequests.createdAt, type: incentiveRequests.type, status: incentiveRequests.status })
      .from(incentiveRequests).innerJoin(employees, eq(incentiveRequests.employeeId, employees.id)).orderBy(desc(incentiveRequests.createdAt));
    for (const row of rows) {
      const approval = byKey.get(`incentive:${row.id}`);
      const sourceStatus = row.status === "approved" || row.status === "rejected" ? row.status : undefined;
      out.push({ kind: "incentive", subjectId: row.id, employeeId: row.employeeId, employeeName: row.employeeName, periodMonth: row.createdAt.toISOString().slice(0, 7), label: `Incentive request · ${row.type}`, amount: amountOf(approval?.payableAmount), status: approvalStatus(approval ?? (sourceStatus ? { status: sourceStatus } : undefined)), note: approval?.decisionNote ?? null, daily: [] });
    }
  }
  if (wanted.includes("reimbursement")) {
    const rows = await db.select({ id: moduleSubmissions.id, employeeId: moduleSubmissions.employeeId, employeeName: employees.name, createdAt: moduleSubmissions.createdAt, fields: moduleSubmissions.fields })
      .from(moduleSubmissions).innerJoin(employees, eq(moduleSubmissions.employeeId, employees.id))
      .where(and(eq(moduleSubmissions.module, "reimbursement"), eq(moduleSubmissions.archived, false))).orderBy(desc(moduleSubmissions.createdAt));
    const attachmentCounts = new Map<string, number>();
    if (rows.length) {
      try {
        const attachmentRows = await db.select({ submissionId: moduleSubmissionAttachments.submissionId, total: count() })
          .from(moduleSubmissionAttachments)
          .where(inArray(moduleSubmissionAttachments.submissionId, rows.map((row) => row.id)))
          .groupBy(moduleSubmissionAttachments.submissionId);
        for (const attachment of attachmentRows) attachmentCounts.set(attachment.submissionId, Number(attachment.total));
      } catch (error) {
        // Older environments may not have the additive documents migration yet;
        // claims remain readable and simply show no stored-document count.
        if (!isMissingDatabaseRelation(error)) throw error;
      }
    }
    for (const row of rows) {
      const a = byKey.get(`reimbursement:${row.id}`);
      const receipt = String(row.fields?.bill_url ?? "").trim();
      const receiptKind = legacyBillKind(receipt);
      out.push({
        kind: "reimbursement", subjectId: row.id, employeeId: row.employeeId, employeeName: row.employeeName,
        periodMonth: row.createdAt.toISOString().slice(0, 7), label: "Reimbursement claim",
        amount: amountOf(a?.payableAmount ?? row.fields.amount), status: approvalStatus(a), note: a?.decisionNote ?? null,
        attachmentCount: (attachmentCounts.get(row.id) ?? 0) + (receiptKind === "path" ? 1 : 0),
        receiptUrl: receiptKind === "url" ? externalReceiptUrl(receipt) : null,
        daily: [],
      });
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

/** Only audited database-backed Super Admins may view this financial queue. */
export async function canViewCompensationApprovals(actor: { id: string }): Promise<boolean> {
  return hasDatabaseSuperAdminGrant(actor.id);
}

/** Dummy-only decision correction still requires the same Super Admin grant. */
export async function canEditCompensationApprovals(actor: { id: string }): Promise<boolean> {
  return DUMMY_MODE && hasDatabaseSuperAdminGrant(actor.id);
}

/** Financial decisions remain restricted to audited database-backed Super Admins. */
export async function canDecideCompensation(actor: { id: string }): Promise<boolean> {
  return hasDatabaseSuperAdminGrant(actor.id);
}

export async function isAccountsPayer(employee: { id: string; department: string | null }): Promise<boolean> {
  const structured = await employeeDepartmentNames(employee.id).catch(() => [] as string[]);
  const departments = employee.department ? [...structured, employee.department] : structured;
  return matchesDepartment(departments, ACCOUNTS_DEPARTMENT);
}

/** Alert every active compensation approver when a financial item awaits review.
 * The notification dispatcher provides both inbox and email delivery. */
export async function notifyCompensationApproversOfPendingApproval(input: { kind: ApprovalKind; actorId: string; employeeName: string }) {
  try {
    const recipients = await db
      .select({ id: employees.id })
      .from(employees)
      .innerJoin(superAdminGrants, eq(superAdminGrants.employeeId, employees.id))
      .where(eq(employees.isActive, true));
    await Promise.all(recipients.map((person) => notify({
      userId: person.id, actorId: input.actorId, kind: "status_changed",
      title: `Approval pending · ${input.kind}`,
      body: `${input.employeeName} has a ${input.kind} item waiting for approval.`, channels: ["email", "push"],
    })));
  } catch (error) {
    if (!isMissingDatabaseRelation(error)) throw error;
  }
}

export async function decideCompensationApproval(input: { kind: ApprovalKind; subjectId: string; employeeId: string; periodMonth: string | null; amount: number; status: "approved" | "rejected"; note?: string | null; actorId: string; allowExistingDecision?: boolean }) {
  if (!(await isCompensationApprovalWorkflowReady())) return { ok: false as const, error: "Approvals are in setup mode. Install the compensation approval database migration before recording a decision." };
  const source = (await listCompensationApprovals(input.kind)).find((row) => row.subjectId === input.subjectId);
  if (!source || source.employeeId !== input.employeeId) return { ok: false as const, error: "Approval item was not found." };
  if (source.status !== "pending" && !input.allowExistingDecision) return { ok: false as const, error: "This item has already received a decision and cannot be decided again." };
  const amount = Math.max(0, Math.round(input.amount * 100) / 100);
  if (input.status === "approved" && input.kind !== "attendance" && amount <= 0) return { ok: false as const, error: "Enter an approved amount greater than zero." };
  const now = new Date();
  await db.insert(compensationApprovals).values({ kind: input.kind, subjectId: input.subjectId, employeeId: source.employeeId, periodMonth: source.periodMonth ? `${source.periodMonth.slice(0, 7)}-01` : null, payableAmount: amount.toFixed(2), status: input.status, decisionNote: input.note?.trim() || null, decidedById: input.actorId, decidedAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: [compensationApprovals.kind, compensationApprovals.subjectId], set: { payableAmount: amount.toFixed(2), status: input.status, decisionNote: input.note?.trim() || null, decidedById: input.actorId, decidedAt: now, updatedAt: now } });
  return { ok: true as const };
}

export async function compensationApprovalIsPayable(kind: ApprovalKind, subjectId: string): Promise<boolean> {
  if (!(await isCompensationApprovalWorkflowReady())) return false;
  const [row] = await db.select({ status: compensationApprovals.status })
    .from(compensationApprovals)
    .where(and(eq(compensationApprovals.kind, kind), eq(compensationApprovals.subjectId, subjectId)))
    .limit(1);
  return row?.status === "approved";
}

export async function markCompensationPaid(input: { kind: ApprovalKind; subjectId: string; actorId: string }): Promise<{ ok: true; row: ApprovalRow } | { ok: false; error: string }> {
  if (!(await isCompensationApprovalWorkflowReady())) return { ok: false, error: "Approvals are in setup mode. Install the compensation approval database migration before recording a payment." };
  const rows = await listCompensationApprovals(input.kind);
  const row = rows.find((candidate) => candidate.subjectId === input.subjectId);
  if (!row) return { ok: false, error: "Approval item was not found." };
  if (row.status !== "approved") return { ok: false, error: "Only an approved item can be paid." };
  const now = new Date();
  // Older approved incentive requests may not have a compensation handoff row
  // yet. Upsert the paid handoff so the audit is never silently skipped.
  await db.insert(compensationApprovals).values({
    kind: input.kind,
    subjectId: input.subjectId,
    employeeId: row.employeeId,
    periodMonth: row.periodMonth ? `${row.periodMonth.slice(0, 7)}-01` : null,
    payableAmount: row.amount.toFixed(2),
    paidAmount: row.amount.toFixed(2),
    status: "paid",
    paidById: input.actorId,
    paidAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [compensationApprovals.kind, compensationApprovals.subjectId],
    set: { status: "paid", paidAmount: row.amount.toFixed(2), paidById: input.actorId, paidAt: now, updatedAt: now },
  });
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

/**
 * Sends the same PDF receipt on WhatsApp when the employee has opted in and a
 * Meta-approved document template is configured. Missing Meta configuration is
 * intentionally a no-op, so messaging cannot block a recorded payment.
 */
export async function sendCompensationReceiptWhatsApp(row: ApprovalRow, paidAt: Date): Promise<void> {
  const templateName = process.env.META_WHATSAPP_PAYMENT_RECEIPT_TEMPLATE;
  if (!templateName) return;
  const [person] = await db.select({
    name: employees.name,
    whatsappOptedIn: employees.whatsappOptedIn,
    whatsappPhone: employees.whatsappPhone,
    whatsappTemplateLocale: employees.whatsappTemplateLocale,
  }).from(employees).where(eq(employees.id, row.employeeId)).limit(1);
  if (!person?.whatsappOptedIn || !person.whatsappPhone) return;
  const pdf = await receiptPdf(row, paidAt);
  const media = await uploadMedia(pdf, "application/pdf");
  if (!media.ok) return;
  await sendDocumentTemplate({
    toPhone: person.whatsappPhone,
    templateName,
    mediaId: media.id,
    filename: `Altus-${row.kind}-receipt.pdf`,
    languageCode: person.whatsappTemplateLocale,
    params: [
      person.name,
      row.kind,
      row.periodMonth ?? "Not month-specific",
      row.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 }),
      paidAt.toLocaleDateString("en-IN"),
    ],
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
