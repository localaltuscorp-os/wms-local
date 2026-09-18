import "server-only";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { dccEntries, dccKpiItems, dccReviews, employees } from "@/db/schema";
import { getEmployeeDepartmentMap } from "@/lib/queries/departments";
import { localDateString } from "@/lib/format";
import type {
  DashboardEntry,
  DashboardItem,
  DashboardPerson,
  DashboardReview,
} from "@/lib/dcc/dashboard";

/**
 * The first day a KPI can be due: the earlier of its creation day (IST) and its
 * first entry.
 *
 * BOTH, because neither alone is right. `created_at` is when the row was
 * written, and the bulk import of 26 June wrote rows for KPIs people had been
 * filling since April — their entries predate their own creation. The first
 * entry alone would be wrong the other way: a KPI added last week and never
 * filled has no entry at all, yet has been due every day since it was added.
 */
export function activeFromOf(createdAt: Date | null, firstEntry: string | undefined): string | null {
  const created = createdAt ? localDateString("Asia/Kolkata", createdAt) : null;
  if (!created) return firstEntry ?? null;
  return firstEntry && firstEntry < created ? firstEntry : created;
}

/** item id → the date of its earliest entry, over all time. */
export async function loadFirstEntryDates(ownerIds: string[]): Promise<Map<string, string>> {
  if (ownerIds.length === 0) return new Map();
  const rows = await withRetry(
    () =>
      db
        .select({
          itemId: dccEntries.itemId,
          // ::text so the driver hands back "YYYY-MM-DD", not a Date shifted by a timezone.
          first: sql<string>`min(${dccEntries.entryDate})::text`,
        })
        .from(dccEntries)
        .innerJoin(dccKpiItems, eq(dccEntries.itemId, dccKpiItems.id))
        .where(inArray(dccKpiItems.ownerEmployeeId, ownerIds))
        .groupBy(dccEntries.itemId),
    { attempts: 3, timeoutMs: [8000, 12000, 16000], label: "dcc-dash-first-entry" },
  );
  return new Map(rows.map((r) => [r.itemId, r.first]));
}

/**
 * Everything /dcc/dashboard aggregates, for one set of owners, in one parallel
 * batch. The maths lives in lib/dcc/dashboard.ts; this only reads.
 *
 * ACTIVE EMPLOYEES ONLY. The DCC scope hands a super-admin every employee ever
 * created, and two people who have left still own live KPIs — ranking them
 * against the current team would put a permanent 0% at the bottom of every
 * list.
 */
export async function loadDccDashboardInput(
  ownerIds: string[],
  historyFrom: string,
  to: string,
): Promise<{
  people: DashboardPerson[];
  items: DashboardItem[];
  entries: DashboardEntry[];
  reviews: DashboardReview[];
}> {
  if (ownerIds.length === 0) return { people: [], items: [], entries: [], reviews: [] };

  const [peopleRows, deptMap, itemRows, firstEntries, entries, reviews] = await Promise.all([
    withRetry(
      () =>
        db
          .select({
            id: employees.id,
            name: employees.name,
            avatarUrl: employees.avatarUrl,
            department: employees.department,
          })
          .from(employees)
          .where(and(inArray(employees.id, ownerIds), eq(employees.isActive, true)))
          .orderBy(asc(employees.name)),
      { attempts: 3, timeoutMs: [8000, 12000, 16000], label: "dcc-dash-people" },
    ),
    // Departments feed only the function tabs. If the lookup fails the page
    // still loads, with everyone filed by their legacy department column.
    getEmployeeDepartmentMap().catch(() => null),
    withRetry(
      () =>
        db
          .select({
            id: dccKpiItems.id,
            ownerEmployeeId: dccKpiItems.ownerEmployeeId,
            section: dccKpiItems.section,
            code: dccKpiItems.code,
            title: dccKpiItems.title,
            weekdays: dccKpiItems.weekdays,
            scheduleKind: dccKpiItems.scheduleKind,
            isParticipantList: dccKpiItems.isParticipantList,
            createdAt: dccKpiItems.createdAt,
          })
          .from(dccKpiItems)
          .where(and(inArray(dccKpiItems.ownerEmployeeId, ownerIds), eq(dccKpiItems.archived, false)))
          .orderBy(asc(dccKpiItems.sortOrder), asc(dccKpiItems.code)),
      { attempts: 3, timeoutMs: [8000, 12000, 16000], label: "dcc-dash-items" },
    ),
    loadFirstEntryDates(ownerIds),
    withRetry(
      () =>
        db
          .select({
            itemId: dccEntries.itemId,
            entryDate: dccEntries.entryDate,
            status: dccEntries.status,
            valueNumber: dccEntries.valueNumber,
            note: dccEntries.note,
            subjectId: dccEntries.subjectId,
          })
          .from(dccEntries)
          .innerJoin(dccKpiItems, eq(dccEntries.itemId, dccKpiItems.id))
          .where(
            and(
              inArray(dccKpiItems.ownerEmployeeId, ownerIds),
              eq(dccKpiItems.archived, false),
              gte(dccEntries.entryDate, historyFrom),
              lte(dccEntries.entryDate, to),
            ),
          ),
      { attempts: 3, timeoutMs: [8000, 12000, 16000], label: "dcc-dash-entries" },
    ),
    withRetry(
      () =>
        db
          .select({
            ownerEmployeeId: dccReviews.ownerEmployeeId,
            reviewDate: dccReviews.reviewDate,
            status: dccReviews.status,
          })
          .from(dccReviews)
          .where(
            and(
              inArray(dccReviews.ownerEmployeeId, ownerIds),
              gte(dccReviews.reviewDate, historyFrom),
              lte(dccReviews.reviewDate, to),
            ),
          ),
      { attempts: 3, timeoutMs: [6000, 10000, 14000], label: "dcc-dash-reviews" },
    ),
  ]);

  const people: DashboardPerson[] = peopleRows.map((p) => {
    const structured = deptMap?.get(p.id)?.map((d) => d.name) ?? [];
    return {
      id: p.id,
      name: p.name,
      avatarUrl: p.avatarUrl,
      departments: structured.length > 0 ? structured : p.department ? [p.department] : [],
    };
  });

  const items: DashboardItem[] = itemRows.map(({ createdAt, ...it }) => ({
    ...it,
    activeFrom: activeFromOf(createdAt, firstEntries.get(it.id)),
  }));

  return { people, items, entries, reviews };
}

/** The active people a viewer may pick in the dashboard's People filter. */
export async function loadDccRoster(
  visibleIds: string[],
): Promise<{ id: string; name: string; avatarUrl: string | null }[]> {
  if (visibleIds.length === 0) return [];
  return withRetry(
    () =>
      db
        .select({ id: employees.id, name: employees.name, avatarUrl: employees.avatarUrl })
        .from(employees)
        .where(and(inArray(employees.id, visibleIds), eq(employees.isActive, true)))
        .orderBy(asc(employees.name)),
    { attempts: 3, timeoutMs: [6000, 10000, 14000], label: "dcc-dash-roster" },
  );
}
