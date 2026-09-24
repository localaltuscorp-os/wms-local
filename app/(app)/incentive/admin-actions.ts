"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { employees, incentiveEntries, incentiveTargets } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  getIncentivePersonDetail,
  isOwnIncentiveName,
  type IncentivePersonDetail,
} from "@/lib/queries/incentives";
import {
  parseIncentiveImport,
  type IncentiveRosterEntry,
  type ParseIncentiveResult,
} from "@/lib/import/incentive-import";
import { notifyIfPaidIncreased } from "@/lib/incentive/notifications/paid-increase";
import { recordManualIncentivePayment } from "@/lib/incentive/record-manual-payment";
import { round2 } from "@/lib/incentive/payout-math";
import { incentiveAnalyticsScopeFor } from "@/lib/incentive/analytics/scope";
import { visibleNameKeysFor } from "@/lib/incentive/analytics/visible-names";
import { nameKey } from "@/lib/incentive/payout-sources";
import { listActiveProductNames } from "@/lib/queries/products";
import { resolveEmployeeReference } from "@/lib/employees/resolver";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** A date that drizzle's `date` column accepts (YYYY-MM-DD), or null. */
const dateStr = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date")
  .nullable()
  .optional();

/** A non-negative money amount as a number; serialised to a numeric string. */
const money = z.number().finite().min(0).max(1_000_000_000);

const money2 = (n: number): string => n.toFixed(2);

const EntryShape = {
  empName: z.string().trim().min(1, "Employee name is required").max(160),
  employeeId: z.string().uuid().nullable().optional(),
  incentiveName: z.string().trim().min(1, "Incentive name is required").max(160),
  periodMonth: dateStr,
  entryDate: dateStr,
  participantName: z.string().trim().max(200).nullable().optional(),
  prospectGroupName: z.string().trim().max(200).nullable().optional(),
  amount: money.default(0),
  approved: z.boolean().default(false),
  approvedAmt: money.default(0),
  approvedDate: dateStr,
  paid: z.boolean().default(false),
  paidAmt: money.default(0),
  paidDate: dateStr,
  note: z.string().trim().max(2000).nullable().optional(),
};

const CreateEntrySchema = z.object(EntryShape).strict();
const UpdateEntrySchema = z.object({ id: z.string().uuid(), ...EntryShape }).strict();

export type IncentiveEntryInput = z.input<typeof CreateEntrySchema>;

/** Normalise a parsed period to first-of-month, leaving null untouched. */
function monthStartOf(d: string | null | undefined): string | null {
  if (!d) return null;
  return `${d.slice(0, 7)}-01`;
}

const employeeNameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase();

/** Resolve both employee fields against Employee Master and the product against Product Master. */
async function resolveEntryReferences<T extends IncentiveEntryInput>(v: T): Promise<ActionResult<{ value: T }>> {
  const [roster, products] = await Promise.all([activeRoster(), listActiveProductNames()]);
  const resolved = await resolveEmployeeReference({ employeeId: v.employeeId, employeeName: v.empName });
  if (!resolved.ok) return resolved;
  const employee = roster.find((row) => row.id === resolved.employee.id);
  if (!employee) return { ok: false, error: "Employee must be a current Employee Master record with an Employee Code." };
  const product = products.find((name) => employeeNameKey(name) === employeeNameKey(v.incentiveName));
  if (!product) return { ok: false, error: "Incentive Product must be a current Product Master product." };
  return { ok: true, value: { ...v, empName: employee.name, employeeId: employee.id, incentiveName: product } };
}

// --- manual entry CRUD (admin) ---------------------------------------------

/** Create one incentive_entries row. Admin-only. */
export async function createIncentiveEntry(
  input: IncentiveEntryInput,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const checked = await resolveEntryReferences(parsed.data);
  if (!checked.ok) return checked;
  const v = checked.value;

  const [row] = await db
    .insert(incentiveEntries)
    .values({
      empName: v.empName,
      employeeId: v.employeeId ?? null,
      incentiveName: v.incentiveName,
      periodMonth: monthStartOf(v.periodMonth),
      entryDate: v.entryDate ?? null,
      participantName: v.participantName ?? null,
      prospectGroupName: v.prospectGroupName ?? null,
      amount: money2(v.amount),
      approved: v.approved,
      approvedAmt: money2(v.approvedAmt),
      approvedDate: v.approvedDate ?? null,
      paid: v.paid,
      paidAmt: money2(v.paidAmt),
      paidDate: v.paidDate ?? null,
      note: v.note ?? null,
    })
    .returning({ id: incentiveEntries.id });

  revalidatePath("/incentive");
  return { ok: true, id: row!.id };
}

/** Update one incentive_entries row. Admin-only. */
export async function updateIncentiveEntry(
  input: z.input<typeof UpdateEntrySchema>,
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = UpdateEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const checked = await resolveEntryReferences(parsed.data);
  if (!checked.ok) return checked;
  const v = checked.value;

  // Read the paid amount BEFORE the update so a raise can notify the employee —
  // the same "paid increased" edge the Status editor fires on.
  const [prev] = await db
    .select({
      employeeId: incentiveEntries.employeeId,
      incentiveName: incentiveEntries.incentiveName,
      paidAmt: incentiveEntries.paidAmt,
      periodMonth: incentiveEntries.periodMonth,
    })
    .from(incentiveEntries)
    .where(eq(incentiveEntries.id, v.id));

  const increase = round2(v.paidAmt - Number(prev?.paidAmt ?? 0));

  // The entry update and the LEDGER ROW commit together. Recording money paid
  // by hand without the matching `salary_payments` line is what made a manual
  // payment invisible to Accounts and to the payout ledger — see
  // lib/incentive/record-manual-payment.ts.
  await db.transaction(async (tx) => {
    await tx
      .update(incentiveEntries)
      .set({
        empName: v.empName,
        employeeId: v.employeeId ?? null,
        incentiveName: v.incentiveName,
        periodMonth: monthStartOf(v.periodMonth),
        entryDate: v.entryDate ?? null,
        participantName: v.participantName ?? null,
        prospectGroupName: v.prospectGroupName ?? null,
        amount: money2(v.amount),
        approved: v.approved,
        approvedAmt: money2(v.approvedAmt),
        approvedDate: v.approvedDate ?? null,
        paid: v.paid,
        paidAmt: money2(v.paidAmt),
        paidDate: v.paidDate ?? null,
        note: v.note ?? null,
        updatedAt: new Date(),
      })
      .where(eq(incentiveEntries.id, v.id));

    await recordManualIncentivePayment(tx, {
      entryId: v.id,
      employeeId: v.employeeId ?? null,
      empName: v.empName,
      periodMonth: monthStartOf(v.periodMonth),
      paidDate: v.paidDate ?? null,
      increase,
      source: "entries",
      actorId: me.id,
    });
  });

  if (prev) {
    notifyIfPaidIncreased({
      employeeId: prev.employeeId,
      subjectId: v.id,
      leg: "entry",
      label: prev.incentiveName,
      previousPaid: Number(prev.paidAmt),
      paid: v.paidAmt,
      paidDate: v.paidDate ?? null,
      periodMonth: prev.periodMonth,
      actorId: me.id,
    });
  }

  revalidatePath("/incentive");
  return { ok: true };
}

/** Delete one incentive_entries row. Admin-only. */
export async function deleteIncentiveEntry(
  input: { id: string },
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const id = z.string().uuid().safeParse(input.id);
  if (!id.success) return { ok: false, error: "Invalid id" };

  await db.delete(incentiveEntries).where(eq(incentiveEntries.id, id.data));
  revalidatePath("/incentive");
  return { ok: true };
}

// --- targets (admin) -------------------------------------------------------

const SetTargetSchema = z
  .object({
    empName: z.string().trim().min(1, "Employee name is required").max(160),
    employeeId: z.string().uuid().nullable().optional(),
    periodMonth: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date"),
    targetAmount: money,
    /**
     * WHICH KIND OF PERIOD the target is for (migration 0250). Defaults to
     * `month`, which is what every existing caller and every existing row is —
     * so omitting it behaves exactly as before.
     */
    periodType: z.enum(["month", "quarter"]).default("month"),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

/**
 * Upsert a per-person target, keyed by (emp_name, period_month, period_type) on
 * the unique index. Admin-only. period_month is normalised to first-of-month.
 *
 * `period_type` is part of the key, not an attribute: a Q3 target and a July
 * target both anchor on 2026-07-01, and they are two different commitments that
 * must both be storable (migration 0250).
 */
export async function setIncentiveTarget(
  input: z.input<typeof SetTargetSchema>,
): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = SetTargetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  const periodMonth = `${v.periodMonth.slice(0, 7)}-01`;

  await db
    .insert(incentiveTargets)
    .values({
      empName: v.empName,
      employeeId: v.employeeId ?? null,
      periodMonth,
      periodType: v.periodType,
      targetAmount: money2(v.targetAmount),
      note: v.note ?? null,
    })
    .onConflictDoUpdate({
      target: [
        incentiveTargets.empName,
        incentiveTargets.periodMonth,
        incentiveTargets.periodType,
      ],
      set: {
        targetAmount: money2(v.targetAmount),
        employeeId: v.employeeId ?? null,
        note: v.note ?? null,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/incentive");
  return { ok: true };
}

/**
 * Set a person's FULL-YEAR target by writing it to a single January row (so the
 * year-sum picks it up). Convenience for the Targets tab's per-person control,
 * which works in whole-year amounts. Admin-only.
 */
export async function setIncentiveYearTarget(
  input: { empName: string; employeeId?: string | null; year: number; targetAmount: number },
): Promise<ActionResult> {
  const yr = z.number().int().min(2000).max(2100).safeParse(input.year);
  if (!yr.success) return { ok: false, error: "Invalid year" };
  return setIncentiveTarget({
    empName: input.empName,
    employeeId: input.employeeId ?? null,
    periodMonth: `${yr.data}-01-01`,
    targetAmount: input.targetAmount,
  });
}

// --- bulk Excel upload (admin) ---------------------------------------------

async function activeRoster(): Promise<IncentiveRosterEntry[]> {
  const rows = await db
    .select({ id: employees.id, employeeCode: employees.employeeCode, name: employees.name })
    .from(employees)
    .where(and(eq(employees.isActive, true), isNotNull(employees.employeeCode)));
  return rows.map((row) => ({ ...row, employeeCode: row.employeeCode! }));
}

export interface BulkUploadResult {
  ok: boolean;
  created: number;
  skipped: number;
  issues?: { rowNumber: number; field: string; message: string }[];
  error?: string;
}

/**
 * Read the uploaded workbook and parse it, or report why it could not be read.
 *
 * ── WHY THIS IS A DISCRIMINATED RESULT, NOT A UNION WITH THE PARSE ─────────
 * `ParseIncentiveResult` carries an OPTIONAL `fatal` of its own, so a caller
 * cannot tell "no file was uploaded" from "the file parsed, with a fatal
 * problem" by testing that property — `"fatal" in parsed` matched both branches
 * and narrowed neither, which is what stopped this module compiling. The two
 * cases are genuinely different results, so they are different shapes here.
 */
type ImportRead =
  | { ok: false; error: string }
  | { ok: true; parsed: ParseIncentiveResult };

async function readImport(formData: FormData): Promise<ImportRead> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file uploaded." };
  const [roster, products] = await Promise.all([activeRoster(), listActiveProductNames()]);
  return { ok: true, parsed: await parseIncentiveImport(file, roster, products) };
}

/** Parse every row and return every issue. This action writes nothing. */
export async function validateIncentiveEntriesImport(formData: FormData): Promise<BulkUploadResult> {
  await requireAdmin();
  const read = await readImport(formData);
  if (!read.ok) return { ok: false, created: 0, skipped: 0, error: read.error };
  const parsed = read.parsed;
  if (parsed.fatal) return { ok: false, created: 0, skipped: parsed.skipped, error: parsed.fatal };
  if (parsed.issues.length) return { ok: false, created: 0, skipped: parsed.skipped, issues: parsed.issues, error: "Fix every invalid row before import." };
  if (!parsed.rows.length) return { ok: false, created: 0, skipped: parsed.skipped, error: "No usable rows found." };
  return { ok: true, created: parsed.rows.length, skipped: parsed.skipped };
}

/** Re-validate then insert all rows in one transaction after user confirmation. */
export async function confirmIncentiveEntriesImport(formData: FormData): Promise<BulkUploadResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, created: 0, skipped: 0, error: limited.error };
  const read = await readImport(formData);
  if (!read.ok) return { ok: false, created: 0, skipped: 0, error: read.error };
  const parsed = read.parsed;
  if (parsed.fatal) return { ok: false, created: 0, skipped: parsed.skipped, error: parsed.fatal };
  if (parsed.issues.length) return { ok: false, created: 0, skipped: parsed.skipped, issues: parsed.issues, error: "Workbook changed. Fix every invalid row before import." };
  if (!parsed.rows.length) return { ok: false, created: 0, skipped: parsed.skipped, error: "No usable rows found." };

  const values = parsed.rows.map((row) => ({
    incentiveName: row.incentiveName,
    periodMonth: row.periodMonth,
    empName: row.empName,
    employeeId: row.employeeId,
    amount: row.amount.toFixed(2),
    approved: row.approved,
    approvedAmt: row.approvedAmt.toFixed(2),
    approvedDate: row.approvedDate,
    paid: row.paid,
    paidAmt: row.paidAmt.toFixed(2),
    paidDate: row.paidDate,
    note: row.note,
  }));
  try {
    await db.transaction(async (tx) => {
      for (let index = 0; index < values.length; index += 250) {
        await tx.insert(incentiveEntries).values(values.slice(index, index + 250));
      }
    });
  } catch (error: unknown) {
    return { ok: false, created: 0, skipped: parsed.skipped, error: error instanceof Error ? error.message : "Import failed." };
  }
  revalidatePath("/incentive");
  return { ok: true, created: values.length, skipped: parsed.skipped };
}

/** Legacy call shape retained for integrations; browser flow uses validation then confirmation. */
export async function bulkUploadIncentiveEntries(formData: FormData): Promise<BulkUploadResult> {
  return confirmIncentiveEntriesImport(formData);
}

// --- drill-down read action (any signed-in user; gated) --------------------

/**
 * Read one person's incentive detail for a year.
 *
 * ONE PERSON'S LEDGER IS A NAMED READ, so the gate is the viewer's PERMITTED
 * PEOPLE, not their admin flag: themselves, their downline, and anyone an
 * Access Control grant names (lib/incentive/analytics/scope.ts →
 * lib/access/visibility.ts). An administrator with no reporting line to the
 * person is refused like anybody else — which is the whole distinction, because
 * the name in this call arrives from the browser and an admin flag used to be
 * all it took to read a stranger's earnings.
 */
export async function getPersonDetail(
  empName: string,
  year: number,
): Promise<ActionResult<{ detail: IncentivePersonDetail }>> {
  const me = await requireUser();

  const name = z.string().trim().min(1).max(160).safeParse(empName);
  const yr = z.number().int().min(2000).max(2100).safeParse(year);
  if (!name.success || !yr.success) return { ok: false, error: "Invalid input" };

  const scope = await incentiveAnalyticsScopeFor(me);
  if (!scope.all) {
    const permitted = await visibleNameKeysFor(scope);
    if (!permitted || !permitted.has(nameKey(name.data))) {
      return { ok: false, error: "You can only view the incentives of your own team." };
    }
  }

  const detail = await getIncentivePersonDetail(name.data, yr.data);
  return { ok: true, detail };
}
