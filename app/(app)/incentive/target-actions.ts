"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  incentiveCatalog,
  incentiveTargetPlans,
  incentiveTargetPlanProducts,
} from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import { canViewModule } from "@/lib/permissions/resolve";
import { rateLimitOrError } from "@/lib/rate-limit";
import { incentiveAnalyticsScopeFor } from "@/lib/incentive/analytics/scope";
import {
  monthlyCtcForEmployeeIds,
  teamMemberEmployees,
  getTargetBoard,
  getTargetRows,
  type TargetLevel,
  type TargetBoard,
  type TargetRowPage,
  type TargetRowFilters,
} from "@/lib/queries/incentive-target-plans";
import {
  periodBounds,
  isTargetPeriodType,
  type TargetPeriodType,
} from "@/lib/incentive/target-period";
import { getProfile } from "@/lib/queries/salary";

const MODULE = "employees.incentive";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const money2 = (n: number): string => n.toFixed(2);

async function targetScope(me: { id: string; email: string; isAdmin: boolean }) {
  const scope = await incentiveAnalyticsScopeFor(me);
  return scope.all ? { all: true, allowedIds: null as string[] | null } : { all: false, allowedIds: [...scope.employeeIds] };
}

// ── reads ─────────────────────────────────────────────────────────────────

const BoardInput = z
  .object({
    type: z.string(),
    value: z.string().max(20),
    level: z.enum(["team", "user"]),
    subjectId: z.string().uuid().nullable().optional(),
    productName: z.string().trim().max(160).nullable().optional(),
  })
  .strict();

export async function fetchTargetBoard(input: z.input<typeof BoardInput>): Promise<Result<{ data: TargetBoard }>> {
  const me = await requireUser();
  if (!(await canViewModule(MODULE))) return { ok: false, error: "You don't have access to the Incentive module." };
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;

  const parsed = BoardInput.safeParse(input);
  if (!parsed.success || !isTargetPeriodType(parsed.data.type)) {
    return { ok: false, error: "Choose a valid period." };
  }
  const v = parsed.data;
  if (!periodBounds(v.type as TargetPeriodType, v.value)) return { ok: false, error: "Choose a valid period." };

  const { allowedIds } = await targetScope(me);
  if (allowedIds != null && v.subjectId && !allowedIds.includes(v.subjectId)) {
    return { ok: false, error: "You can only view targets in your own scope." };
  }

  try {
    const data = await getTargetBoard({
      type: v.type as TargetPeriodType,
      value: v.value,
      level: v.level as TargetLevel,
      subjectId: v.subjectId ?? null,
      productName: v.productName ?? null,
      allowedIds,
    });
    return { ok: true, data };
  } catch {
    return { ok: false, error: "The target dashboard couldn't load just now — please try again." };
  }
}

const RowsInput = z
  .object({
    filters: z
      .object({
        level: z.enum(["team", "user"]).nullable().optional(),
        subjectId: z.string().uuid().nullable().optional(),
        productName: z.string().trim().max(160).nullable().optional(),
        periodType: z.enum(["week", "month", "quarter", "year"]).nullable().optional(),
        month: z.string().max(7).nullable().optional(),
        quarter: z.string().max(7).nullable().optional(),
        year: z.string().max(4).nullable().optional(),
        status: z.enum(["Upcoming", "Active", "Completed"]).nullable().optional(),
        dateFrom: z.string().max(10).nullable().optional(),
        dateTo: z.string().max(10).nullable().optional(),
      })
      .strict(),
    sort: z.object({ key: z.string().max(32), dir: z.enum(["asc", "desc"]) }).nullable().optional(),
    page: z.number().int().min(0).max(10000).optional(),
    pageSize: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export async function fetchTargetRows(input: z.input<typeof RowsInput>): Promise<Result<{ data: TargetRowPage }>> {
  const me = await requireUser();
  if (!(await canViewModule(MODULE))) return { ok: false, error: "You don't have access to the Incentive module." };
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;

  const parsed = RowsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid filter." };

  const { allowedIds } = await targetScope(me);
  const f = parsed.data.filters;
  if (allowedIds != null && f.subjectId && !allowedIds.includes(f.subjectId)) {
    return { ok: false, error: "You can only view targets in your own scope." };
  }

  try {
    const data = await getTargetRows({
      filters: f as TargetRowFilters,
      sort: parsed.data.sort,
      page: parsed.data.page ?? 0,
      pageSize: parsed.data.pageSize ?? 25,
      allowedIds,
    });
    return { ok: true, data };
  } catch {
    return { ok: false, error: "The target table couldn't load just now — please try again." };
  }
}

// ── form CTC (live validation figure) ─────────────────────────────────────

const CtcInput = z
  .object({ level: z.enum(["team", "user"]), subjectId: z.string().uuid() })
  .strict();

export async function fetchTargetCtc(
  input: z.input<typeof CtcInput>,
): Promise<Result<{ monthlyCtc: number; minRequired: number }>> {
  const me = await requireUser();
  if (!(await canViewModule(MODULE))) return { ok: false, error: "You don't have access to the Incentive module." };
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;

  const parsed = CtcInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a team or user." };

  const { level, subjectId } = parsed.data;
  let monthlyCtc = 0;
  if (level === "user") {
    const profile = await getProfile(subjectId);
    monthlyCtc = profile ? profile.annualCtc / 12 : 0;
  } else {
    const members = await teamMemberEmployees(subjectId);
    monthlyCtc = await monthlyCtcForEmployeeIds(members.map((m) => m.id));
  }
  return { ok: true, monthlyCtc, minRequired: monthlyCtc * 0.1 };
}

// ── create / update (admin) ───────────────────────────────────────────────

const ProductLine = z
  .object({
    productId: z.string().uuid(),
    quantity: z.number().finite().positive("Quantity must be more than 0.").max(1_000_000),
  })
  .strict();

const CreateTargetInput = z
  .object({
    targetLevel: z.enum(["team", "user"]),
    subjectId: z.string().uuid(),
    periodType: z.enum(["week", "month", "quarter", "year"]),
    periodValue: z.string().max(20),
    note: z.string().trim().max(2000).nullable().optional(),
    products: z.array(ProductLine).min(1, "Add at least one product.").max(50),
  })
  .strict();

export async function createTargetPlan(
  input: z.input<typeof CreateTargetInput>,
): Promise<Result<{ planId: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateTargetInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid target." };

  const v = parsed.data;
  const bounds = periodBounds(v.periodType, v.periodValue);
  if (!bounds) return { ok: false, error: "Choose a valid period." };

  // Resolve every product's live rate from the Incentive Master — never the
  // client's word for it.
  const catalogIds = v.products.map((p) => p.productId);
  const catalogRows = await db
    .select({ id: incentiveCatalog.id, name: incentiveCatalog.name, amount: incentiveCatalog.amount, productId: incentiveCatalog.productId })
    .from(incentiveCatalog)
    .where(and(eq(incentiveCatalog.active, true), inArray(incentiveCatalog.id, catalogIds)));
  const byId = new Map(catalogRows.map((r) => [r.id, r]));
  const okLines: Array<{ productId: string | null; productName: string; rate: number; quantity: number; targetAmount: number }> = [];
  for (const p of v.products) {
    const c = byId.get(p.productId);
    if (!c) return { ok: false, error: "One of the selected products is no longer available." };
    okLines.push({
      productId: c.productId,
      productName: c.name,
      rate: Number(c.amount),
      quantity: p.quantity,
      targetAmount: Number(c.amount) * p.quantity,
    });
  }
  const totalAmount = okLines.reduce((s, l) => s + l.targetAmount, 0);

  // 10% of monthly CTC — user vs team basis.
  let monthlyCtc = 0;
  if (v.targetLevel === "user") {
    const profile = await getProfile(v.subjectId);
    monthlyCtc = profile ? profile.annualCtc / 12 : 0;
  } else {
    const members = await teamMemberEmployees(v.subjectId);
    monthlyCtc = await monthlyCtcForEmployeeIds(members.map((m) => m.id));
  }
  if (monthlyCtc <= 0) {
    return { ok: false, error: "No CTC on record for this team or user — a target cannot be validated without it." };
  }
  const minRequired = monthlyCtc * 0.1;
  if (totalAmount < minRequired) {
    return {
      ok: false,
      error: `Target does not meet the minimum requirement. Minimum required target: Rs. ${Math.round(minRequired).toLocaleString("en-IN")}. Current target: Rs. ${Math.round(totalAmount).toLocaleString("en-IN")}.`,
    };
  }

  // Upsert the plan header, keyed by subject + period.
  const subjectCol = v.targetLevel === "user" ? incentiveTargetPlans.employeeId : incentiveTargetPlans.teamOwnerId;
  const existing = await db
    .select({ id: incentiveTargetPlans.id })
    .from(incentiveTargetPlans)
    .where(
      and(
        eq(incentiveTargetPlans.targetLevel, v.targetLevel),
        eq(subjectCol, v.subjectId),
        eq(incentiveTargetPlans.periodType, v.periodType),
        eq(incentiveTargetPlans.periodStart, bounds.start),
      ),
    )
    .limit(1);

  let planId: string;
  await db.transaction(async (tx) => {
    if (existing.length > 0) {
      planId = existing[0]!.id;
      await tx
        .update(incentiveTargetPlans)
        .set({ note: v.note ?? null, updatedAt: new Date() })
        .where(eq(incentiveTargetPlans.id, planId));
    } else {
      const [row] = await tx
        .insert(incentiveTargetPlans)
        .values({
          targetLevel: v.targetLevel,
          employeeId: v.targetLevel === "user" ? v.subjectId : null,
          teamOwnerId: v.targetLevel === "team" ? v.subjectId : null,
          periodType: v.periodType,
          periodStart: bounds.start,
          periodEnd: bounds.end,
          note: v.note ?? null,
          createdBy: me.id,
        })
        .returning({ id: incentiveTargetPlans.id });
      planId = row!.id;
    }

    // Upsert each product line, updating quantity when the product is already
    // on the plan rather than creating a conflicting row.
    for (const l of okLines) {
      await tx
        .insert(incentiveTargetPlanProducts)
        .values({
          planId,
          productId: l.productId,
          productName: l.productName,
          quantity: money2(l.quantity),
          rate: money2(l.rate),
          targetAmount: money2(l.targetAmount),
        })
        .onConflictDoUpdate({
          target: [incentiveTargetPlanProducts.planId, incentiveTargetPlanProducts.productName],
          set: {
            quantity: money2(l.quantity),
            rate: money2(l.rate),
            targetAmount: money2(l.targetAmount),
          },
        });
    }
  });

  revalidatePath("/incentive");
  return { ok: true, planId: planId! };
}

// ── delete (admin) ────────────────────────────────────────────────────────

export async function deleteTargetPlan(input: { planId: string }): Promise<Result> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const id = z.string().uuid().safeParse(input.planId);
  if (!id.success) return { ok: false, error: "Invalid target." };

  await db.delete(incentiveTargetPlans).where(eq(incentiveTargetPlans.id, id.data));
  revalidatePath("/incentive");
  return { ok: true };
}
