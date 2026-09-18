import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { dccEntries, dccKpiItems, employees } from "@/db/schema";
import { businessEmailFor } from "@/lib/email/recipients";
import { activeFromOf, loadFirstEntryDates } from "@/lib/queries/dcc-dashboard";
import type { ReportEmployee, ReportEntry, ReportItem } from "@/lib/dcc/daily-report";

/**
 * What the 10 PM DCC report needs for one day: every active employee (for the
 * reporting lines and addresses), their live KPIs, and that day's entries.
 *
 * WORK ADDRESS, NOT PERSONAL. Team reports are about other people's work, so
 * every report — a person's own included — goes to `businessEmailFor`: the
 * official address, else the login one. Never the personal inbox.
 */
export async function loadDccDailyReportInput(day: string): Promise<{
  employees: ReportEmployee[];
  items: ReportItem[];
  entries: ReportEntry[];
}> {
  const people = await withRetry(
    () =>
      db
        .select({
          id: employees.id,
          name: employees.name,
          email: employees.email,
          officialEmail: employees.officialEmail,
          managerId: employees.managerId,
        })
        .from(employees)
        .where(eq(employees.isActive, true))
        .orderBy(asc(employees.name)),
    { attempts: 3, timeoutMs: [8000, 12000, 16000], label: "dcc-report-people" },
  );
  const ids = people.map((p) => p.id);
  if (ids.length === 0) return { employees: [], items: [], entries: [] };

  const [itemRows, firstEntries, entries] = await Promise.all([
    withRetry(
      () =>
        db
          .select({
            id: dccKpiItems.id,
            ownerEmployeeId: dccKpiItems.ownerEmployeeId,
            section: dccKpiItems.section,
            code: dccKpiItems.code,
            title: dccKpiItems.title,
            frequency: dccKpiItems.frequency,
            weekdays: dccKpiItems.weekdays,
            scheduleKind: dccKpiItems.scheduleKind,
            isParticipantList: dccKpiItems.isParticipantList,
            createdAt: dccKpiItems.createdAt,
          })
          .from(dccKpiItems)
          .where(and(inArray(dccKpiItems.ownerEmployeeId, ids), eq(dccKpiItems.archived, false)))
          .orderBy(asc(dccKpiItems.sortOrder), asc(dccKpiItems.code)),
      { attempts: 3, timeoutMs: [8000, 12000, 16000], label: "dcc-report-items" },
    ),
    loadFirstEntryDates(ids),
    withRetry(
      () =>
        db
          .select({
            itemId: dccEntries.itemId,
            status: dccEntries.status,
            valueNumber: dccEntries.valueNumber,
            note: dccEntries.note,
          })
          .from(dccEntries)
          .innerJoin(dccKpiItems, eq(dccEntries.itemId, dccKpiItems.id))
          .where(
            and(
              inArray(dccKpiItems.ownerEmployeeId, ids),
              eq(dccEntries.entryDate, day),
              isNull(dccEntries.subjectId),
            ),
          ),
      { attempts: 3, timeoutMs: [8000, 12000, 16000], label: "dcc-report-entries" },
    ),
  ]);

  return {
    employees: people.map((p) => ({
      id: p.id,
      name: p.name,
      managerId: p.managerId,
      address: businessEmailFor(p),
    })),
    items: itemRows.map(({ createdAt, ...it }) => ({
      ...it,
      activeFrom: activeFromOf(createdAt, firstEntries.get(it.id)),
    })),
    entries,
  };
}
