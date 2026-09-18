import "server-only";
import { isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  eventCategories,
  eventBatchTypes,
  calendarEvents,
  eventBatchSchedules,
  obligations,
} from "@/db/schema";
import type { CategoryVM, BatchTypeVM } from "@/components/events/masters/types";

/**
 * The Monthly Events Master's own masters — categories (the colour legend) and
 * batch types. Read by /events/masters and by Operations → Masters → Event
 * Masters, so the two pages cannot show different lists.
 */

/** Merge the per-category reference counts from all four referencing tables. */
async function usageByCategory(): Promise<Map<string, number>> {
  const groups = await Promise.all([
    db
      .select({ id: calendarEvents.categoryId, n: sql<number>`count(*)::int` })
      .from(calendarEvents)
      .where(isNotNull(calendarEvents.categoryId))
      .groupBy(calendarEvents.categoryId),
    db
      .select({ id: eventBatchSchedules.categoryId, n: sql<number>`count(*)::int` })
      .from(eventBatchSchedules)
      .where(isNotNull(eventBatchSchedules.categoryId))
      .groupBy(eventBatchSchedules.categoryId),
    db
      .select({ id: obligations.categoryId, n: sql<number>`count(*)::int` })
      .from(obligations)
      .where(isNotNull(obligations.categoryId))
      .groupBy(obligations.categoryId),
    db
      .select({ id: eventBatchTypes.defaultCategoryId, n: sql<number>`count(*)::int` })
      .from(eventBatchTypes)
      .where(isNotNull(eventBatchTypes.defaultCategoryId))
      .groupBy(eventBatchTypes.defaultCategoryId),
  ]);
  const map = new Map<string, number>();
  for (const rows of groups) {
    for (const r of rows) {
      if (!r.id) continue;
      map.set(r.id, (map.get(r.id) ?? 0) + Number(r.n));
    }
  }
  return map;
}

export async function loadEventMasters(): Promise<{ categories: CategoryVM[]; batchTypes: BatchTypeVM[] }> {
  const [categoryRows, batchTypeRows, usage] = await Promise.all([
    db.select().from(eventCategories).orderBy(eventCategories.sortOrder, eventCategories.name),
    db.select().from(eventBatchTypes).orderBy(eventBatchTypes.sortOrder, eventBatchTypes.name),
    usageByCategory(),
  ]);

  return {
    categories: categoryRows.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      usage: usage.get(c.id) ?? 0,
    })),
    batchTypes: batchTypeRows.map((b) => ({
      id: b.id,
      name: b.name,
      defaultCategoryId: b.defaultCategoryId,
      sortOrder: b.sortOrder,
      isActive: b.isActive,
    })),
  };
}
