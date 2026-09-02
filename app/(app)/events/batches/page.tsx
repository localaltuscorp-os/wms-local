import { asc, desc, eq, sql } from "drizzle-orm";
import { DashboardHeader } from "@/components/layout/header";
import { db } from "@/lib/db";
import {
  calendarEvents,
  eventBatchSchedules,
  eventBatchTypes,
  eventCategories,
} from "@/db/schema";
import { requireEventsAdmin } from "@/lib/monthly-events/access";
import { BatchWorkspace } from "@/components/events/batches/batch-workspace";
import type {
  BatchScheduleRow,
  BatchTypeOption,
  CategoryOption,
} from "@/components/events/batches/types";

export const dynamic = "force-dynamic";

export default async function BatchesPage() {
  // Re-assert admin access in the page — layout gates are unreliable on prod.
  await requireEventsAdmin();

  const [batchTypes, categories, scheduleRows, blockCounts] = await Promise.all([
    db
      .select({
        id: eventBatchTypes.id,
        name: eventBatchTypes.name,
        defaultCategoryId: eventBatchTypes.defaultCategoryId,
      })
      .from(eventBatchTypes)
      .where(eq(eventBatchTypes.isActive, true))
      .orderBy(asc(eventBatchTypes.sortOrder), asc(eventBatchTypes.name)),
    db
      .select({
        id: eventCategories.id,
        name: eventCategories.name,
        color: eventCategories.color,
      })
      .from(eventCategories)
      .where(eq(eventCategories.isActive, true))
      .orderBy(asc(eventCategories.sortOrder), asc(eventCategories.name)),
    db
      .select({
        id: eventBatchSchedules.id,
        batchTypeId: eventBatchSchedules.batchTypeId,
        batchTypeName: eventBatchTypes.name,
        name: eventBatchSchedules.name,
        startDate: eventBatchSchedules.startDate,
        endDate: eventBatchSchedules.endDate,
        startMin: eventBatchSchedules.startMin,
        endMin: eventBatchSchedules.endMin,
        daysOfWeek: eventBatchSchedules.daysOfWeek,
        categoryId: eventBatchSchedules.categoryId,
        categoryName: eventCategories.name,
        categoryColor: eventCategories.color,
        status: eventBatchSchedules.status,
        location: eventBatchSchedules.location,
        notes: eventBatchSchedules.notes,
        isActive: eventBatchSchedules.isActive,
      })
      .from(eventBatchSchedules)
      .leftJoin(
        eventBatchTypes,
        eq(eventBatchSchedules.batchTypeId, eventBatchTypes.id),
      )
      .leftJoin(
        eventCategories,
        eq(eventBatchSchedules.categoryId, eventCategories.id),
      )
      .orderBy(
        desc(eventBatchSchedules.isActive),
        desc(eventBatchSchedules.startDate),
      ),
    db
      .select({
        sourceRefId: calendarEvents.sourceRefId,
        count: sql<number>`count(*)::int`,
      })
      .from(calendarEvents)
      .where(eq(calendarEvents.source, "batch"))
      .groupBy(calendarEvents.sourceRefId),
  ]);

  const countByRef = new Map<string, number>(
    blockCounts
      .filter((c): c is { sourceRefId: string; count: number } => !!c.sourceRefId)
      .map((c) => [c.sourceRefId, c.count]),
  );

  const schedules: BatchScheduleRow[] = scheduleRows.map((r) => ({
    ...r,
    blockCount: countByRef.get(r.id) ?? 0,
  }));

  const batchTypeOptions: BatchTypeOption[] = batchTypes;
  const categoryOptions: CategoryOption[] = categories;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <BatchWorkspace
        schedules={schedules}
        batchTypes={batchTypeOptions}
        categories={categoryOptions}
      />
    </>
  );
}
