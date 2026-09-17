import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  departments,
  designations,
  employees,
  incentiveCatalog,
  incentiveEligibility,
  outstandingProducts,
} from "@/db/schema";
import {
  eligibilityLabel,
  hasExpired,
  isIncentiveOnOffer,
  resolveEligibility,
  todayIst,
  windowCoversDate,
  type CandidateRow,
  type EligibilityWindow,
  type EligibleCandidate,
  type IncentiveDuration,
} from "@/lib/incentive/master";
import {
  catalogSnapshot,
  type CatalogSnapshot,
} from "@/lib/incentive/notifications/eligibility";
import type { IncentiveType } from "@/db/enums";

/**
 * THE INCENTIVE MASTER — the database half.
 *
 * Reads only. Every write is a server action in
 * app/(admin)/admin/incentive-master/actions.ts, which re-authorizes for
 * itself.
 *
 * ── NO N+1, WHATEVER THE ROW COUNT ─────────────────────────────────────────
 * The list needs an eligible-employee count per incentive, which is the obvious
 * place to end up running one query per row. Instead the whole eligibility
 * table and the whole employee roster are loaded once and folded in memory by
 * the pure rule (`resolveEligibility`), so the list is a fixed three queries
 * whether there are five incentives or five hundred. The same rule then decides
 * the count here, the audience in the notification service, and the ticks in
 * the eligibility screen — one answer, three callers.
 *
 * ── EVERY LIST IT NEEDS COMES FROM THE MASTER THAT OWNS IT ─────────────────
 * Products are `outstanding_products` (the product master every other dropdown
 * reads). Function is the `departments` record, which is what Employee Master
 * shows in its "Function" column. Since migration 0234 that record LIVES in
 * the `functions` table and the `departments` symbol is an alias for it, so
 * this module and Employee Master read the same 18 rows. Not the legacy
 * `DEPARTMENTS` constant in db/enums.ts, which only task filtering uses.
 * Designation is `designations`. This module creates none of those lists.
 */

/* ════════════════════════════════════════════════════════════════════════════
   THE LIST
   ════════════════════════════════════════════════════════════════════════════ */

export interface IncentiveMasterRow {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  incentiveType: IncentiveType | null;
  productId: string | null;
  productName: string | null;
  duration: IncentiveDuration;
  validUntil: string | null;
  salesEligible: boolean;
  internsEligible: boolean;
  notes: string | null;
  sortOrder: number;
  active: boolean;
  /** How many CURRENT employees are eligible today, by whichever rule applies. */
  eligibleCount: number;
  /** Which rule decided it — named rows, or the original group flags. */
  eligibilityMode: "named" | "groups";
  /** Ready-made text for the Eligible column. */
  eligibleLabel: string;
  /** Past its Valid Until. Distinct from `active`. */
  expired: boolean;
  /** Active AND not expired — actually on offer today. */
  onOffer: boolean;
}

/** Employees as the eligibility rule needs them, for folding in memory. */
async function loadAudience() {
  return db
    .select({
      id: employees.id,
      isActive: employees.isActive,
      employmentStatus: employees.employmentStatus,
      accountType: employees.accountType,
      designation: designations.name,
    })
    .from(employees)
    .leftJoin(designations, eq(employees.designationId, designations.id));
}

export async function listIncentiveMaster(opts: { now?: Date } = {}): Promise<IncentiveMasterRow[]> {
  const today = todayIst(opts.now ?? new Date());

  const [rows, windows, audience] = await Promise.all([
    db
      .select({
        c: incentiveCatalog,
        productName: outstandingProducts.name,
      })
      .from(incentiveCatalog)
      .leftJoin(outstandingProducts, eq(incentiveCatalog.productId, outstandingProducts.id))
      .orderBy(asc(incentiveCatalog.sortOrder), asc(incentiveCatalog.name)),
    db
      .select({
        catalogId: incentiveEligibility.catalogId,
        employeeId: incentiveEligibility.employeeId,
        effectiveFrom: incentiveEligibility.effectiveFrom,
        removedEffectiveFrom: incentiveEligibility.removedEffectiveFrom,
      })
      .from(incentiveEligibility),
    loadAudience(),
  ]);

  const byCatalog = new Map<string, EligibilityWindow[]>();
  for (const w of windows) {
    const list = byCatalog.get(w.catalogId) ?? [];
    list.push({
      employeeId: w.employeeId,
      effectiveFrom: String(w.effectiveFrom),
      removedEffectiveFrom: w.removedEffectiveFrom == null ? null : String(w.removedEffectiveFrom),
    });
    byCatalog.set(w.catalogId, list);
  }

  return rows.map(({ c, productName }) =>
    summarizeIncentive(c, productName ?? null, byCatalog.get(c.id) ?? [], audience, today),
  );
}

/**
 * Fold one catalog row into the summary both screens show.
 *
 * Shared so the Eligible column in the list and the header of the workspace
 * cannot disagree about how many people are eligible, or about whether the
 * incentive is on offer.
 */
function summarizeIncentive(
  c: typeof incentiveCatalog.$inferSelect,
  productName: string | null,
  windows: EligibilityWindow[],
  audience: EligibleCandidate[],
  today: string,
): IncentiveMasterRow {
  const incentive = {
    active: c.active,
    validUntil: c.validUntil == null ? null : String(c.validUntil),
    salesEligible: c.salesEligible === true,
    internsEligible: c.internsEligible === true,
  };
  const resolved = resolveEligibility({ incentive, windows, employees: audience, today });
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    amount: Number(c.amount),
    incentiveType: c.incentiveType ?? null,
    productId: c.productId ?? null,
    productName,
    duration: (c.duration ?? "permanent") as IncentiveDuration,
    validUntil: incentive.validUntil,
    salesEligible: incentive.salesEligible,
    internsEligible: incentive.internsEligible,
    notes: c.notes,
    sortOrder: c.sortOrder ?? 100,
    active: c.active,
    eligibleCount: resolved.employeeIds.length,
    eligibilityMode: resolved.mode,
    eligibleLabel: eligibilityLabel({
      mode: resolved.mode,
      count: resolved.employeeIds.length,
      salesEligible: incentive.salesEligible,
      internsEligible: incentive.internsEligible,
    }),
    expired: hasExpired(incentive, today),
    onOffer: isIncentiveOnOffer(incentive, today),
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   THE ELIGIBILITY SCREEN
   ════════════════════════════════════════════════════════════════════════════ */

export interface EligibilityHistoryRow {
  id: string;
  employeeId: string;
  employeeName: string;
  effectiveFrom: string;
  removedEffectiveFrom: string | null;
  addedByName: string | null;
  removedByName: string | null;
}

export interface IncentiveEligibilityView {
  incentive: IncentiveMasterRow;
  /**
   * Every employee who could appear in the list, with their live grant if they
   * have one. Left, inactive and non-employee accounts are INCLUDED when they
   * hold a grant — a past decision stays visible and can be ended — and
   * excluded otherwise, because they must not be available for new eligibility.
   */
  candidates: CandidateRow[];
  /** The full grant history, newest first. Shows what was true and when. */
  history: EligibilityHistoryRow[];
  /** Function / Department options — the Employee Master list, not a new one. */
  functions: { id: string; name: string }[];
  /** Today in IST, so the dialog's date defaults match the server's. */
  today: string;
}

/**
 * One incentive, its candidate employees and its grant history.
 *
 * FOUR QUERIES, AND ONLY THIS INCENTIVE'S ROWS.
 * It deliberately does NOT call `listIncentiveMaster()`. Doing so would load
 * every incentive, the whole eligibility table and the whole roster in order to
 * render ONE row -- and, because it would nest one Promise.all inside another,
 * would put six concurrent statements on a connection pool of ten that the rest
 * of the page is also using. The incentive is fetched by id instead, and the
 * summary row is folded from what is already in hand.
 */
export async function loadIncentiveEligibility(
  catalogId: string,
  opts: { now?: Date } = {},
): Promise<IncentiveEligibilityView | null> {
  const today = todayIst(opts.now ?? new Date());

  const [catalogRows, grants, people, functionRows] = await Promise.all([
    db
      .select({ c: incentiveCatalog, productName: outstandingProducts.name })
      .from(incentiveCatalog)
      .leftJoin(outstandingProducts, eq(incentiveCatalog.productId, outstandingProducts.id))
      .where(eq(incentiveCatalog.id, catalogId))
      .limit(1),
    db
      .select({
        id: incentiveEligibility.id,
        employeeId: incentiveEligibility.employeeId,
        effectiveFrom: incentiveEligibility.effectiveFrom,
        removedEffectiveFrom: incentiveEligibility.removedEffectiveFrom,
        addedById: incentiveEligibility.addedById,
        removedById: incentiveEligibility.removedById,
        createdAt: incentiveEligibility.createdAt,
      })
      .from(incentiveEligibility)
      .where(eq(incentiveEligibility.catalogId, catalogId)),
    db
      .select({
        id: employees.id,
        name: employees.name,
        employeeCode: employees.employeeCode,
        email: employees.email,
        departmentId: employees.departmentId,
        departmentName: departments.name,
        designationName: designations.name,
        isActive: employees.isActive,
        employmentStatus: employees.employmentStatus,
        accountType: employees.accountType,
      })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(designations, eq(employees.designationId, designations.id))
      .orderBy(asc(employees.name)),
    db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(eq(departments.isActive, true))
      .orderBy(asc(departments.sortOrder), asc(departments.name)),
  ]);

  const found = catalogRows[0];
  if (!found) return null;
  const { c, productName } = found;

  const windows: EligibilityWindow[] = grants.map((g) => ({
    employeeId: g.employeeId,
    effectiveFrom: String(g.effectiveFrom),
    removedEffectiveFrom: g.removedEffectiveFrom == null ? null : String(g.removedEffectiveFrom),
  }));

  // The SAME summary the list shows, folded by the SAME rule -- not a second
  // opinion computed differently on the detail screen.
  const incentive = summarizeIncentive(c, productName ?? null, windows, people, today);

  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const liveByEmployee = new Map<string, string>();
  for (const g of grants) {
    if (g.removedEffectiveFrom == null) liveByEmployee.set(g.employeeId, String(g.effectiveFrom));
  }

  const candidates: CandidateRow[] = people
    .map((p) => ({
      id: p.id,
      name: p.name,
      employeeCode: p.employeeCode,
      email: p.email,
      departmentId: p.departmentId ?? null,
      departmentName: p.departmentName ?? null,
      designationName: p.designationName ?? null,
      isActive: p.isActive,
      employmentStatus: p.employmentStatus,
      accountType: p.accountType,
      eligibleFrom: liveByEmployee.get(p.id) ?? null,
    }))
    // "Default view should show active employees." Someone who has left is kept
    // ONLY while they still hold a grant, so an eligibility that needs ending
    // never becomes invisible; otherwise they are out of the list entirely.
    .filter(
      (r) =>
        r.eligibleFrom != null ||
        (r.isActive && r.employmentStatus === "active" && r.accountType === "employee"),
    );

  const history: EligibilityHistoryRow[] = [...grants]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((g) => ({
      id: g.id,
      employeeId: g.employeeId,
      employeeName: nameById.get(g.employeeId) ?? "Unknown employee",
      effectiveFrom: String(g.effectiveFrom),
      removedEffectiveFrom: g.removedEffectiveFrom == null ? null : String(g.removedEffectiveFrom),
      addedByName: g.addedById ? nameById.get(g.addedById) ?? null : null,
      removedByName: g.removedById ? nameById.get(g.removedById) ?? null : null,
    }));

  return { incentive, candidates, history, functions: functionRows, today };
}

/* ════════════════════════════════════════════════════════════════════════════
   WHAT THE ELIGIBILITY RULE NEEDS AT WRITE TIME
   ════════════════════════════════════════════════════════════════════════════ */

/** The live eligibility windows for one incentive — used to build snapshots. */
export async function eligibilityWindowsFor(
  exec: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  catalogId: string,
): Promise<EligibilityWindow[]> {
  const rows = await exec
    .select({
      employeeId: incentiveEligibility.employeeId,
      effectiveFrom: incentiveEligibility.effectiveFrom,
      removedEffectiveFrom: incentiveEligibility.removedEffectiveFrom,
    })
    .from(incentiveEligibility)
    .where(eq(incentiveEligibility.catalogId, catalogId));
  return rows.map((r) => ({
    employeeId: r.employeeId,
    effectiveFrom: String(r.effectiveFrom),
    removedEffectiveFrom: r.removedEffectiveFrom == null ? null : String(r.removedEffectiveFrom),
  }));
}

/**
 * The employees that may be given NEW eligibility, by id.
 *
 * Asked at write time rather than trusted from the request: the browser's list
 * was rendered at some earlier moment, and somebody who resigned in between
 * must not be added because their row was still on screen.
 */
export async function currentEmployeeIds(
  exec: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<Set<string>> {
  const rows = await exec
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.isActive, true),
        eq(employees.employmentStatus, "active"),
        eq(employees.accountType, "employee"),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/** Does this incentive still have a live grant for this person? */
export async function liveGrantIds(
  exec: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  catalogId: string,
): Promise<Set<string>> {
  const rows = await exec
    .select({ employeeId: incentiveEligibility.employeeId })
    .from(incentiveEligibility)
    .where(
      and(
        eq(incentiveEligibility.catalogId, catalogId),
        isNull(incentiveEligibility.removedEffectiveFrom),
      ),
    );
  return new Set(rows.map((r) => r.employeeId));
}

/* ════════════════════════════════════════════════════════════════════════════
   THE SNAPSHOT A CHANGE RECORD STORES
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * Build the snapshot `incentive_catalog_events` stores for one incentive,
 * resolving the two things that are not columns on the row: the product's NAME
 * and the named eligibility.
 *
 * ── WHY IT LIVES HERE AND NOT IN ONE ACTION FILE ───────────────────────────
 * There are TWO write paths into the Incentive Master — this admin screen and
 * the older in-app Incentive Table dialog
 * (app/(app)/incentive/catalog-actions.ts). Both record a change event, and the
 * event's before/after snapshots are what decide WHO gets notified. If one path
 * built a snapshot without the eligibility list, an edit made through it would
 * describe a named-eligibility incentive as a group one and notify the wrong
 * people. So the builder is shared, and neither path can get it wrong alone.
 *
 * ── `asOf` IS THE DATE THE SNAPSHOT DESCRIBES, AND IT MATTERS ──────────────
 * Eligibility is dated, so "who is eligible" has no answer without a day. For
 * an ordinary field edit that day is today. For an eligibility change it is the
 * EFFECTIVE DATE of the change, and taking today instead would be a bug with
 * teeth: a grant effective next month does not cover today, so the before and
 * after snapshots would be identical, the change record would find nothing
 * material, and nobody would ever be told.
 */
export async function incentiveSnapshotFor(
  exec: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  row: typeof incentiveCatalog.$inferSelect,
  asOf: string,
): Promise<CatalogSnapshot> {
  const [productName, windows] = await Promise.all([
    row.productId
      ? exec
          .select({ name: outstandingProducts.name })
          .from(outstandingProducts)
          .where(eq(outstandingProducts.id, row.productId))
          .limit(1)
          .then((r) => r[0]?.name ?? null)
      : Promise.resolve(null),
    eligibilityWindowsFor(exec, row.id),
  ]);

  // Only name the eligible employees when this incentive HAS named eligibility.
  // Passing an empty array where there is none would claim "nobody is eligible"
  // and silence the group-flag audience — see `isEligibleFor`.
  const eligibleEmployeeIds =
    windows.length > 0
      ? windows.filter((w) => windowCoversDate(w, asOf)).map((w) => w.employeeId)
      : undefined;

  return catalogSnapshot(row, { productName, eligibleEmployeeIds });
}
