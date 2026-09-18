import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { dccEntries, dccKpiItems, employees, paPeople, type Employee } from "@/db/schema";
import { loadDccScope } from "@/lib/dcc/access";
import { activeFromOf, loadFirstEntryDates } from "@/lib/queries/dcc-dashboard";
import { buildPersonReports, type ReportEntry, type ReportItem, type ReportRow } from "@/lib/dcc/daily-report";
import { weekDates } from "@/lib/hh/calendar";

/** One person's Daily Compliance on one day — the 10 PM report's rows and counts. */
export interface HhDccDay {
  due: number;
  done: number;
  notDone: number;
  notFilled: number;
  compliance: number | null;
  rows: ReportRow[];
}

export interface HhCalendarWeek {
  /** Monday, YYYY-MM-DD. */
  weekStart: string;
  /** employee id → day → that day's DCC. A day with nothing due or filled is absent. */
  dcc: Record<string, Record<string, HhDccDay>>;
  /** Linked employees whose DCC this viewer may not see (outside their DCC scope). */
  hiddenEmployeeIds: string[];
}

const RETRY = { attempts: 2, timeoutMs: [8000, 14000] };

/**
 * The DCC of every employee linked to a Handholding name, for one week.
 *
 * DCC VISIBILITY IS DCC's OWN RULE: a viewer sees the DCC of the people
 * `loadDccScope` gives them — themselves, their downline, or everyone for a
 * super-admin — whatever else the Handholding page shows them. The rest come
 * back as `hiddenEmployeeIds`, so the calendar can say so rather than look empty.
 */
export async function loadHhCalendarWeek(viewer: Employee, weekStart: string): Promise<HhCalendarWeek> {
  const days = weekDates(weekStart);
  const weekEnd = days[6]!;

  const [scope, linked] = await Promise.all([
    loadDccScope(viewer),
    db
      .selectDistinct({ employeeId: paPeople.employeeId })
      .from(paPeople)
      .where(and(eq(paPeople.isActive, true), isNotNull(paPeople.employeeId))),
  ]);
  const linkedIds = [...new Set(linked.map((l) => l.employeeId).filter((id): id is string => Boolean(id)))];
  const ownerIds = linkedIds.filter((id) => scope.visibleIds.has(id));
  const hiddenEmployeeIds = linkedIds.filter((id) => !scope.visibleIds.has(id));
  if (ownerIds.length === 0) return { weekStart, dcc: {}, hiddenEmployeeIds };

  const [people, itemRows, firstEntries, entryRows] = await Promise.all([
    withRetry(
      () =>
        db
          .select({ id: employees.id, name: employees.name, managerId: employees.managerId })
          .from(employees)
          .where(inArray(employees.id, ownerIds)),
      { ...RETRY, label: "hh-cal-people" },
    ),
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
          .where(and(inArray(dccKpiItems.ownerEmployeeId, ownerIds), eq(dccKpiItems.archived, false)))
          .orderBy(asc(dccKpiItems.sortOrder), asc(dccKpiItems.code)),
      { ...RETRY, label: "hh-cal-items" },
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
          })
          .from(dccEntries)
          .innerJoin(dccKpiItems, eq(dccEntries.itemId, dccKpiItems.id))
          .where(
            and(
              inArray(dccKpiItems.ownerEmployeeId, ownerIds),
              gte(dccEntries.entryDate, weekStart),
              lte(dccEntries.entryDate, weekEnd),
              isNull(dccEntries.subjectId),
            ),
          ),
      { ...RETRY, label: "hh-cal-entries" },
    ),
  ]);

  const items: ReportItem[] = itemRows.map(({ createdAt, ...it }) => ({
    ...it,
    activeFrom: activeFromOf(createdAt, firstEntries.get(it.id)),
  }));
  const entriesByDay = new Map<string, ReportEntry[]>();
  for (const { entryDate, ...e } of entryRows) {
    const list = entriesByDay.get(entryDate);
    if (list) list.push(e);
    else entriesByDay.set(entryDate, [e]);
  }
  const reportEmployees = people.map((p) => ({ ...p, address: null }));

  const dcc: HhCalendarWeek["dcc"] = {};
  for (const day of days) {
    for (const r of buildPersonReports(reportEmployees, items, entriesByDay.get(day) ?? [], day)) {
      (dcc[r.employee.id] ??= {})[day] = {
        due: r.due,
        done: r.done,
        notDone: r.notDone,
        notFilled: r.notFilled,
        compliance: r.compliance,
        rows: r.rows,
      };
    }
  }
  return { weekStart, dcc, hiddenEmployeeIds };
}

/** Active employees, for the "link to employee" picker. */
export async function listHhEmployeeOptions(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));
}
