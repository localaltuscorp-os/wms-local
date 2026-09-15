import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  eventBatchTypes,
  eventCategories,
  jdEntries,
  jdPositions,
  opsChecklistItems,
  opsChecklistTemplates,
} from "@/db/schema";

/**
 * The counts on the Masters overview cards. Each is read on its own and a
 * failure shows as "—" (null) rather than taking the page down — one module's
 * missing table must not hide the other masters.
 */
export interface MastersCounts {
  checklistMasters: number | null;
  checklistRows: number | null;
  eventCategories: number | null;
  batchTypes: number | null;
  positions: number | null;
  generalJds: number | null;
  personalJds: number | null;
  peopleWithPersonalJd: number | null;
}

async function count(q: PromiseLike<{ n: number }[]>): Promise<number | null> {
  try {
    const rows = await q;
    return Number(rows[0]?.n ?? 0);
  } catch {
    return null;
  }
}

const n = sql<number>`count(*)::int`;

export async function loadMastersCounts(): Promise<MastersCounts> {
  const [
    checklistMasters,
    checklistRows,
    categories,
    batchTypes,
    positions,
    generalJds,
    personalJds,
    peopleWithPersonalJd,
  ] = await Promise.all([
    count(db.select({ n }).from(opsChecklistTemplates).where(eq(opsChecklistTemplates.isActive, true))),
    count(
      db
        .select({ n })
        .from(opsChecklistItems)
        .innerJoin(opsChecklistTemplates, eq(opsChecklistTemplates.id, opsChecklistItems.templateId))
        .where(and(eq(opsChecklistItems.isActive, true), eq(opsChecklistTemplates.isActive, true))),
    ),
    count(db.select({ n }).from(eventCategories).where(eq(eventCategories.isActive, true))),
    count(db.select({ n }).from(eventBatchTypes).where(eq(eventBatchTypes.isActive, true))),
    count(db.select({ n }).from(jdPositions)),
    count(db.select({ n }).from(jdEntries).where(and(isNotNull(jdEntries.positionId), eq(jdEntries.isActive, true)))),
    count(db.select({ n }).from(jdEntries).where(and(isNotNull(jdEntries.ownerEmployeeId), eq(jdEntries.isActive, true)))),
    count(
      db
        .select({ n: sql<number>`count(distinct ${jdEntries.ownerEmployeeId})::int` })
        .from(jdEntries)
        .where(and(isNotNull(jdEntries.ownerEmployeeId), eq(jdEntries.isActive, true))),
    ),
  ]);

  return {
    checklistMasters,
    checklistRows,
    eventCategories: categories,
    batchTypes,
    positions,
    generalJds,
    personalJds,
    peopleWithPersonalJd,
  };
}
