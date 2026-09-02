import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

// WS-5 Salary core — persistence for the NEW v2 tables (CTC breakup form,
// retention bonus, accountant adjustments).
//
// These three tables are NOT in db/schema.ts yet (per the slice's hard rule:
// don't edit the schema). So this store uses raw parameterised SQL via
// db.execute(sql`…`) — it typechecks today and starts working the moment Sir
// applies the idempotent DDL in the INTEGRATION NOTE. Every read is FAIL-OPEN:
// if the table doesn't exist yet, it returns empty instead of throwing, so the
// UI renders its empty state pre-migration.
//
// Tables (DDL in INTEGRATION NOTE):
//   salary_ctc_breakup     — one CURRENT row per employee (components jsonb)
//   salary_retention_bonus — one CURRENT row per employee
//   salary_adjustments     — many rows per (employee, month)

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v as string);
  return Number.isFinite(n) ? n : 0;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    // Table not yet created / transient error → fail open.
    return fallback;
  }
}

// ── CTC breakup ────────────────────────────────────────────────────────────

export interface StoredCtcComponent {
  label: string;
  annualAmount: number;
}

export interface StoredCtcBreakup {
  employeeId: string;
  payingEntityId: string | null;
  annualCtc: number;
  components: StoredCtcComponent[];
  updatedAt: Date | null;
}

/** The current CTC breakup for one employee, or null. Fail-open. */
export async function getCtcBreakup(employeeId: string): Promise<StoredCtcBreakup | null> {
  return safe(async () => {
    const rows = (await db.execute(sql`
      select employee_id, paying_entity_id, annual_ctc, components, updated_at
      from salary_ctc_breakup
      where employee_id = ${employeeId}
      limit 1
    `)) as unknown as Array<{
      employee_id: string;
      paying_entity_id: string | null;
      annual_ctc: string | number | null;
      components: unknown;
      updated_at: Date | null;
    }>;
    const r = rows[0];
    if (!r) return null;
    const comps = Array.isArray(r.components)
      ? (r.components as StoredCtcComponent[])
      : [];
    return {
      employeeId: r.employee_id,
      payingEntityId: r.paying_entity_id ?? null,
      annualCtc: num(r.annual_ctc),
      components: comps.map((c) => ({ label: String(c.label ?? ""), annualAmount: num(c.annualAmount) })),
      updatedAt: r.updated_at ?? null,
    };
  }, null);
}

/** Upsert the CTC breakup for an employee (one current row). */
export async function upsertCtcBreakup(input: {
  employeeId: string;
  payingEntityId: string | null;
  annualCtc: number;
  components: StoredCtcComponent[];
  updatedById: string | null;
}): Promise<void> {
  const componentsJson = JSON.stringify(input.components);
  await db.execute(sql`
    insert into salary_ctc_breakup
      (employee_id, paying_entity_id, annual_ctc, components, updated_by_id, updated_at)
    values
      (${input.employeeId}, ${input.payingEntityId}, ${input.annualCtc.toFixed(2)},
       ${componentsJson}::jsonb, ${input.updatedById}, now())
    on conflict (employee_id) do update set
      paying_entity_id = excluded.paying_entity_id,
      annual_ctc       = excluded.annual_ctc,
      components        = excluded.components,
      updated_by_id     = excluded.updated_by_id,
      updated_at        = now()
  `);
}

// ── Retention bonus ────────────────────────────────────────────────────────

export interface StoredRetentionBonus {
  employeeId: string;
  amount: number;
  payableDate: string | null;
  paid: boolean;
  paidDate: string | null;
  note: string | null;
}

export async function getRetentionBonus(employeeId: string): Promise<StoredRetentionBonus | null> {
  return safe(async () => {
    const rows = (await db.execute(sql`
      select employee_id, amount, payable_date, paid, paid_date, note
      from salary_retention_bonus
      where employee_id = ${employeeId}
      limit 1
    `)) as unknown as Array<{
      employee_id: string;
      amount: string | number | null;
      payable_date: string | null;
      paid: boolean | null;
      paid_date: string | null;
      note: string | null;
    }>;
    const r = rows[0];
    if (!r) return null;
    return {
      employeeId: r.employee_id,
      amount: num(r.amount),
      payableDate: r.payable_date ?? null,
      paid: r.paid ?? false,
      paidDate: r.paid_date ?? null,
      note: r.note ?? null,
    };
  }, null);
}

export async function upsertRetentionBonus(input: {
  employeeId: string;
  amount: number;
  payableDate: string | null;
  paid: boolean;
  paidDate: string | null;
  note: string | null;
  updatedById: string | null;
}): Promise<void> {
  await db.execute(sql`
    insert into salary_retention_bonus
      (employee_id, amount, payable_date, paid, paid_date, note, updated_by_id, updated_at)
    values
      (${input.employeeId}, ${input.amount.toFixed(2)}, ${input.payableDate},
       ${input.paid}, ${input.paidDate}, ${input.note}, ${input.updatedById}, now())
    on conflict (employee_id) do update set
      amount        = excluded.amount,
      payable_date  = excluded.payable_date,
      paid          = excluded.paid,
      paid_date     = excluded.paid_date,
      note          = excluded.note,
      updated_by_id = excluded.updated_by_id,
      updated_at    = now()
  `);
}

// ── Accountant adjustments ─────────────────────────────────────────────────

export interface StoredAdjustment {
  id: string;
  employeeId: string;
  month: string;
  kind: "deduct" | "ex_gratia";
  days: number;
  reason: string;
  createdAt: Date | null;
}

/** Adjustments for one employee + month (newest first). Fail-open. */
export async function listAdjustments(employeeId: string, month: string): Promise<StoredAdjustment[]> {
  return safe(async () => {
    const rows = (await db.execute(sql`
      select id, employee_id, month, kind, days, reason, created_at
      from salary_adjustments
      where employee_id = ${employeeId} and month = ${month}
      order by created_at desc
    `)) as unknown as Array<{
      id: string;
      employee_id: string;
      month: string;
      kind: string;
      days: string | number | null;
      reason: string;
      created_at: Date | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      month: r.month,
      kind: r.kind === "ex_gratia" ? "ex_gratia" : "deduct",
      days: num(r.days),
      reason: r.reason,
      createdAt: r.created_at ?? null,
    }));
  }, []);
}

/** All adjustments for a month across everyone (for the entity totals screen). */
export async function listAdjustmentsForMonth(month: string): Promise<StoredAdjustment[]> {
  return safe(async () => {
    const rows = (await db.execute(sql`
      select id, employee_id, month, kind, days, reason, created_at
      from salary_adjustments
      where month = ${month}
      order by created_at desc
    `)) as unknown as Array<{
      id: string;
      employee_id: string;
      month: string;
      kind: string;
      days: string | number | null;
      reason: string;
      created_at: Date | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      month: r.month,
      kind: r.kind === "ex_gratia" ? "ex_gratia" : "deduct",
      days: num(r.days),
      reason: r.reason,
      createdAt: r.created_at ?? null,
    }));
  }, []);
}

export async function insertAdjustment(input: {
  employeeId: string;
  month: string;
  kind: "deduct" | "ex_gratia";
  days: number;
  reason: string;
  createdById: string | null;
}): Promise<void> {
  await db.execute(sql`
    insert into salary_adjustments
      (employee_id, month, kind, days, reason, created_by_id, created_at)
    values
      (${input.employeeId}, ${input.month}, ${input.kind}, ${input.days.toFixed(2)},
       ${input.reason}, ${input.createdById}, now())
  `);
}

export async function deleteAdjustment(id: string): Promise<void> {
  await db.execute(sql`delete from salary_adjustments where id = ${id}`);
}
