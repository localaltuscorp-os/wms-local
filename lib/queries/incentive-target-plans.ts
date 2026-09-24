import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  incentiveCatalog,
  incentiveEntries,
  incentiveTargetPlans,
  incentiveTargetPlanProducts,
  salaryProfiles,
} from "@/db/schema";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { istYmd } from "@/lib/weekly-goals/week";
import {
  periodBounds,
  type TargetPeriodType,
} from "@/lib/incentive/target-period";

/**
 * INCENTIVE TARGET — planning & performance readers.
 *
 * A "target" is a plan row (one subject over one period) with one or more
 * product lines (quantity × rate). Actual performance is read from the EXISTING
 * permanent-incentive ledger (`incentive_entries`), matched by incentive name
 * (which is the product name) to the employee or team, using the approved
 * amount — the same "earned" basis the rest of the module uses. Project
 * incentives carry no product, so they are not attributable to a product line
 * and are excluded from product-level actual.
 *
 * The legacy `incentive_targets` monthly-amount rows are NOT read here — this
 * module is additive and does not touch them.
 */

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nameKey(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

export type TargetLevel = "team" | "user";
export type TargetStatus = "Upcoming" | "Active" | "Completed";

export interface TargetProductOption {
  id: string;
  name: string;
  rate: number;
  productId: string | null;
}

export interface TeamOption {
  id: string;
  name: string;
  memberCount: number;
}

export interface TargetPlanRow {
  planId: string;
  lineId: string;
  targetLevel: TargetLevel;
  subjectId: string;
  subjectName: string;
  periodType: TargetPeriodType;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  productName: string;
  quantity: number;
  rate: number;
  targetAmount: number;
  /** Always null — the ledger stores amounts only, never a sold quantity. */
  actualQuantity: number | null;
  actualAmount: number;
  achievement: number | null;
  targetSetDate: string;
  status: TargetStatus;
  note: string | null;
}

export interface ProductBucket {
  productName: string;
  targetQuantity: number;
  targetAmount: number;
  actualAmount: number;
  achievement: number | null;
}

export interface TargetBoard {
  period: { type: TargetPeriodType; value: string; start: string; end: string; label: string };
  level: TargetLevel;
  subjectId: string | null;
  subjectName: string | null;
  productName: string | null;
  summary: {
    totalTarget: number;
    totalQuantity: number;
    totalActual: number;
    achievement: number | null;
    productsTargeted: number;
  };
  products: ProductBucket[];
  rows: TargetPlanRow[];
}

// ── catalog / teams ───────────────────────────────────────────────────────

/** Active incentive products, each with its live per-unit rate. */
export async function listTargetProducts(): Promise<TargetProductOption[]> {
  const rows = await db
    .select({
      id: incentiveCatalog.id,
      name: incentiveCatalog.name,
      amount: incentiveCatalog.amount,
      productId: incentiveCatalog.productId,
      sortOrder: incentiveCatalog.sortOrder,
    })
    .from(incentiveCatalog)
    .where(eq(incentiveCatalog.active, true))
    .orderBy(asc(incentiveCatalog.sortOrder), asc(incentiveCatalog.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    rate: num(r.amount),
    productId: r.productId,
  }));
}

/** Managers with at least one direct report — the "team" picker. */
export async function listTeams(): Promise<TeamOption[]> {
  const rows = (await db.execute(sql`
    SELECT m.id, m.name, count(e.id)::int AS member_count
    FROM employees m
    JOIN employees e ON e.manager_id = m.id AND e.is_active = true
    WHERE m.is_active = true AND m.account_type = 'employee'
    GROUP BY m.id, m.name
    ORDER BY lower(m.name)
  `)) as unknown as Array<{ id: string; name: string; member_count: number }>;
  return rows.map((r) => ({ id: r.id, name: r.name, memberCount: r.member_count }));
}

// ── CTC ───────────────────────────────────────────────────────────────────

/** Sum of monthly CTC (annualCtc ÷ 12) for a set of employees. */
export async function monthlyCtcForEmployeeIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db
    .select({ annualCtc: salaryProfiles.annualCtc })
    .from(salaryProfiles)
    .where(inArray(salaryProfiles.employeeId, ids));
  return rows.reduce((s, r) => s + (r.annualCtc ? Number(r.annualCtc) / 12 : 0), 0);
}

// ── subject identity ──────────────────────────────────────────────────────

interface SubjectIdentity {
  key: string;
  ids: Set<string>;
  names: Set<string>;
}

/** The downline (reports, transitive) of a team owner — the team's members. */
export async function teamMemberEmployees(ownerId: string): Promise<{ id: string; name: string }[]> {
  const ids = await getDownlineIds(ownerId);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(inArray(employees.id, ids));
  return rows;
}

async function subjectIdentity(plan: {
  targetLevel: TargetLevel;
  employeeId: string | null;
  teamOwnerId: string | null;
}): Promise<SubjectIdentity> {
  if (plan.targetLevel === "user") {
    const key = `user:${plan.employeeId ?? "?"}`;
    if (!plan.employeeId) return { key, ids: new Set(), names: new Set() };
    const [row] = await db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.id, plan.employeeId))
      .limit(1);
    return {
      key,
      ids: new Set([plan.employeeId]),
      names: new Set([nameKey(row?.name)]),
    };
  }
  const key = `team:${plan.teamOwnerId ?? "?"}`;
  if (!plan.teamOwnerId) return { key, ids: new Set(), names: new Set() };
  const members = await teamMemberEmployees(plan.teamOwnerId);
  return {
    key,
    ids: new Set(members.map((m) => m.id)),
    names: new Set(members.map((m) => nameKey(m.name))),
  };
}

// ── actual data ───────────────────────────────────────────────────────────

/** Approved (earned) amount per `subjectKey|productName` over one period. */
async function actualMap(
  start: string,
  end: string,
  subjects: SubjectIdentity[],
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      empName: incentiveEntries.empName,
      employeeId: incentiveEntries.employeeId,
      incentiveName: incentiveEntries.incentiveName,
      approvedAmt: incentiveEntries.approvedAmt,
    })
    .from(incentiveEntries)
    .where(
      and(
        gte(incentiveEntries.periodMonth, start),
        lt(incentiveEntries.periodMonth, end),
        eq(incentiveEntries.reversed, false),
      ),
    );

  const map = new Map<string, number>();
  for (const r of rows) {
    const pn = nameKey(r.incentiveName);
    const empId = r.employeeId;
    const empName = nameKey(r.empName);
    for (const s of subjects) {
      const isMember = (empId && s.ids.has(empId)) || s.names.has(empName);
      if (!isMember) continue;
      const key = `${s.key}|${pn}`;
      map.set(key, (map.get(key) ?? 0) + num(r.approvedAmt));
    }
  }
  return map;
}

function statusOf(start: string, end: string, today: string): TargetStatus {
  if (end <= today) return "Completed";
  if (start <= today) return "Active";
  return "Upcoming";
}

// ── shared row materialisation ────────────────────────────────────────────

interface PlanProductJoin {
  planId: string;
  lineId: string;
  targetLevel: TargetLevel;
  employeeId: string | null;
  teamOwnerId: string | null;
  subjectName: string | null;
  periodType: TargetPeriodType;
  periodStart: string;
  periodEnd: string;
  productName: string;
  quantity: string;
  rate: string;
  targetAmount: string;
  note: string | null;
  createdAt: Date;
}

async function materialiseRows(joins: PlanProductJoin[]): Promise<TargetPlanRow[]> {
  const today = istYmd(new Date());
  // Resolve one subject identity per distinct subject key.
  const subjectById = new Map<string, SubjectIdentity>();
  const subjectLabel = new Map<string, string>();
  const periodRanges = new Map<string, { start: string; end: string }>();
  for (const j of joins) {
    const sid = j.targetLevel === "user" ? j.employeeId : j.teamOwnerId;
    const key = `${j.targetLevel}:${sid ?? "?"}`;
    if (!subjectById.has(key)) {
      const identity = await subjectIdentity({
        targetLevel: j.targetLevel,
        employeeId: j.employeeId,
        teamOwnerId: j.teamOwnerId,
      });
      subjectById.set(key, identity);
      subjectLabel.set(key, j.subjectName ?? "");
    }
    periodRanges.set(`${j.periodStart}|${j.periodEnd}`, { start: j.periodStart, end: j.periodEnd });
  }

  // One actual-map per distinct period.
  const subjects = [...subjectById.values()];
  const actual = new Map<string, number>();
  for (const { start, end } of periodRanges.values()) {
    const m = await actualMap(start, end, subjects);
    for (const [k, v] of m) actual.set(k, (actual.get(k) ?? 0) + v);
  }

  return joins.map((j) => {
    const sid = j.targetLevel === "user" ? j.employeeId : j.teamOwnerId;
    const key = `${j.targetLevel}:${sid ?? "?"}`;
    const targetAmount = num(j.targetAmount);
    const actualAmount = actual.get(`${key}|${nameKey(j.productName)}`) ?? 0;
    const periodLabel =
      periodBounds(j.periodType, j.periodType === "week" ? j.periodStart : periodValue(j.periodType, j.periodStart))?.label ?? j.periodStart;
    return {
      planId: j.planId,
      lineId: j.lineId,
      targetLevel: j.targetLevel,
      subjectId: sid ?? "",
      subjectName: j.subjectName ?? (j.targetLevel === "team" ? "Team" : ""),
      periodType: j.periodType,
      periodStart: j.periodStart,
      periodEnd: j.periodEnd,
      periodLabel,
      productName: j.productName,
      quantity: num(j.quantity),
      rate: num(j.rate),
      targetAmount,
      actualQuantity: null,
      actualAmount,
      achievement: targetAmount > 0 ? (actualAmount / targetAmount) * 100 : null,
      targetSetDate: j.createdAt.toISOString().slice(0, 10),
      status: statusOf(j.periodStart, j.periodEnd, today),
      note: j.note,
    };
  });
}

/** Recover a canonical period VALUE from a first-day date (month/quarter/year). */
function periodValue(type: TargetPeriodType, start: string): string {
  if (type === "month") return start.slice(0, 7);
  if (type === "year") return start.slice(0, 4);
  if (type === "quarter") {
    const m = Number(start.slice(5, 7));
    return `${start.slice(0, 4)}-Q${Math.floor((m - 1) / 3) + 1}`;
  }
  return start;
}

const PLAN_PRODUCT_SELECT = {
  planId: incentiveTargetPlans.id,
  lineId: incentiveTargetPlanProducts.id,
  targetLevel: incentiveTargetPlans.targetLevel,
  employeeId: incentiveTargetPlans.employeeId,
  teamOwnerId: incentiveTargetPlans.teamOwnerId,
  subjectName: employees.name,
  periodType: incentiveTargetPlans.periodType,
  periodStart: incentiveTargetPlans.periodStart,
  periodEnd: incentiveTargetPlans.periodEnd,
  productName: incentiveTargetPlanProducts.productName,
  quantity: incentiveTargetPlanProducts.quantity,
  rate: incentiveTargetPlanProducts.rate,
  targetAmount: incentiveTargetPlanProducts.targetAmount,
  note: incentiveTargetPlans.note,
  createdAt: incentiveTargetPlans.createdAt,
} as const;

// ── dashboard board ───────────────────────────────────────────────────────

export async function getTargetBoard(input: {
  type: TargetPeriodType;
  value: string;
  level: TargetLevel;
  subjectId: string | null;
  productName: string | null;
  /** When non-null, only subjects in this set are returned (viewer scope). */
  allowedIds?: string[] | null;
}): Promise<TargetBoard> {
  const bounds = periodBounds(input.type, input.value);
  if (!bounds) throw new Error("Invalid period");

  const where: (SQL | undefined)[] = [
    eq(incentiveTargetPlans.targetLevel, input.level),
    gte(incentiveTargetPlans.periodStart, bounds.start),
    lt(incentiveTargetPlans.periodStart, bounds.end),
  ];
  const levelCol =
    input.level === "user"
      ? incentiveTargetPlans.employeeId
      : incentiveTargetPlans.teamOwnerId;
  if (input.subjectId) where.push(eq(levelCol, input.subjectId));
  if (input.allowedIds != null) {
    where.push(
      or(
        inArray(incentiveTargetPlans.employeeId, input.allowedIds),
        inArray(incentiveTargetPlans.teamOwnerId, input.allowedIds),
      ),
    );
  }

  const rows = await db
    .select(PLAN_PRODUCT_SELECT)
    .from(incentiveTargetPlans)
    .innerJoin(
      incentiveTargetPlanProducts,
      eq(incentiveTargetPlanProducts.planId, incentiveTargetPlans.id),
    )
    .leftJoin(employees, eq(employees.id, levelCol))
    .where(and(...where))
    .orderBy(desc(incentiveTargetPlans.createdAt), asc(incentiveTargetPlanProducts.productName));

  const filtered = input.productName
    ? rows.filter((r) => nameKey(r.productName) === nameKey(input.productName))
    : rows;

  const materialised = await materialiseRows(filtered as unknown as PlanProductJoin[]);

  // Per-product buckets (across whatever subjects are in scope).
  const buckets = new Map<string, ProductBucket>();
  for (const r of materialised) {
    const key = nameKey(r.productName);
    const b = buckets.get(key) ?? {
      productName: r.productName,
      targetQuantity: 0,
      targetAmount: 0,
      actualAmount: 0,
      achievement: null,
    };
    b.targetQuantity += r.quantity;
    b.targetAmount += r.targetAmount;
    b.actualAmount += r.actualAmount;
    buckets.set(key, b);
  }
  const products = [...buckets.values()]
    .map((b) => ({
      ...b,
      achievement: b.targetAmount > 0 ? (b.actualAmount / b.targetAmount) * 100 : null,
    }))
    .sort((a, b) => b.targetAmount - a.targetAmount);

  const totalTarget = products.reduce((s, p) => s + p.targetAmount, 0);
  const totalQuantity = products.reduce((s, p) => s + p.targetQuantity, 0);
  const totalActual = products.reduce((s, p) => s + p.actualAmount, 0);

  return {
    period: { type: bounds.type, value: bounds.value, start: bounds.start, end: bounds.end, label: bounds.label },
    level: input.level,
    subjectId: input.subjectId,
    subjectName: input.subjectId ? (filtered[0]?.subjectName ?? null) : null,
    productName: input.productName,
    summary: {
      totalTarget,
      totalQuantity,
      totalActual,
      achievement: totalTarget > 0 ? (totalActual / totalTarget) * 100 : null,
      productsTargeted: products.length,
    },
    products,
    rows: materialised,
  };
}

// ── table rows (server-side filter + sort + pagination) ───────────────────

export interface TargetRowFilters {
  level?: TargetLevel | null;
  subjectId?: string | null;
  productName?: string | null;
  periodType?: TargetPeriodType | null;
  month?: string | null;
  quarter?: string | null;
  year?: string | null;
  status?: TargetStatus | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface TargetRowPage {
  rows: TargetPlanRow[];
  total: number;
}

export async function getTargetRows(input: {
  filters: TargetRowFilters;
  sort?: { key: string; dir: "asc" | "desc" } | null;
  page?: number;
  pageSize?: number;
  /** When non-null, only subjects in this set are returned (viewer scope). */
  allowedIds?: string[] | null;
}): Promise<TargetRowPage> {
  const f = input.filters;
  const where: (SQL | undefined)[] = [];

  if (f.level) where.push(eq(incentiveTargetPlans.targetLevel, f.level));
  if (f.subjectId) {
    where.push(
      f.level === "team"
        ? eq(incentiveTargetPlans.teamOwnerId, f.subjectId)
        : eq(incentiveTargetPlans.employeeId, f.subjectId),
    );
  }
  if (f.periodType) where.push(eq(incentiveTargetPlans.periodType, f.periodType));
  if (f.productName) {
    where.push(
      sql`lower(trim(${incentiveTargetPlanProducts.productName})) = ${nameKey(f.productName)}`,
    );
  }
  if (input.allowedIds != null) {
    where.push(
      or(
        inArray(incentiveTargetPlans.employeeId, input.allowedIds),
        inArray(incentiveTargetPlans.teamOwnerId, input.allowedIds),
      ),
    );
  }

  // Date scope: an explicit date range wins; otherwise month / quarter / year.
  if (f.dateFrom || f.dateTo) {
    const from = f.dateFrom ?? "0001-01-01";
    const to = f.dateTo ?? "9999-12-31";
    where.push(gte(incentiveTargetPlans.periodStart, from));
    where.push(lte(incentiveTargetPlans.periodStart, to));
  } else if (f.month) {
    const b = periodBounds("month", f.month);
    if (b) {
      where.push(gte(incentiveTargetPlans.periodStart, b.start));
      where.push(lt(incentiveTargetPlans.periodStart, b.end));
    }
  } else if (f.quarter) {
    const b = periodBounds("quarter", f.quarter);
    if (b) {
      where.push(gte(incentiveTargetPlans.periodStart, b.start));
      where.push(lt(incentiveTargetPlans.periodStart, b.end));
    }
  } else if (f.year) {
    const b = periodBounds("year", f.year);
    if (b) {
      where.push(gte(incentiveTargetPlans.periodStart, b.start));
      where.push(lt(incentiveTargetPlans.periodStart, b.end));
    }
  }

  const levelCol = f.level === "team" ? incentiveTargetPlans.teamOwnerId : incentiveTargetPlans.employeeId;
  const cond = and(...where);

  // Count first (server-side total for pagination).
  const [countRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(incentiveTargetPlans)
    .innerJoin(
      incentiveTargetPlanProducts,
      eq(incentiveTargetPlanProducts.planId, incentiveTargetPlans.id),
    )
    .leftJoin(employees, eq(employees.id, levelCol))
    .where(cond);
  const total = countRow?.c ?? 0;

  const page = Math.max(0, input.page ?? 0);
  const pageSize = Math.max(1, input.pageSize ?? 25);

  const sortKey = input.sort?.key;
  const dir = input.sort?.dir === "asc" ? asc : desc;
  let orderBy: SQL = dir(incentiveTargetPlans.createdAt);
  if (sortKey === "targetQuantity") orderBy = dir(incentiveTargetPlanProducts.quantity);
  else if (sortKey === "targetAmount") orderBy = dir(incentiveTargetPlanProducts.targetAmount);
  else if (sortKey === "product") orderBy = dir(incentiveTargetPlanProducts.productName);
  else if (sortKey === "period") orderBy = dir(incentiveTargetPlans.periodStart);
  else if (sortKey === "user") orderBy = dir(employees.name);

  const rows = await db
    .select(PLAN_PRODUCT_SELECT)
    .from(incentiveTargetPlans)
    .innerJoin(
      incentiveTargetPlanProducts,
      eq(incentiveTargetPlanProducts.planId, incentiveTargetPlans.id),
    )
    .leftJoin(employees, eq(employees.id, levelCol))
    .where(cond)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset(page * pageSize);

  const materialised = await materialiseRows(rows as unknown as PlanProductJoin[]);

  // Client-visible status filter (derived) and any post-SQL sorts that need the
  // computed achievement/actual, applied in memory over the page.
  let out = f.status ? materialised.filter((r) => r.status === f.status) : materialised;
  if (sortKey && ["achievement", "actualAmount"].includes(sortKey)) {
    out = [...out].sort((a, b) => {
      const av = sortKey === "achievement" ? (a.achievement ?? -1) : a.actualAmount;
      const bv = sortKey === "achievement" ? (b.achievement ?? -1) : b.actualAmount;
      return (av - bv) * (input.sort!.dir === "asc" ? 1 : -1);
    });
  }

  return { rows: out, total };
}
