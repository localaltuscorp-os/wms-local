"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
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
} from "@/lib/import/incentive-import";

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
  const v = parsed.data;

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
  const v = parsed.data;

  await db
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
      paid: v.paid,
      paidAmt: money2(v.paidAmt),
      paidDate: v.paidDate ?? null,
      note: v.note ?? null,
      updatedAt: new Date(),
    })
    .where(eq(incentiveEntries.id, v.id));

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
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

/**
 * Upsert a per-person monthly target, keyed by (emp_name, period_month) on the
 * unique index. Admin-only. period_month is normalised to first-of-month.
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
      targetAmount: money2(v.targetAmount),
      note: v.note ?? null,
    })
    .onConflictDoUpdate({
      target: [incentiveTargets.empName, incentiveTargets.periodMonth],
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
  return db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.isActive, true));
}

export interface BulkUploadResult {
  ok: boolean;
  created: number;
  skipped: number;
  error?: string;
}

/**
 * Parse an uploaded .xlsx/.csv server-side and insert every usable row into
 * incentive_entries. Fuzzy header matching + safe coercion live in
 * lib/import/incentive-import.ts. Admin-only.
 */
export async function bulkUploadIncentiveEntries(
  formData: FormData,
): Promise<BulkUploadResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, created: 0, skipped: 0, error: limited.error };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, created: 0, skipped: 0, error: "No file uploaded." };
  }

  const roster = await activeRoster();
  const parsed = await parseIncentiveImport(file, roster);
  if (parsed.fatal) {
    return { ok: false, created: 0, skipped: parsed.skipped, error: parsed.fatal };
  }
  if (parsed.rows.length === 0) {
    return { ok: false, created: 0, skipped: parsed.skipped, error: "No usable rows found." };
  }

  const values = parsed.rows.map((r) => ({
    srcSrNo: r.srcSrNo,
    entryDate: r.entryDate,
    incentiveName: r.incentiveName,
    periodMonth: r.periodMonth,
    empName: r.empName,
    employeeId: r.employeeId,
    participantName: r.participantName,
    prospectGroupName: r.prospectGroupName,
    amount: r.amount.toFixed(2),
    approved: r.approved,
    approvedAmt: r.approvedAmt.toFixed(2),
    paid: r.paid,
    paidAmt: r.paidAmt.toFixed(2),
    paidDate: r.paidDate,
    note: r.note,
  }));

  let created = 0;
  try {
    // Insert in chunks so a very large sheet stays within statement limits.
    const CHUNK = 250;
    for (let i = 0; i < values.length; i += CHUNK) {
      const slice = values.slice(i, i + CHUNK);
      await db.insert(incentiveEntries).values(slice);
      created += slice.length;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, created, skipped: parsed.skipped, error: `Import stopped after ${created}: ${msg}` };
  }

  revalidatePath("/incentive");
  return { ok: true, created, skipped: parsed.skipped };
}

// --- drill-down read action (any signed-in user; gated) --------------------

/**
 * Read one person's incentive detail for a year. Admins may view anyone;
 * non-admins only themselves (matched by name / their own incentive rows).
 */
export async function getPersonDetail(
  empName: string,
  year: number,
): Promise<ActionResult<{ detail: IncentivePersonDetail }>> {
  const me = await requireUser();

  const name = z.string().trim().min(1).max(160).safeParse(empName);
  const yr = z.number().int().min(2000).max(2100).safeParse(year);
  if (!name.success || !yr.success) return { ok: false, error: "Invalid input" };

  if (!me.isAdmin) {
    const own = await isOwnIncentiveName(name.data, { id: me.id, name: me.name });
    if (!own) return { ok: false, error: "You can only view your own incentive detail." };
  }

  const detail = await getIncentivePersonDetail(name.data, yr.data);
  return { ok: true, detail };
}
