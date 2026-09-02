import { Palette } from "lucide-react";
import { isNotNull, sql } from "drizzle-orm";
import { DashboardHeader } from "@/components/layout/header";
import { db } from "@/lib/db";
import {
  eventCategories,
  eventBatchTypes,
  calendarEvents,
  eventBatchSchedules,
  obligations,
} from "@/db/schema";
import { requireEventsAdmin } from "@/lib/monthly-events/access";
import { MODULE_THEME } from "@/lib/module-theme";
import { MastersWorkbench } from "@/components/events/masters/masters-workbench";
import type { CategoryVM, BatchTypeVM } from "@/components/events/masters/types";

export const dynamic = "force-dynamic";

const THEME = MODULE_THEME.events;
const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

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

export default async function MastersPage() {
  // Admin-only surface — re-assert in the page (layout gates unreliable on prod).
  await requireEventsAdmin();

  const [categoryRows, batchTypeRows, usage] = await Promise.all([
    db.select().from(eventCategories).orderBy(eventCategories.sortOrder, eventCategories.name),
    db.select().from(eventBatchTypes).orderBy(eventBatchTypes.sortOrder, eventBatchTypes.name),
    usageByCategory(),
  ]);

  const categories: CategoryVM[] = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    usage: usage.get(c.id) ?? 0,
  }));

  const batchTypes: BatchTypeVM[] = batchTypeRows.map((b) => ({
    id: b.id,
    name: b.name,
    defaultCategoryId: b.defaultCategoryId,
    sortOrder: b.sortOrder,
    isActive: b.isActive,
  }));

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="w-full px-8 max-md:px-4 pt-8 pb-20">
        <header className="mt-3 mb-7 flex items-start gap-3 wg-rise">
          <span
            className="mt-1 inline-flex size-11 items-center justify-center rounded-xl"
            style={{ background: `${ACCENT}1a`, color: ACCENT_DEEP }}
          >
            <Palette size={22} strokeWidth={2.2} />
          </span>
          <div>
            <span
              className="text-[11px] font-bold uppercase tracking-[0.2em]"
              style={{ color: ACCENT_DEEP }}
            >
              Monthly Events Master
            </span>
            <h1
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(28px, 3.2vw, 42px)",
                letterSpacing: "-0.025em",
                lineHeight: 1.05,
                marginTop: 6,
              }}
            >
              Category &amp; Batch Masters
            </h1>
            <p className="mt-1.5 font-medium text-ink-muted" style={{ fontSize: 15.5, maxWidth: "70ch" }}>
              The colour legend behind every event. Add, rename, recolour and drag
              to reorder categories, and manage the batch/section types that
              auto-block the calendar from schedules.
            </p>
          </div>
        </header>

        <MastersWorkbench categories={categories} batchTypes={batchTypes} />
      </main>
    </>
  );
}
