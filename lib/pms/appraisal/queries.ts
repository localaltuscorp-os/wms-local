import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  employees,
  appraisalCycles,
  appraisalItems,
  appraisalScores,
  appraisalAttachments,
  appraisalCultureAssignments,
} from "@/lib/db";
import { pmsConstitutionPara } from "@/lib/pms/v3/schema";
import type { AppraisalCycle, AppraisalAttachment } from "@/db/schema";
import { loadAppraisalConfig, type ResolvedAppraisalConfig } from "./config";
import {
  computeScorecard,
  type EngineItem,
  type Scorecard,
} from "./engine";
import { managerFlags } from "./access";

/** Every cycle, newest period first. */
export async function loadCycles(): Promise<AppraisalCycle[]> {
  return db.select().from(appraisalCycles).orderBy(desc(appraisalCycles.period));
}

export async function loadCycleById(id: string): Promise<AppraisalCycle | null> {
  const [row] = await db
    .select()
    .from(appraisalCycles)
    .where(eq(appraisalCycles.id, id))
    .limit(1);
  return row ?? null;
}

/** The most recent cycle (for a default landing), if any. */
export async function loadLatestCycle(): Promise<AppraisalCycle | null> {
  const [row] = await db
    .select()
    .from(appraisalCycles)
    .orderBy(desc(appraisalCycles.period))
    .limit(1);
  return row ?? null;
}

/** Item + its (optional) score row, shaped for the engine. */
function toEngineItem(
  it: typeof appraisalItems.$inferSelect,
  sc: typeof appraisalScores.$inferSelect | null,
): EngineItem {
  return {
    id: it.id,
    dimension: it.dimension,
    sortOrder: it.sortOrder,
    area: it.area,
    title: it.title,
    measure: it.measure,
    subWeight: it.subWeight,
    isTechnical: it.isTechnical,
    isManagerOnly: it.isManagerOnly,
    isAuto: it.isAuto,
    status: it.status,
    actualValue: it.actualValue,
    evidence: it.evidence,
    adminApproved: it.adminApproved,
    adminRemarks: it.adminRemarks,
    meta: (it.meta ?? {}) as Record<string, unknown>,
    score: sc
      ? {
          selfScore: sc.selfScore,
          selfJustification: sc.selfJustification,
          selfSubmittedAt: sc.selfSubmittedAt,
          managerScore: sc.managerScore,
          managerExplanation: sc.managerExplanation,
          managerSubmittedAt: sc.managerSubmittedAt,
          managementScore: sc.managementScore,
          managementExplanation: sc.managementExplanation,
          managementSubmittedAt: sc.managementSubmittedAt,
          maxScore: sc.maxScore,
          finalScore: sc.finalScore,
          finalizedAt: sc.finalizedAt,
        }
      : null,
  };
}

export interface RosterRow {
  employee: {
    id: string;
    name: string;
    avatarUrl: string | null;
    department: string | null;
  };
  isManager: boolean;
  scorecard: Scorecard;
  itemCount: number;
}

/**
 * Roster scorecards for a cycle over the given employee ids — items + scores in
 * ONE query, grouped + folded in memory (load-light).
 */
export async function loadRoster(
  cycleId: string,
  people: { id: string; name: string; avatarUrl: string | null; department: string | null }[],
): Promise<RosterRow[]> {
  if (people.length === 0) return [];
  const ids = people.map((p) => p.id);
  const config = await loadAppraisalConfig();

  const rows = await db
    .select({ item: appraisalItems, score: appraisalScores })
    .from(appraisalItems)
    .leftJoin(appraisalScores, eq(appraisalScores.itemId, appraisalItems.id))
    .where(
      and(eq(appraisalItems.cycleId, cycleId), inArray(appraisalItems.employeeId, ids)),
    );

  const byEmp = new Map<string, EngineItem[]>();
  for (const r of rows) {
    const arr = byEmp.get(r.item.employeeId) ?? [];
    arr.push(toEngineItem(r.item, r.score));
    byEmp.set(r.item.employeeId, arr);
  }

  const mgrs = await managerFlags(ids);
  return people.map((p) => {
    const items = byEmp.get(p.id) ?? [];
    const isManager = mgrs.has(p.id);
    return {
      employee: p,
      isManager,
      scorecard: computeScorecard(items, config, isManager),
      itemCount: items.length,
    };
  });
}

export interface CultureParaView {
  serial: number;
  paraId: string;
  title: string | null;
  body: string;
}

export interface EmployeeCard {
  employee: {
    id: string;
    name: string;
    avatarUrl: string | null;
    department: string | null;
    managerId: string | null;
  };
  cycle: AppraisalCycle;
  config: ResolvedAppraisalConfig;
  isManager: boolean;
  items: EngineItem[];
  scorecard: Scorecard;
  attachments: Map<string, AppraisalAttachment[]>;
  culture: CultureParaView[];
}

/** Full per-person card for one cycle: items+scores+attachments+scorecard. */
export async function loadEmployeeCard(
  cycleId: string,
  employeeId: string,
): Promise<EmployeeCard | null> {
  const cycle = await loadCycleById(cycleId);
  if (!cycle) return null;
  const [emp] = await db
    .select({
      id: employees.id,
      name: employees.name,
      avatarUrl: employees.avatarUrl,
      department: employees.department,
      managerId: employees.managerId,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!emp) return null;

  const config = await loadAppraisalConfig();

  const rows = await db
    .select({ item: appraisalItems, score: appraisalScores })
    .from(appraisalItems)
    .leftJoin(appraisalScores, eq(appraisalScores.itemId, appraisalItems.id))
    .where(
      and(
        eq(appraisalItems.cycleId, cycleId),
        eq(appraisalItems.employeeId, employeeId),
      ),
    )
    .orderBy(asc(appraisalItems.dimension), asc(appraisalItems.sortOrder));

  const items = rows.map((r) => toEngineItem(r.item, r.score));
  const itemIds = items.map((i) => i.id);

  const attachRows =
    itemIds.length > 0
      ? await db
          .select()
          .from(appraisalAttachments)
          .where(inArray(appraisalAttachments.itemId, itemIds))
      : [];
  const attachments = new Map<string, AppraisalAttachment[]>();
  for (const a of attachRows) {
    const arr = attachments.get(a.itemId) ?? [];
    arr.push(a);
    attachments.set(a.itemId, arr);
  }

  const isManager = (await managerFlags([employeeId])).has(employeeId);

  return {
    employee: emp,
    cycle,
    config,
    isManager,
    items,
    scorecard: computeScorecard(items, config, isManager),
    attachments,
    culture: await loadCultureForPeriod(cycle.period),
  };
}

/** The Constitution paragraphs assigned to a period (serial order). */
export async function loadCultureForPeriod(
  period: string,
): Promise<CultureParaView[]> {
  const rows = await db
    .select({
      serial: appraisalCultureAssignments.serial,
      paraId: appraisalCultureAssignments.paraId,
      title: pmsConstitutionPara.title,
      body: pmsConstitutionPara.body,
    })
    .from(appraisalCultureAssignments)
    .leftJoin(
      pmsConstitutionPara,
      eq(pmsConstitutionPara.id, appraisalCultureAssignments.paraId),
    )
    .where(eq(appraisalCultureAssignments.period, period))
    .orderBy(asc(appraisalCultureAssignments.serial));
  return rows.map((r) => ({
    serial: r.serial,
    paraId: r.paraId,
    title: r.title ?? null,
    body: r.body ?? "",
  }));
}

/** The active Constitution pool (menu-card source), in serial/position order. */
export async function loadConstitutionPool(): Promise<
  { id: string; position: number; title: string | null; body: string }[]
> {
  return db
    .select({
      id: pmsConstitutionPara.id,
      position: pmsConstitutionPara.position,
      title: pmsConstitutionPara.title,
      body: pmsConstitutionPara.body,
    })
    .from(pmsConstitutionPara)
    .where(and(eq(pmsConstitutionPara.active, true), eq(pmsConstitutionPara.isHeading, false)))
    .orderBy(asc(pmsConstitutionPara.position));
}

export interface CulturePoolEntry {
  id: string;
  position: number;
  title: string | null;
  body: string;
  /** Periods this para has been assigned to (serial order within each month). */
  assignments: { period: string; serial: number }[];
}

export interface CultureBoard {
  pool: CulturePoolEntry[];
  /** Total assignments made so far — the serial rotation pointer. */
  used: number;
  /** How many items get assigned per month (config.culturePerMonth). */
  perMonth: number;
  /** The next `perMonth` pool ids the rotation will pick (deterministic). */
  upcoming: string[];
}

/** The Culture menu-card board: the active pool, each para's assignment history,
 *  the rotation pointer + a deterministic preview of the next month's picks. */
export async function loadCultureBoard(perMonth: number): Promise<CultureBoard> {
  const pool = await loadConstitutionPool();

  const rows = await db
    .select({
      paraId: appraisalCultureAssignments.paraId,
      period: appraisalCultureAssignments.period,
      serial: appraisalCultureAssignments.serial,
    })
    .from(appraisalCultureAssignments)
    .orderBy(asc(appraisalCultureAssignments.period), asc(appraisalCultureAssignments.serial));

  const byPara = new Map<string, { period: string; serial: number }[]>();
  for (const r of rows) {
    const arr = byPara.get(r.paraId) ?? [];
    arr.push({ period: r.period, serial: r.serial });
    byPara.set(r.paraId, arr);
  }

  const poolEntries: CulturePoolEntry[] = pool.map((p) => ({
    ...p,
    assignments: byPara.get(p.id) ?? [],
  }));

  const used = rows.length;
  const upcoming: string[] = [];
  if (pool.length > 0) {
    for (let k = 0; k < Math.max(0, perMonth); k++) {
      upcoming.push(pool[(used + k) % pool.length]!.id);
    }
  }

  return { pool: poolEntries, used, perMonth, upcoming };
}
