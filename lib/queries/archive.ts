import "server-only";
import { and, count, desc, eq, inArray, isNotNull, notInArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  apprDimensionScore,
  apprItemScore,
  apprScorecard,
  attendanceLogs,
  attendanceSheetMonth,
  compOffCredits,
  dailyChecklist,
  dccEntries,
  dccKpiItems,
  dccReviews,
  departments,
  employeeDocuments,
  employeeEvents,
  employeeExits,
  employees,
  goals,
  hrTickets,
  incentiveEntries,
  incentivePayoutEvents,
  incentiveRequests,
  kpiAssignments,
  leaveCategories,
  leaveRequests,
  moduleSubmissions,
  outstandingEntries,
  overtimeEntries,
  performanceScorecards,
  pmsReview,
  projectMembers,
  projectNodes,
  salaryAdvances,
  salaryPayments,
  salaryRuns,
  tasks,
  weeklyGoals,
} from "@/db/schema";
import { formatDate, formatInr, formatTimeInTz, STATUS_LABELS_FALLBACK } from "@/lib/format";
import {
  archivedPerformanceCount,
  archivedPerformanceRows,
} from "@/lib/productivity/archive";
import {
  archiveSection,
  type ArchiveRecordKind,
  type ArchiveScope,
  type ArchiveSectionId,
} from "@/lib/archive/sections";

/**
 * THE ARCHIVE'S DATA LAYER — every module's records, read by person.
 *
 * TWO RULES, one per half:
 *
 *   PAST     everything owned by an employee with `is_active = false`. They
 *            have gone; the whole trail belongs here, in whatever state they
 *            left it.
 *   PRESENT  only what was EXPLICITLY ARCHIVED — the row's own `archived` flag
 *            (Sir, 2026-09: "whatever data in the task section, when I archive
 *            it, goes to the Archive Present Employees section"). Somebody
 *            still working here has a live task list, and the Archive is where
 *            the things they have put away go — not a second copy of the work
 *            they are doing today.
 *
 * That is why several sections are empty in the Present half and say so: an
 * attendance punch, a salary run or a leave application has no archive button
 * to press, so nothing of theirs can be put away one record at a time. Those
 * records reach the Archive the day the person leaves.
 *
 * Nothing is copied into a separate store and nothing is rewritten on exit, so
 * a leaver's task still carries the status it had on their last working day and
 * their half-finished goal is still half-finished. See lib/archive/sections.ts
 * for why a view beats a physical move.
 *
 * CANDIDATE ACCOUNTS ARE NOT EX-EMPLOYEES. A candidate login is `is_active =
 * false` by construction (db/schema.ts, migration 0183) so it never appears in
 * a roster; without the `account_type = 'employee'` filter below, every job
 * applicant would show up in the Archive as though they had worked here.
 */

export type ArchiveCell = string | number | null;

export interface ArchiveColumn {
  key: string;
  label: string;
  /** Numbers and money read right-aligned; everything else left. */
  align?: "right";
}

export interface ArchiveTable {
  key: string;
  title: string;
  columns: ArchiveColumn[];
  rows: ArchiveCell[][];
  /** Rows matching the scope — may exceed `rows.length`, which is capped. */
  total: number;
  /**
   * Set on tables whose rows were PUT AWAY and can therefore be taken back out
   * or deleted from here. `rowIds` runs parallel to `rows`; the pair is what
   * the Unarchive / Delete buttons send to the server action. Tables without a
   * kind render read-only, which is every table of records nobody archived by
   * hand (an attendance punch, a salary run, an audit event).
   */
  record?: ArchiveRecordKind;
  rowIds?: string[];
  /**
   * Unarchive only — no Delete button on these rows. Set where the id in
   * `rowIds` addresses something bigger than the record on screen: a Team
   * Performance row is an EMPLOYEE, and taking them off a list must never be
   * one click away from deleting them. The server action refuses the delete
   * regardless; this is what stops the button being offered.
   */
  restoreOnly?: boolean;
}

/** Somebody the Archive can be read by. The last three are exit facts, so they
 *  are always null in the PRESENT scope — nobody there has left. */
export interface ArchivePerson {
  id: string;
  name: string;
  email: string;
  department: string | null;
  role: string;
  /** When the account was switched off, if it was recorded. */
  deactivatedAt: string | null;
  joinedAt: string | null;
  lastWorkingDay: string | null;
  exitReason: string | null;
}

/** Rows returned per table. The count line always tells the whole truth. */
const CAP = 500;

/** Punch times are stamped in IST across the app (lib/dcc/gate.ts and friends);
 *  rendering them in the server's UTC would move every clock-in by 5½ hours. */
const IST = "Asia/Kolkata";

const dash = (v: string | null | undefined): string | null => (v && v.trim() !== "" ? v : null);
const day = (v: Date | string | null | undefined): string | null => (v ? formatDate(v) || null : null);
const money = (v: string | number | null | undefined): string | null =>
  v == null || v === "" ? null : formatInr(Number(v));
const yesNo = (v: boolean | null | undefined): string | null => (v == null ? null : v ? "Yes" : "No");
const titleCase = (v: string | null | undefined): string | null =>
  v ? v.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null;
const taskStatus = (v: string | null | undefined): string | null =>
  v ? (STATUS_LABELS_FALLBACK[v as keyof typeof STATUS_LABELS_FALLBACK] ?? titleCase(v)) : null;

/**
 * The people one half of the Archive is about.
 *
 * PAST comes back newest-leaver-first, dated from the exit record where HR ran
 * the exit flow — those dates are copies taken at exit time and are the honest
 * answer to "when did they actually stop working here", which `deactivated_at`
 * (an account switch, often days later) is not. PRESENT is simply the roster,
 * A→Z, because there is no leaving date to sort it by.
 */
export async function listArchivePeople(scope: ArchiveScope): Promise<ArchivePerson[]> {
  const active = scope === "present";
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      department: employees.department,
      role: employees.role,
      deactivatedAt: employees.deactivatedAt,
      joinedAt: employees.joinedAt,
      exitJoinedAt: employeeExits.joinedAt,
      lastWorkingDay: employeeExits.lastWorkingDay,
      exitReason: employeeExits.exitReason,
    })
    .from(employees)
    .leftJoin(employeeExits, eq(employeeExits.employeeId, employees.id))
    .where(and(eq(employees.isActive, active), eq(employees.accountType, "employee")))
    .orderBy(
      ...(active
        ? [employees.name]
        : [
            desc(
              sql`COALESCE(${employeeExits.lastWorkingDay}::timestamptz, ${employees.deactivatedAt})`,
            ),
            employees.name,
          ]),
    );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    department: dash(r.department),
    role: r.role,
    deactivatedAt: day(r.deactivatedAt),
    joinedAt: day(r.exitJoinedAt ?? r.joinedAt),
    lastWorkingDay: day(r.lastWorkingDay),
    exitReason: titleCase(r.exitReason),
  }));
}

/** Just the ids on one side of the line — every section query is scoped by this. */
export async function archiveEmployeeIds(scope: ArchiveScope): Promise<string[]> {
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(eq(employees.isActive, scope === "present"), eq(employees.accountType, "employee")),
    );
  return rows.map((r) => r.id);
}

/**
 * Resolve the scope for one request: everybody on this side of the line, or the
 * single person the page is filtered to.
 *
 * Returns `null` when `?emp=` names somebody who is NOT in the chosen scope —
 * a leaver's id typed into the Present view, or the reverse. The caller renders
 * "not in this view" rather than quietly showing the other half's records,
 * which is the difference between a filter and a hole in one.
 */
async function scopeIds(scope: ArchiveScope, employeeId?: string): Promise<string[] | null> {
  const all = await archiveEmployeeIds(scope);
  if (!employeeId) return all;
  return all.includes(employeeId) ? [employeeId] : null;
}


/**
 * In the PRESENT half every row shown was archived by definition, so a column
 * that reads "Archived: Yes" all the way down is a column of noise — and, being
 * the last one, it sat underneath the pinned Actions buttons. Dropped here, in
 * the one place that knows the scope, rather than in eight loaders.
 */
function dropFlagColumn(t: ArchiveTable): ArchiveTable {
  const i = t.columns.findIndex((c) => c.label === "Archived" || c.label === "Deleted");
  if (i === -1) return t;
  return {
    ...t,
    columns: t.columns.filter((_, j) => j !== i),
    rows: t.rows.map((r) => r.filter((_, j) => j !== i)),
  };
}

/** The honest total behind a capped table — `rows.length` stops at CAP. */
async function countWhere(table: PgTable, where: SQL | undefined): Promise<number> {
  const [r] = await db.select({ n: count() }).from(table).where(where);
  return Number(r?.n ?? 0);
}

const EMPTY: ArchiveTable[] = [];

/**
 * The PRESENT half's extra predicate: this row was archived on purpose.
 * `undefined` in the Past half, where the whole trail belongs — drizzle's
 * `and()` drops undefined members, so one helper covers both scopes.
 */
function putAway(scope: ArchiveScope, col: AnyPgColumn): SQL | undefined {
  return scope === "present" ? eq(col, true) : undefined;
}

/**
 * The same predicate for a table that records WHEN it was put away rather than
 * a boolean. Goals are the case: `goals.archived` is that module's soft-DELETE
 * marker (the Recycle Bin), so the Archive reads `archived_at` instead —
 * migration 0215. In the Past half, as always, the whole trail belongs here.
 */
function putAwayAt(scope: ArchiveScope, col: AnyPgColumn): SQL | undefined {
  return scope === "present" ? isNotNull(col) : undefined;
}

/** Table headings say which half you are reading, so a screenshot of one can
 *  never be mistaken for the other. */
function tableTitle(scope: ArchiveScope, past: string, present: string): string {
  return scope === "present" ? present : past;
}

/**
 * One module's archive. Each section answers with one or more tables — DCC is
 * three (items owned, entries filled, day-close reviews) because those are
 * three different records, not three views of one.
 */
export async function loadArchiveSection(
  id: ArchiveSectionId,
  opts: { scope: ArchiveScope; employeeId?: string },
): Promise<ArchiveTable[]> {
  const ids = await scopeIds(opts.scope, opts.employeeId);
  if (!ids || ids.length === 0) return EMPTY;
  const scope = opts.scope;
  // Sections whose records carry no archive flag have nothing to show for
  // somebody still here — see the two rules at the top. The page turns this
  // into a sentence rather than a wall of empty tables.
  if (scope === "present" && !archiveSection(id).archivable) return EMPTY;
  const dress = (tables: ArchiveTable[]) => (scope === "present" ? tables.map(dropFlagColumn) : tables);

  switch (id) {
    case "tasks":
      return archiveTasks(ids, scope).then(dress);
    case "goals":
      return archiveGoals(ids, scope).then(dress);
    case "dcc":
      return archiveDcc(ids, scope).then(dress);
    case "incentives":
      return archiveIncentives(ids);
    case "attendance":
      return archiveAttendance(ids);
    case "leaves":
      return archiveLeaves(ids);
    case "reimbursements":
      return archiveReimbursements(ids, scope).then(dress);
    case "kpis":
      return archiveKpis(ids, scope).then(dress);
    case "appraisals":
      return archiveAppraisals(ids);
    case "team-performance":
      return archiveTeamPerformance(ids, scope).then(dress);
    case "salary":
      return archiveSalary(ids);
    case "overtime":
      return archiveOvertime(ids);
    case "hr-records":
      return archiveHrRecords(ids, scope).then(dress);
    case "sales":
      return archiveSales(ids, scope).then(dress);
    case "plan":
      return archivePlan(ids, scope).then(dress);
  }
}

/* ── WMS ─────────────────────────────────────────────────────────────────── */

async function archiveTasks(ids: string[], scope: ArchiveScope): Promise<ArchiveTable[]> {
  const away = putAway(scope, tasks.archived);
  const doer = alias(employees, "arch_task_doer");
  const initiator = alias(employees, "arch_task_initiator");

  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      shortId: tasks.shortId,
      title: tasks.title,
      doerName: doer.name,
      initiatorName: initiator.name,
      client: tasks.client,
      subject: tasks.subject,
      status: tasks.status,
      dueAt: tasks.dueAt,
      completedAt: tasks.completedAt,
      archived: tasks.archived,
    })
    .from(tasks)
    .leftJoin(doer, eq(doer.id, tasks.doerId))
    .leftJoin(initiator, eq(initiator.id, tasks.initiatorId))
    .where(and(inArray(tasks.doerId, ids), away))
    .orderBy(desc(tasks.dueAt))
    .limit(CAP);

  const raised = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      raisedBy: initiator.name,
      doerName: doer.name,
      status: tasks.status,
      dueAt: tasks.dueAt,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .leftJoin(doer, eq(doer.id, tasks.doerId))
    .leftJoin(initiator, eq(initiator.id, tasks.initiatorId))
    .where(and(inArray(tasks.initiatorId, ids), notInArray(tasks.doerId, ids), away))
    .orderBy(desc(tasks.dueAt))
    .limit(CAP);

  return [
    {
      key: "did",
      title: tableTitle(scope, "Tasks they were the doer of", "Archived tasks they are the doer of"),
      record: "task",
      rowIds: rows.map((r) => r.id),
      columns: [
        { key: "no", label: "Task" },
        { key: "title", label: "Title" },
        { key: "doer", label: "Doer" },
        { key: "raised", label: "Raised by" },
        { key: "client", label: "Client / Subject" },
        { key: "status", label: "Status" },
        { key: "due", label: "Due" },
        { key: "done", label: "Completed" },
        { key: "arch", label: "Archived" },
      ],
      rows: rows.map((r) => [
        r.shortId ?? (r.taskNo != null ? `#${r.taskNo}` : null),
        r.title,
        r.doerName,
        r.initiatorName,
        [dash(r.client), dash(r.subject)].filter(Boolean).join(" · ") || null,
        taskStatus(r.status),
        day(r.dueAt),
        day(r.completedAt),
        yesNo(r.archived),
      ]),
      total: await countWhere(tasks, and(inArray(tasks.doerId, ids), away)),
    },
    {
      key: "raised",
      title: tableTitle(
        scope,
        "Tasks they raised for other people",
        "Archived tasks they raised for other people",
      ),
      record: "task",
      rowIds: raised.map((r) => r.id),
      columns: [
        { key: "no", label: "Task" },
        { key: "title", label: "Title" },
        { key: "raised", label: "Raised by" },
        { key: "doer", label: "Doer" },
        { key: "status", label: "Status" },
        { key: "due", label: "Due" },
        { key: "done", label: "Completed" },
      ],
      rows: raised.map((r) => [
        r.taskNo != null ? `#${r.taskNo}` : null,
        r.title,
        r.raisedBy,
        r.doerName,
        taskStatus(r.status),
        day(r.dueAt),
        day(r.completedAt),
      ]),
      total: await countWhere(
        tasks,
        and(inArray(tasks.initiatorId, ids), notInArray(tasks.doerId, ids), away),
      ),
    },
  ];
}

/* ── Goals ───────────────────────────────────────────────────────────────── */

async function archiveGoals(ids: string[], scope: ArchiveScope): Promise<ArchiveTable[]> {
  const present = scope === "present";
  const owner = alias(employees, "arch_goal_owner");

  const weekly = await db
    .select({
      id: weeklyGoals.id,
      weekStart: weeklyGoals.weekStart,
      owner: owner.name,
      subject: weeklyGoals.subject,
      client: weeklyGoals.client,
      target: weeklyGoals.targetDone,
      pct: weeklyGoals.pctDone,
      status: weeklyGoals.status,
      accept: weeklyGoals.acceptPct,
      archived: weeklyGoals.archived,
    })
    .from(weeklyGoals)
    .leftJoin(owner, eq(owner.id, weeklyGoals.employeeId))
    .where(and(inArray(weeklyGoals.employeeId, ids), putAwayAt(scope, weeklyGoals.archivedAt)))
    .orderBy(desc(weeklyGoals.weekStart))
    .limit(CAP);

  const cascade = await db
    .select({
      id: goals.id,
      period: goals.period,
      periodKey: goals.periodKey,
      owner: owner.name,
      title: goals.title,
      area: goals.area,
      pct: goals.pctDone,
      status: goals.status,
      scope: goals.scope,
      archived: goals.archived,
      updatedAt: goals.updatedAt,
    })
    .from(goals)
    .leftJoin(owner, eq(owner.id, goals.employeeId))
    .where(and(inArray(goals.employeeId, ids), putAwayAt(scope, goals.archivedAt)))
    .orderBy(desc(goals.updatedAt))
    .limit(CAP);

  // A daily commitment has no archive flag — it is closed, carried forward or
  // cancelled, never "put away" — so the Present half simply has no such table.
  const daily = present
    ? []
    : await db
    .select({
      planDate: dailyChecklist.planDate,
      owner: owner.name,
      title: dailyChecklist.title,
      client: dailyChecklist.client,
      status: dailyChecklist.status,
      donePct: dailyChecklist.donePct,
      closedAt: dailyChecklist.closedAt,
    })
    .from(dailyChecklist)
    .leftJoin(owner, eq(owner.id, dailyChecklist.employeeId))
    .where(inArray(dailyChecklist.employeeId, ids))
    .orderBy(desc(dailyChecklist.planDate))
    .limit(CAP);

  return [
    {
      key: "weekly",
      title: tableTitle(scope, "Weekly goals", "Archived weekly goals"),
      record: "weekly-goal",
      rowIds: weekly.map((r) => r.id),
      columns: [
        { key: "week", label: "Week of" },
        { key: "owner", label: "Employee" },
        { key: "subject", label: "Subject" },
        { key: "client", label: "Client" },
        { key: "target", label: "Target" },
        { key: "pct", label: "Done %", align: "right" },
        { key: "status", label: "Status" },
        { key: "accept", label: "Accepted %", align: "right" },
        { key: "arch", label: "Archived" },
      ],
      rows: weekly.map((r) => [
        day(r.weekStart),
        r.owner,
        dash(r.subject),
        dash(r.client),
        dash(r.target),
        r.pct ?? null,
        taskStatus(r.status),
        r.accept ?? null,
        yesNo(r.archived),
      ]),
      total: await countWhere(
        weeklyGoals,
        and(inArray(weeklyGoals.employeeId, ids), putAwayAt(scope, weeklyGoals.archivedAt)),
      ),
    },
    {
      key: "cascade",
      title: tableTitle(
        scope,
        "Yearly / quarterly / monthly goals",
        "Archived yearly / quarterly / monthly goals",
      ),
      record: "goal",
      rowIds: cascade.map((r) => r.id),
      columns: [
        { key: "period", label: "Period" },
        { key: "owner", label: "Employee" },
        { key: "title", label: "Goal" },
        { key: "area", label: "Area" },
        { key: "pct", label: "Done %", align: "right" },
        { key: "status", label: "Status" },
        { key: "scope", label: "Space" },
        { key: "arch", label: "Deleted" },
      ],
      rows: cascade.map((r) => [
        [titleCase(r.period), dash(r.periodKey)].filter(Boolean).join(" · ") || null,
        r.owner,
        r.title,
        dash(r.area),
        r.pct ?? null,
        taskStatus(r.status),
        titleCase(r.scope),
        yesNo(r.archived),
      ]),
      total: await countWhere(
        goals,
        and(inArray(goals.employeeId, ids), putAwayAt(scope, goals.archivedAt)),
      ),
    },
    ...(present ? [] : [{
      key: "daily",
      title: "Daily commitments",
      columns: [
        { key: "date", label: "Planned for" },
        { key: "owner", label: "Employee" },
        { key: "title", label: "Commitment" },
        { key: "client", label: "Client" },
        { key: "status", label: "Status" },
        { key: "pct", label: "Done %", align: "right" },
        { key: "closed", label: "Closed" },
      ],
      rows: daily.map((r) => [
        day(r.planDate),
        r.owner,
        r.title,
        dash(r.client),
        taskStatus(r.status),
        r.donePct ?? null,
        day(r.closedAt),
      ]),
      total: await countWhere(dailyChecklist, inArray(dailyChecklist.employeeId, ids)),
    } satisfies ArchiveTable]),
  ];
}

/* ── DCC ─────────────────────────────────────────────────────────────────── */

async function archiveDcc(ids: string[], scope: ArchiveScope): Promise<ArchiveTable[]> {
  const present = scope === "present";
  const owner = alias(employees, "arch_dcc_owner");
  const filler = alias(employees, "arch_dcc_filler");
  const reviewer = alias(employees, "arch_dcc_reviewer");

  const items = await db
    .select({
      id: dccKpiItems.id,
      owner: owner.name,
      section: dccKpiItems.section,
      code: dccKpiItems.code,
      title: dccKpiItems.title,
      frequency: dccKpiItems.frequency,
      target: dccKpiItems.targetNumber,
      unit: dccKpiItems.unit,
      archived: dccKpiItems.archived,
    })
    .from(dccKpiItems)
    .leftJoin(owner, eq(owner.id, dccKpiItems.ownerEmployeeId))
    .where(and(inArray(dccKpiItems.ownerEmployeeId, ids), putAway(scope, dccKpiItems.archived)))
    .orderBy(dccKpiItems.section, dccKpiItems.sortOrder)
    .limit(CAP);

  // A filled entry and a day-close review are events, not things you put away:
  // no archive flag, so the Present half carries neither.
  const entries = present
    ? []
    : await db
    .select({
      entryDate: dccEntries.entryDate,
      filler: filler.name,
      title: dccKpiItems.title,
      section: dccKpiItems.section,
      status: dccEntries.status,
      value: dccEntries.valueNumber,
      note: dccEntries.note,
    })
    .from(dccEntries)
    .leftJoin(filler, eq(filler.id, dccEntries.filledById))
    .leftJoin(dccKpiItems, eq(dccKpiItems.id, dccEntries.itemId))
    .where(inArray(dccEntries.filledById, ids))
    .orderBy(desc(dccEntries.entryDate))
    .limit(CAP);

  const reviews = present
    ? []
    : await db
    .select({
      reviewDate: dccReviews.reviewDate,
      owner: owner.name,
      reviewer: reviewer.name,
      status: dccReviews.status,
      note: dccReviews.note,
    })
    .from(dccReviews)
    .leftJoin(owner, eq(owner.id, dccReviews.ownerEmployeeId))
    .leftJoin(reviewer, eq(reviewer.id, dccReviews.reviewerId))
    .where(inArray(dccReviews.ownerEmployeeId, ids))
    .orderBy(desc(dccReviews.reviewDate))
    .limit(CAP);

  return [
    {
      key: "items",
      title: tableTitle(scope, "KPI items they owned", "Archived KPI items they own"),
      record: "dcc-item",
      rowIds: items.map((r) => r.id),
      columns: [
        { key: "owner", label: "Employee" },
        { key: "section", label: "Section" },
        { key: "code", label: "Code" },
        { key: "title", label: "Item" },
        { key: "freq", label: "Frequency" },
        { key: "target", label: "Target", align: "right" },
        { key: "unit", label: "Unit" },
        { key: "arch", label: "Archived" },
      ],
      rows: items.map((r) => [
        r.owner,
        titleCase(r.section),
        dash(r.code),
        r.title,
        titleCase(r.frequency),
        r.target == null ? null : Number(r.target),
        dash(r.unit),
        yesNo(r.archived),
      ]),
      total: await countWhere(
        dccKpiItems,
        and(inArray(dccKpiItems.ownerEmployeeId, ids), putAway(scope, dccKpiItems.archived)),
      ),
    },
    ...(present ? [] : [{
      key: "entries",
      title: "Entries they filled",
      columns: [
        { key: "date", label: "Date" },
        { key: "who", label: "Filled by" },
        { key: "section", label: "Section" },
        { key: "item", label: "Item" },
        { key: "status", label: "Status" },
        { key: "value", label: "Value", align: "right" },
        { key: "note", label: "Note" },
      ],
      rows: entries.map((r) => [
        day(r.entryDate),
        r.filler,
        titleCase(r.section),
        dash(r.title),
        titleCase(r.status),
        r.value == null ? null : Number(r.value),
        dash(r.note),
      ]),
      total: await countWhere(dccEntries, inArray(dccEntries.filledById, ids)),
    } satisfies ArchiveTable]),
    ...(present ? [] : [{
      key: "reviews",
      title: "Day-close reviews",
      columns: [
        { key: "date", label: "Date" },
        { key: "owner", label: "Employee" },
        { key: "reviewer", label: "Reviewer" },
        { key: "status", label: "Verdict" },
        { key: "note", label: "Note" },
      ],
      rows: reviews.map((r) => [
        day(r.reviewDate),
        r.owner,
        r.reviewer,
        titleCase(r.status),
        dash(r.note),
      ]),
      total: await countWhere(dccReviews, inArray(dccReviews.ownerEmployeeId, ids)),
    } satisfies ArchiveTable]),
  ];
}

/* ── Incentives ──────────────────────────────────────────────────────────── */

async function archiveIncentives(ids: string[]): Promise<ArchiveTable[]> {
  const emp = alias(employees, "arch_inc_emp");
  const decider = alias(employees, "arch_inc_decider");

  const entries = await db
    .select({
      month: incentiveEntries.periodMonth,
      emp: emp.name,
      fallbackName: incentiveEntries.empName,
      name: incentiveEntries.incentiveName,
      participant: incentiveEntries.participantName,
      amount: incentiveEntries.amount,
      approved: incentiveEntries.approved,
      approvedAmt: incentiveEntries.approvedAmt,
      paid: incentiveEntries.paid,
      paidAmt: incentiveEntries.paidAmt,
      paidDate: incentiveEntries.paidDate,
    })
    .from(incentiveEntries)
    .leftJoin(emp, eq(emp.id, incentiveEntries.employeeId))
    .where(inArray(incentiveEntries.employeeId, ids))
    .orderBy(desc(incentiveEntries.periodMonth))
    .limit(CAP);

  const requests = await db
    .select({
      created: incentiveRequests.createdAt,
      emp: emp.name,
      type: incentiveRequests.type,
      status: incentiveRequests.status,
      decidedBy: decider.name,
      decidedAt: incentiveRequests.decidedAt,
      note: incentiveRequests.decisionNote,
    })
    .from(incentiveRequests)
    .leftJoin(emp, eq(emp.id, incentiveRequests.employeeId))
    .leftJoin(decider, eq(decider.id, incentiveRequests.decidedById))
    .where(inArray(incentiveRequests.employeeId, ids))
    .orderBy(desc(incentiveRequests.createdAt))
    .limit(CAP);

  const payouts = await db
    .select({
      month: incentivePayoutEvents.periodMonth,
      emp: emp.name,
      fallbackName: incentivePayoutEvents.empName,
      source: incentivePayoutEvents.source,
      amount: incentivePayoutEvents.amount,
      paidDate: incentivePayoutEvents.paidDate,
      note: incentivePayoutEvents.note,
    })
    .from(incentivePayoutEvents)
    .leftJoin(emp, eq(emp.id, incentivePayoutEvents.employeeId))
    .where(inArray(incentivePayoutEvents.employeeId, ids))
    .orderBy(desc(incentivePayoutEvents.paidDate))
    .limit(CAP);

  return [
    {
      key: "entries",
      title: "Incentive entries",
      columns: [
        { key: "month", label: "Month" },
        { key: "emp", label: "Employee" },
        { key: "name", label: "Incentive" },
        { key: "participant", label: "Participant" },
        { key: "amount", label: "Booked", align: "right" },
        { key: "approved", label: "Approved", align: "right" },
        { key: "paid", label: "Paid", align: "right" },
        { key: "paidDate", label: "Paid on" },
      ],
      rows: entries.map((r) => [
        day(r.month),
        r.emp ?? dash(r.fallbackName),
        dash(r.name),
        dash(r.participant),
        money(r.amount),
        r.approved ? money(r.approvedAmt) : "—",
        r.paid ? money(r.paidAmt) : "—",
        day(r.paidDate),
      ]),
      total: await countWhere(incentiveEntries, inArray(incentiveEntries.employeeId, ids)),
    },
    {
      key: "requests",
      title: "Requests they raised",
      columns: [
        { key: "created", label: "Raised" },
        { key: "emp", label: "Employee" },
        { key: "type", label: "Type" },
        { key: "status", label: "Status" },
        { key: "decidedBy", label: "Decided by" },
        { key: "decidedAt", label: "Decided" },
        { key: "note", label: "Note" },
      ],
      rows: requests.map((r) => [
        day(r.created),
        r.emp,
        titleCase(r.type),
        titleCase(r.status),
        r.decidedBy,
        day(r.decidedAt),
        dash(r.note),
      ]),
      total: await countWhere(incentiveRequests, inArray(incentiveRequests.employeeId, ids)),
    },
    {
      key: "payouts",
      title: "Payouts",
      columns: [
        { key: "month", label: "Month" },
        { key: "emp", label: "Employee" },
        { key: "source", label: "Source" },
        { key: "amount", label: "Amount", align: "right" },
        { key: "paidDate", label: "Paid on" },
        { key: "note", label: "Note" },
      ],
      rows: payouts.map((r) => [
        day(r.month),
        r.emp ?? dash(r.fallbackName),
        titleCase(r.source),
        money(r.amount),
        day(r.paidDate),
        dash(r.note),
      ]),
      total: await countWhere(incentivePayoutEvents, inArray(incentivePayoutEvents.employeeId, ids)),
    },
  ];
}

/* ── Attendance & leave ──────────────────────────────────────────────────── */

async function archiveAttendance(ids: string[]): Promise<ArchiveTable[]> {
  const emp = alias(employees, "arch_att_emp");

  const logs = await db
    .select({
      logDate: attendanceLogs.logDate,
      emp: emp.name,
      kind: attendanceLogs.kind,
      loggedAt: attendanceLogs.loggedAt,
      workMode: attendanceLogs.workMode,
      source: attendanceLogs.source,
      verify: attendanceLogs.verifyMethod,
      note: attendanceLogs.note,
    })
    .from(attendanceLogs)
    .leftJoin(emp, eq(emp.id, attendanceLogs.employeeId))
    .where(inArray(attendanceLogs.employeeId, ids))
    .orderBy(desc(attendanceLogs.logDate), desc(attendanceLogs.loggedAt))
    .limit(CAP);

  const sheets = await db
    .select({
      fy: attendanceSheetMonth.fy,
      month: attendanceSheetMonth.month,
      emp: emp.name,
      fallbackName: attendanceSheetMonth.employeeName,
      present: attendanceSheetMonth.present,
      absent: attendanceSheetMonth.absent,
      halfDay: attendanceSheetMonth.halfDay,
      weeklyOff: attendanceSheetMonth.weeklyOff,
      worked: attendanceSheetMonth.totalDaysWorked,
      remark: attendanceSheetMonth.remark,
    })
    .from(attendanceSheetMonth)
    .leftJoin(emp, eq(emp.id, attendanceSheetMonth.employeeId))
    .where(inArray(attendanceSheetMonth.employeeId, ids))
    .orderBy(desc(attendanceSheetMonth.fy), desc(attendanceSheetMonth.month))
    .limit(CAP);

  return [
    {
      key: "logs",
      title: "Punch log",
      columns: [
        { key: "date", label: "Date" },
        { key: "emp", label: "Employee" },
        { key: "kind", label: "Punch" },
        { key: "at", label: "Time" },
        { key: "mode", label: "Work mode" },
        { key: "source", label: "Source" },
        { key: "verify", label: "Verified by" },
        { key: "note", label: "Note" },
      ],
      rows: logs.map((r) => [
        day(r.logDate),
        r.emp,
        titleCase(r.kind),
        r.loggedAt ? formatTimeInTz(r.loggedAt, IST) : null,
        titleCase(r.workMode),
        titleCase(r.source),
        titleCase(r.verify),
        dash(r.note),
      ]),
      total: await countWhere(attendanceLogs, inArray(attendanceLogs.employeeId, ids)),
    },
    {
      key: "sheets",
      title: "Monthly attendance sheets",
      columns: [
        { key: "fy", label: "FY" },
        { key: "month", label: "Month" },
        { key: "emp", label: "Employee" },
        { key: "present", label: "Present", align: "right" },
        { key: "absent", label: "Absent", align: "right" },
        { key: "half", label: "Half days", align: "right" },
        { key: "off", label: "Weekly off", align: "right" },
        { key: "worked", label: "Days worked", align: "right" },
        { key: "remark", label: "Remark" },
      ],
      rows: sheets.map((r) => [
        dash(r.fy),
        titleCase(r.month),
        r.emp ?? dash(r.fallbackName),
        r.present ?? null,
        r.absent ?? null,
        r.halfDay ?? null,
        r.weeklyOff ?? null,
        r.worked == null ? null : Number(r.worked),
        dash(r.remark),
      ]),
      total: await countWhere(attendanceSheetMonth, inArray(attendanceSheetMonth.employeeId, ids)),
    },
  ];
}

async function archiveLeaves(ids: string[]): Promise<ArchiveTable[]> {
  const emp = alias(employees, "arch_leave_emp");
  const decider = alias(employees, "arch_leave_decider");

  const rows = await db
    .select({
      from: leaveRequests.startDate,
      to: leaveRequests.endDate,
      emp: emp.name,
      kind: leaveRequests.kind,
      category: leaveCategories.name,
      days: leaveRequests.days,
      reason: leaveRequests.reason,
      status: leaveRequests.status,
      decidedBy: decider.name,
      decidedAt: leaveRequests.decidedAt,
    })
    .from(leaveRequests)
    .leftJoin(emp, eq(emp.id, leaveRequests.employeeId))
    .leftJoin(decider, eq(decider.id, leaveRequests.decidedById))
    .leftJoin(leaveCategories, eq(leaveCategories.id, leaveRequests.categoryId))
    .where(inArray(leaveRequests.employeeId, ids))
    .orderBy(desc(leaveRequests.startDate))
    .limit(CAP);

  const compOff = await db
    .select({
      earned: compOffCredits.earnedDate,
      emp: emp.name,
      status: compOffCredits.status,
      redeemed: compOffCredits.redeemedDate,
      note: compOffCredits.note,
    })
    .from(compOffCredits)
    .leftJoin(emp, eq(emp.id, compOffCredits.employeeId))
    .where(inArray(compOffCredits.employeeId, ids))
    .orderBy(desc(compOffCredits.earnedDate))
    .limit(CAP);

  return [
    {
      key: "requests",
      title: "Leave applications",
      columns: [
        { key: "from", label: "From" },
        { key: "to", label: "To" },
        { key: "emp", label: "Employee" },
        { key: "kind", label: "Kind" },
        { key: "category", label: "Category" },
        { key: "days", label: "Days", align: "right" },
        { key: "reason", label: "Reason" },
        { key: "status", label: "Status" },
        { key: "decidedBy", label: "Decided by" },
        { key: "decidedAt", label: "Decided" },
      ],
      rows: rows.map((r) => [
        day(r.from),
        day(r.to),
        r.emp,
        titleCase(r.kind),
        dash(r.category),
        r.days == null ? null : Number(r.days),
        dash(r.reason),
        titleCase(r.status),
        r.decidedBy,
        day(r.decidedAt),
      ]),
      total: await countWhere(leaveRequests, inArray(leaveRequests.employeeId, ids)),
    },
    {
      key: "comp-off",
      title: "Comp-off credits",
      columns: [
        { key: "earned", label: "Earned on" },
        { key: "emp", label: "Employee" },
        { key: "status", label: "Status" },
        { key: "redeemed", label: "Redeemed on" },
        { key: "note", label: "Note" },
      ],
      rows: compOff.map((r) => [
        day(r.earned),
        r.emp,
        titleCase(r.status),
        day(r.redeemed),
        dash(r.note),
      ]),
      total: await countWhere(compOffCredits, inArray(compOffCredits.employeeId, ids)),
    },
  ];
}

async function archiveReimbursements(
  ids: string[],
  scope: ArchiveScope,
): Promise<ArchiveTable[]> {
  return [
    await moduleSubmissionTable(
      ids,
      scope,
      "reimbursement",
      "claims",
      tableTitle(scope, "Reimbursement claims", "Archived reimbursement claims"),
    ),
  ];
}

/** module_submissions is one table behind several forms; each archive section
 *  that reads it picks its own `module` key. */
async function moduleSubmissionTable(
  ids: string[],
  scope: ArchiveScope,
  moduleKey: string,
  key: string,
  title: string,
): Promise<ArchiveTable> {
  const emp = alias(employees, `arch_mod_${key}_emp`);
  const decider = alias(employees, `arch_mod_${key}_decider`);
  const where = and(
    inArray(moduleSubmissions.employeeId, ids),
    eq(moduleSubmissions.module, moduleKey),
    putAway(scope, moduleSubmissions.archived),
  );

  const rows = await db
    .select({
      id: moduleSubmissions.id,
      created: moduleSubmissions.createdAt,
      emp: emp.name,
      fields: moduleSubmissions.fields,
      status: moduleSubmissions.status,
      decidedBy: decider.name,
      decidedAt: moduleSubmissions.decidedAt,
      archived: moduleSubmissions.archived,
    })
    .from(moduleSubmissions)
    .leftJoin(emp, eq(emp.id, moduleSubmissions.employeeId))
    .leftJoin(decider, eq(decider.id, moduleSubmissions.decidedById))
    .where(where)
    .orderBy(desc(moduleSubmissions.createdAt))
    .limit(CAP);

  return {
    key,
    title,
    record: "module-submission",
    rowIds: rows.map((r) => r.id),
    columns: [
      { key: "created", label: "Submitted" },
      { key: "emp", label: "Employee" },
      { key: "detail", label: "Details" },
      { key: "status", label: "Status" },
      { key: "decidedBy", label: "Decided by" },
      { key: "decidedAt", label: "Decided" },
      { key: "arch", label: "Archived" },
    ],
    // The form's own fields are admin-configurable (formConfigs), so the row is
    // summarised as "label: value · label: value" rather than pretending to a
    // fixed column set that a form edit would silently invalidate.
    rows: rows.map((r) => [
      day(r.created),
      r.emp,
      summariseFields(r.fields),
      titleCase(r.status),
      r.decidedBy,
      day(r.decidedAt),
      yesNo(r.archived),
    ]),
    total: await countWhere(moduleSubmissions, where),
  };
}

function summariseFields(fields: Record<string, string> | null | undefined): string | null {
  if (!fields) return null;
  const parts = Object.entries(fields)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .slice(0, 6)
    .map(([k, v]) => `${titleCase(k)}: ${v}`);
  return parts.length ? parts.join(" · ") : null;
}

/* ── Productivity ────────────────────────────────────────────────────────── */

async function archiveKpis(ids: string[], scope: ArchiveScope): Promise<ArchiveTable[]> {
  const present = scope === "present";
  const emp = alias(employees, "arch_kpi_emp");

  const assignments = await db
    .select({
      id: kpiAssignments.id,
      quarter: kpiAssignments.effectiveQuarter,
      emp: emp.name,
      name: kpiAssignments.kpiName,
      category: kpiAssignments.category,
      frequency: kpiAssignments.frequency,
      weight: kpiAssignments.weightage,
      target: kpiAssignments.targetValue,
      current: kpiAssignments.currentValue,
      status: kpiAssignments.status,
      archived: kpiAssignments.archived,
    })
    .from(kpiAssignments)
    .leftJoin(emp, eq(emp.id, kpiAssignments.employeeId))
    .where(and(inArray(kpiAssignments.employeeId, ids), putAway(scope, kpiAssignments.archived)))
    .orderBy(desc(kpiAssignments.effectiveQuarter))
    .limit(CAP);

  // A computed monthly scorecard is a derived record with no archive flag.
  const cards = present
    ? []
    : await db
    .select({
      month: performanceScorecards.periodMonth,
      emp: emp.name,
      fallbackName: performanceScorecards.personName,
      roleClass: performanceScorecards.roleClass,
      total: performanceScorecards.totalScore,
      incentivePct: performanceScorecards.incentivePct,
      narrative: performanceScorecards.narrative,
    })
    .from(performanceScorecards)
    .leftJoin(emp, eq(emp.id, performanceScorecards.employeeId))
    .where(inArray(performanceScorecards.employeeId, ids))
    .orderBy(desc(performanceScorecards.periodMonth))
    .limit(CAP);

  return [
    {
      key: "assignments",
      title: tableTitle(scope, "KPI assignments", "Archived KPI assignments"),
      record: "kpi-assignment",
      rowIds: assignments.map((r) => r.id),
      columns: [
        { key: "quarter", label: "Quarter" },
        { key: "emp", label: "Employee" },
        { key: "name", label: "KPI" },
        { key: "category", label: "Category" },
        { key: "freq", label: "Frequency" },
        { key: "weight", label: "Weight", align: "right" },
        { key: "target", label: "Target" },
        { key: "current", label: "Last value" },
        { key: "status", label: "Status" },
        { key: "arch", label: "Archived" },
      ],
      rows: assignments.map((r) => [
        dash(r.quarter),
        r.emp,
        r.name,
        titleCase(r.category),
        titleCase(r.frequency),
        r.weight ?? null,
        dash(r.target),
        dash(r.current),
        titleCase(r.status),
        yesNo(r.archived),
      ]),
      total: await countWhere(
        kpiAssignments,
        and(inArray(kpiAssignments.employeeId, ids), putAway(scope, kpiAssignments.archived)),
      ),
    },
    ...(present ? [] : [{
      key: "scorecards",
      title: "Performance scorecards",
      columns: [
        { key: "month", label: "Month" },
        { key: "emp", label: "Employee" },
        { key: "role", label: "Role class" },
        { key: "total", label: "Score", align: "right" },
        { key: "pct", label: "Incentive %", align: "right" },
        { key: "narrative", label: "Narrative" },
      ],
      rows: cards.map((r) => [
        day(r.month),
        r.emp ?? dash(r.fallbackName),
        titleCase(r.roleClass),
        r.total == null ? null : Number(r.total),
        r.incentivePct == null ? null : Number(r.incentivePct),
        dash(r.narrative),
      ]),
      total: await countWhere(performanceScorecards, inArray(performanceScorecards.employeeId, ids)),
    } satisfies ArchiveTable]),
  ];
}

async function archiveAppraisals(ids: string[]): Promise<ArchiveTable[]> {
  const emp = alias(employees, "arch_appr_emp");
  const reviewer = alias(employees, "arch_appr_reviewer");

  const cards = await db
    .select({
      emp: emp.name,
      status: apprScorecard.status,
      culture: apprScorecard.cultureScore,
      incentive: apprScorecard.incentiveScore,
      finalizedAt: apprScorecard.finalizedAt,
      updatedAt: apprScorecard.updatedAt,
    })
    .from(apprScorecard)
    .leftJoin(emp, eq(emp.id, apprScorecard.employeeId))
    .where(inArray(apprScorecard.employeeId, ids))
    .orderBy(desc(apprScorecard.updatedAt))
    .limit(CAP);

  const items = await db
    .select({
      emp: emp.name,
      kind: apprItemScore.itemKind,
      actual: apprItemScore.actual,
      self: apprItemScore.selfScore,
      manager: apprItemScore.managerScore,
      management: apprItemScore.managementScore,
      approved: apprItemScore.approved,
      remarks: apprItemScore.remarks,
      updatedAt: apprItemScore.updatedAt,
    })
    .from(apprItemScore)
    .leftJoin(emp, eq(emp.id, apprItemScore.employeeId))
    .where(inArray(apprItemScore.employeeId, ids))
    .orderBy(desc(apprItemScore.updatedAt))
    .limit(CAP);

  const dimensions = await db
    .select({
      emp: emp.name,
      dimension: apprDimensionScore.dimensionKey,
      self: apprDimensionScore.selfScore,
      manager: apprDimensionScore.managerScore,
      management: apprDimensionScore.managementScore,
      updatedAt: apprDimensionScore.updatedAt,
    })
    .from(apprDimensionScore)
    .leftJoin(emp, eq(emp.id, apprDimensionScore.employeeId))
    .where(inArray(apprDimensionScore.employeeId, ids))
    .orderBy(desc(apprDimensionScore.updatedAt))
    .limit(CAP);

  const reviews = await db
    .select({
      period: pmsReview.period,
      emp: emp.name,
      reviewer: reviewer.name,
      rating: pmsReview.rating,
      status: pmsReview.status,
      strengths: pmsReview.strengths,
      improvements: pmsReview.improvements,
    })
    .from(pmsReview)
    .leftJoin(emp, eq(emp.id, pmsReview.employeeId))
    .leftJoin(reviewer, eq(reviewer.id, pmsReview.reviewerId))
    .where(inArray(pmsReview.employeeId, ids))
    .orderBy(desc(pmsReview.period))
    .limit(CAP);

  return [
    {
      key: "scorecards",
      title: "Appraisal scorecards",
      columns: [
        { key: "emp", label: "Employee" },
        { key: "status", label: "Status" },
        { key: "culture", label: "Culture", align: "right" },
        { key: "incentive", label: "Incentive", align: "right" },
        { key: "finalized", label: "Finalised" },
        { key: "updated", label: "Last touched" },
      ],
      rows: cards.map((r) => [
        r.emp,
        titleCase(r.status),
        r.culture ?? null,
        r.incentive ?? null,
        day(r.finalizedAt),
        day(r.updatedAt),
      ]),
      total: await countWhere(apprScorecard, inArray(apprScorecard.employeeId, ids)),
    },
    {
      key: "items",
      title: "Item scores (KPI · skill · attitude)",
      columns: [
        { key: "emp", label: "Employee" },
        { key: "kind", label: "Kind" },
        { key: "actual", label: "Actual" },
        { key: "self", label: "Self", align: "right" },
        { key: "manager", label: "Manager", align: "right" },
        { key: "management", label: "Management", align: "right" },
        { key: "approved", label: "Approved" },
        { key: "remarks", label: "Remarks" },
      ],
      rows: items.map((r) => [
        r.emp,
        titleCase(r.kind),
        dash(r.actual),
        r.self ?? null,
        r.manager ?? null,
        r.management ?? null,
        yesNo(r.approved),
        dash(r.remarks),
      ]),
      total: await countWhere(apprItemScore, inArray(apprItemScore.employeeId, ids)),
    },
    {
      key: "dimensions",
      title: "Dimension scores",
      columns: [
        { key: "emp", label: "Employee" },
        { key: "dimension", label: "Dimension" },
        { key: "self", label: "Self", align: "right" },
        { key: "manager", label: "Manager", align: "right" },
        { key: "management", label: "Management", align: "right" },
        { key: "updated", label: "Last touched" },
      ],
      rows: dimensions.map((r) => [
        r.emp,
        titleCase(r.dimension),
        r.self ?? null,
        r.manager ?? null,
        r.management ?? null,
        day(r.updatedAt),
      ]),
      total: await countWhere(apprDimensionScore, inArray(apprDimensionScore.employeeId, ids)),
    },
    {
      key: "reviews",
      title: "Performance reviews",
      columns: [
        { key: "period", label: "Period" },
        { key: "emp", label: "Employee" },
        { key: "reviewer", label: "Reviewer" },
        { key: "rating", label: "Rating", align: "right" },
        { key: "status", label: "Status" },
        { key: "strengths", label: "Strengths" },
        { key: "improvements", label: "Improvements" },
      ],
      rows: reviews.map((r) => [
        dash(r.period),
        r.emp,
        r.reviewer,
        r.rating ?? null,
        titleCase(r.status),
        dash(r.strengths),
        dash(r.improvements),
      ]),
      total: await countWhere(pmsReview, inArray(pmsReview.employeeId, ids)),
    },
  ];
}

/**
 * Team Performance — the rows somebody took OFF the board (migration 0232).
 *
 * The only section whose record IS a person. There is nothing else it could be:
 * every figure on that board is computed live at render time and stored
 * nowhere, so the thing that was put away is the row's place on the list, and
 * the flag holding it is a column on `employees`.
 *
 * READ IN RAW SQL, through lib/productivity/archive.ts, because that flag is
 * deliberately not part of the drizzle `employees` table — naming it there
 * would put it in the full-row select that resolves the signed-in user on every
 * request, and break the login on any database without 0232. That module
 * answers with an empty list on such a database, so this section is simply
 * empty rather than an error.
 *
 * FLAGGED IN BOTH HALVES, which is the exception to the Past rule at the top of
 * this file. Everywhere else, Past shows a leaver's whole trail because all of
 * it belongs here once they are gone. Here the whole trail would be "this
 * person exists" — one row per employee, saying nothing. So both halves read
 * the flag, and a leaver appears only if their row was actually archived.
 *
 * READ-ONLY EXCEPT FOR RESTORE. `restoreOnly` is what keeps Delete off these
 * rows: the id in `rowIds` is an EMPLOYEE id, and no list preference is worth a
 * button that would destroy the person's record. The server action refuses it
 * too — the button is the courtesy, the refusal is the boundary.
 */
async function archiveTeamPerformance(ids: string[], scope: ArchiveScope): Promise<ArchiveTable[]> {
  const rows = await archivedPerformanceRows(ids, CAP);

  return [
    {
      key: "rows",
      title: tableTitle(
        scope,
        "Rows taken off Team Performance",
        "Archived Team Performance rows",
      ),
      record: "team-performance",
      restoreOnly: true,
      rowIds: rows.map((r) => r.id),
      columns: [
        { key: "emp", label: "Employee" },
        { key: "dept", label: "Department" },
        { key: "mgr", label: "Reports to" },
        { key: "at", label: "Archived on" },
      ],
      rows: rows.map((r) => [
        r.name,
        dash(r.department),
        dash(r.managerName),
        day(r.archivedAt),
      ]),
      total: await archivedPerformanceCount(ids),
    },
  ];
}

/* ── Payroll ─────────────────────────────────────────────────────────────── */

async function archiveSalary(ids: string[]): Promise<ArchiveTable[]> {
  const emp = alias(employees, "arch_sal_emp");

  const runs = await db
    .select({
      fy: salaryRuns.fy,
      month: salaryRuns.month,
      emp: emp.name,
      payableDays: salaryRuns.payableDays,
      gross: salaryRuns.gross,
      net: salaryRuns.netPayable,
      disbursed: salaryRuns.disbursed,
      disbursedAmount: salaryRuns.disbursedAmount,
    })
    .from(salaryRuns)
    .leftJoin(emp, eq(emp.id, salaryRuns.employeeId))
    .where(inArray(salaryRuns.employeeId, ids))
    .orderBy(desc(salaryRuns.fy), desc(salaryRuns.month))
    .limit(CAP);

  const payments = await db
    .select({
      paidDate: salaryPayments.paidDate,
      emp: emp.name,
      month: salaryPayments.month,
      kind: salaryPayments.kind,
      amount: salaryPayments.amount,
      method: salaryPayments.method,
      note: salaryPayments.note,
    })
    .from(salaryPayments)
    .leftJoin(emp, eq(emp.id, salaryPayments.employeeId))
    .where(inArray(salaryPayments.employeeId, ids))
    .orderBy(desc(salaryPayments.paidDate))
    .limit(CAP);

  const advances = await db
    .select({
      date: salaryAdvances.advanceDate,
      emp: emp.name,
      fy: salaryAdvances.fy,
      month: salaryAdvances.month,
      amount: salaryAdvances.amount,
      note: salaryAdvances.note,
    })
    .from(salaryAdvances)
    .leftJoin(emp, eq(emp.id, salaryAdvances.employeeId))
    .where(inArray(salaryAdvances.employeeId, ids))
    .orderBy(desc(salaryAdvances.advanceDate))
    .limit(CAP);

  return [
    {
      key: "runs",
      title: "Salary runs",
      columns: [
        { key: "fy", label: "FY" },
        { key: "month", label: "Month" },
        { key: "emp", label: "Employee" },
        { key: "days", label: "Payable days", align: "right" },
        { key: "gross", label: "Gross", align: "right" },
        { key: "net", label: "Net payable", align: "right" },
        { key: "disbursed", label: "Disbursed" },
        { key: "disbursedAmt", label: "Disbursed amount", align: "right" },
      ],
      rows: runs.map((r) => [
        dash(r.fy),
        titleCase(r.month),
        r.emp,
        r.payableDays == null ? null : Number(r.payableDays),
        money(r.gross),
        money(r.net),
        yesNo(r.disbursed),
        money(r.disbursedAmount),
      ]),
      total: await countWhere(salaryRuns, inArray(salaryRuns.employeeId, ids)),
    },
    {
      key: "payments",
      title: "Payments",
      columns: [
        { key: "paidDate", label: "Paid on" },
        { key: "emp", label: "Employee" },
        { key: "month", label: "Month" },
        { key: "kind", label: "Kind" },
        { key: "amount", label: "Amount", align: "right" },
        { key: "method", label: "Method" },
        { key: "note", label: "Note" },
      ],
      rows: payments.map((r) => [
        day(r.paidDate),
        r.emp,
        titleCase(r.month),
        titleCase(r.kind),
        money(r.amount),
        titleCase(r.method),
        dash(r.note),
      ]),
      total: await countWhere(salaryPayments, inArray(salaryPayments.employeeId, ids)),
    },
    {
      key: "advances",
      title: "Advances",
      columns: [
        { key: "date", label: "Date" },
        { key: "emp", label: "Employee" },
        { key: "fy", label: "FY" },
        { key: "month", label: "Month" },
        { key: "amount", label: "Amount", align: "right" },
        { key: "note", label: "Note" },
      ],
      rows: advances.map((r) => [
        day(r.date),
        r.emp,
        dash(r.fy),
        titleCase(r.month),
        money(r.amount),
        dash(r.note),
      ]),
      total: await countWhere(salaryAdvances, inArray(salaryAdvances.employeeId, ids)),
    },
  ];
}

async function archiveOvertime(ids: string[]): Promise<ArchiveTable[]> {
  const emp = alias(employees, "arch_ot_emp");
  const approver = alias(employees, "arch_ot_approver");

  const rows = await db
    .select({
      date: overtimeEntries.workDate,
      emp: emp.name,
      hours: overtimeEntries.hours,
      reason: overtimeEntries.reason,
      status: overtimeEntries.status,
      approvedBy: approver.name,
      approvedAt: overtimeEntries.approvedAt,
      note: overtimeEntries.note,
    })
    .from(overtimeEntries)
    .leftJoin(emp, eq(emp.id, overtimeEntries.employeeId))
    .leftJoin(approver, eq(approver.id, overtimeEntries.approvedById))
    .where(inArray(overtimeEntries.employeeId, ids))
    .orderBy(desc(overtimeEntries.workDate))
    .limit(CAP);

  return [
    {
      key: "entries",
      title: "Overtime entries",
      columns: [
        { key: "date", label: "Work date" },
        { key: "emp", label: "Employee" },
        { key: "hours", label: "Hours", align: "right" },
        { key: "reason", label: "Reason" },
        { key: "status", label: "Status" },
        { key: "approvedBy", label: "Decided by" },
        { key: "approvedAt", label: "Decided" },
        { key: "note", label: "Note" },
      ],
      rows: rows.map((r) => [
        day(r.date),
        r.emp,
        r.hours == null ? null : Number(r.hours),
        dash(r.reason),
        titleCase(r.status),
        r.approvedBy,
        day(r.approvedAt),
        dash(r.note),
      ]),
      total: await countWhere(overtimeEntries, inArray(overtimeEntries.employeeId, ids)),
    },
  ];
}

/* ── HR ──────────────────────────────────────────────────────────────────── */

async function archiveHrRecords(ids: string[], scope: ArchiveScope): Promise<ArchiveTable[]> {
  const present = scope === "present";
  const emp = alias(employees, "arch_hr_emp");
  const successor = alias(employees, "arch_hr_successor");
  const archivedBy = alias(employees, "arch_hr_archived_by");
  const actor = alias(employees, "arch_hr_actor");
  const assignee = alias(employees, "arch_hr_assignee");

  // An exit record only exists for somebody who has left, so the Present half
  // has none by definition — and the employment event log is an audit trail,
  // which is the one thing that must never be selectively put away.
  const exits = present
    ? []
    : await db
    .select({
      lastDay: employeeExits.lastWorkingDay,
      emp: emp.name,
      reason: employeeExits.exitReason,
      reasonOther: employeeExits.exitReasonOther,
      rehire: employeeExits.rehireEligibility,
      notice: employeeExits.noticeServed,
      successor: successor.name,
      archivedBy: archivedBy.name,
      archivedAt: employeeExits.archivedAt,
      notes: employeeExits.notes,
    })
    .from(employeeExits)
    .leftJoin(emp, eq(emp.id, employeeExits.employeeId))
    .leftJoin(successor, eq(successor.id, employeeExits.successorId))
    .leftJoin(archivedBy, eq(archivedBy.id, employeeExits.archivedById))
    .where(inArray(employeeExits.employeeId, ids))
    .orderBy(desc(employeeExits.archivedAt))
    .limit(CAP);

  const docs = await db
    .select({
      id: employeeDocuments.id,
      date: employeeDocuments.effectiveDate,
      emp: emp.name,
      docType: employeeDocuments.docType,
      title: employeeDocuments.title,
      fileName: employeeDocuments.fileName,
      archived: employeeDocuments.archived,
      createdAt: employeeDocuments.createdAt,
    })
    .from(employeeDocuments)
    .leftJoin(emp, eq(emp.id, employeeDocuments.employeeId))
    .where(and(inArray(employeeDocuments.employeeId, ids), putAway(scope, employeeDocuments.archived)))
    .orderBy(desc(employeeDocuments.createdAt))
    .limit(CAP);

  const tickets = await db
    .select({
      id: hrTickets.id,
      created: hrTickets.createdAt,
      no: hrTickets.ticketNo,
      emp: emp.name,
      category: hrTickets.category,
      subject: hrTickets.subject,
      status: hrTickets.status,
      assignee: assignee.name,
      resolvedAt: hrTickets.resolvedAt,
    })
    .from(hrTickets)
    .leftJoin(emp, eq(emp.id, hrTickets.employeeId))
    .leftJoin(assignee, eq(assignee.id, hrTickets.assigneeId))
    .where(and(inArray(hrTickets.employeeId, ids), putAway(scope, hrTickets.archived)))
    .orderBy(desc(hrTickets.createdAt))
    .limit(CAP);

  const events = present
    ? []
    : await db
    .select({
      at: employeeEvents.createdAt,
      emp: emp.name,
      eventType: employeeEvents.eventType,
      actor: actor.name,
      note: employeeEvents.note,
    })
    .from(employeeEvents)
    .leftJoin(emp, eq(emp.id, employeeEvents.employeeId))
    .leftJoin(actor, eq(actor.id, employeeEvents.actorId))
    .where(inArray(employeeEvents.employeeId, ids))
    .orderBy(desc(employeeEvents.createdAt))
    .limit(CAP);

  return [
    ...(present ? [] : [{
      key: "exits",
      title: "Exit records",
      columns: [
        { key: "lastDay", label: "Last working day" },
        { key: "emp", label: "Employee" },
        { key: "reason", label: "Reason" },
        { key: "rehire", label: "Rehire" },
        { key: "notice", label: "Notice served" },
        { key: "successor", label: "Work handed to" },
        { key: "archivedBy", label: "Archived by" },
        { key: "archivedAt", label: "Archived on" },
        { key: "notes", label: "Notes" },
      ],
      rows: exits.map((r) => [
        day(r.lastDay),
        r.emp,
        [titleCase(r.reason), dash(r.reasonOther)].filter(Boolean).join(" — ") || null,
        titleCase(r.rehire),
        yesNo(r.notice),
        r.successor,
        r.archivedBy,
        day(r.archivedAt),
        dash(r.notes),
      ]),
      total: await countWhere(employeeExits, inArray(employeeExits.employeeId, ids)),
    } satisfies ArchiveTable]),
    {
      key: "documents",
      title: tableTitle(scope, "Employee documents", "Archived employee documents"),
      record: "employee-document",
      rowIds: docs.map((r) => r.id),
      columns: [
        { key: "date", label: "Effective" },
        { key: "emp", label: "Employee" },
        { key: "type", label: "Type" },
        { key: "title", label: "Title" },
        { key: "file", label: "File" },
        { key: "arch", label: "Archived" },
        { key: "uploaded", label: "Uploaded" },
      ],
      rows: docs.map((r) => [
        day(r.date),
        r.emp,
        titleCase(r.docType),
        dash(r.title),
        dash(r.fileName),
        yesNo(r.archived),
        day(r.createdAt),
      ]),
      total: await countWhere(
        employeeDocuments,
        and(inArray(employeeDocuments.employeeId, ids), putAway(scope, employeeDocuments.archived)),
      ),
    },
    {
      key: "tickets",
      title: tableTitle(scope, "Help-desk tickets", "Archived help-desk tickets"),
      record: "hr-ticket",
      rowIds: tickets.map((r) => r.id),
      columns: [
        { key: "created", label: "Raised" },
        { key: "no", label: "Ticket" },
        { key: "emp", label: "Employee" },
        { key: "category", label: "Category" },
        { key: "subject", label: "Subject" },
        { key: "status", label: "Status" },
        { key: "assignee", label: "Assignee" },
        { key: "resolved", label: "Resolved" },
      ],
      rows: tickets.map((r) => [
        day(r.created),
        r.no == null ? null : `#${r.no}`,
        r.emp,
        titleCase(r.category),
        dash(r.subject),
        titleCase(r.status),
        r.assignee,
        day(r.resolvedAt),
      ]),
      total: await countWhere(
        hrTickets,
        and(inArray(hrTickets.employeeId, ids), putAway(scope, hrTickets.archived)),
      ),
    },
    ...(present ? [] : [{
      key: "events",
      title: "Employment event log",
      columns: [
        { key: "at", label: "When" },
        { key: "emp", label: "Employee" },
        { key: "event", label: "Event" },
        { key: "actor", label: "By" },
        { key: "note", label: "Note" },
      ],
      rows: events.map((r) => [day(r.at), r.emp, titleCase(r.eventType), r.actor, dash(r.note)]),
      total: await countWhere(employeeEvents, inArray(employeeEvents.employeeId, ids)),
    } satisfies ArchiveTable]),
  ];
}

/* ── Sales ───────────────────────────────────────────────────────────────── */

async function archiveSales(ids: string[], scope: ArchiveScope): Promise<ArchiveTable[]> {
  const present = scope === "present";
  const owner = alias(employees, "arch_out_owner");

  const rows = present
    ? []
    : await db
    .select({
      due: outstandingEntries.dueDate,
      owner: owner.name,
      client: outstandingEntries.client,
      particulars: outstandingEntries.particulars,
      amount: outstandingEntries.amount,
      received: outstandingEntries.amountReceived,
      status: outstandingEntries.status,
    })
    .from(outstandingEntries)
    .leftJoin(owner, eq(owner.id, outstandingEntries.ownerId))
    .where(inArray(outstandingEntries.ownerId, ids))
    .orderBy(desc(outstandingEntries.dueDate))
    .limit(CAP);

  return [
    ...(present ? [] : [{
      key: "outstanding",
      title: "Outstanding entries they owned",
      columns: [
        { key: "due", label: "Due" },
        { key: "owner", label: "Owner" },
        { key: "client", label: "Client" },
        { key: "particulars", label: "Particulars" },
        { key: "amount", label: "Amount", align: "right" },
        { key: "received", label: "Received", align: "right" },
        { key: "status", label: "Status" },
      ],
      rows: rows.map((r) => [
        day(r.due),
        r.owner,
        dash(r.client),
        dash(r.particulars),
        money(r.amount),
        money(r.received),
        titleCase(r.status),
      ]),
      total: await countWhere(outstandingEntries, inArray(outstandingEntries.ownerId, ids)),
    } satisfies ArchiveTable]),
    await moduleSubmissionTable(
      ids,
      scope,
      "reference",
      "references",
      tableTitle(scope, "References they recorded", "Archived references they recorded"),
    ),
  ];
}

/* ── Project plan ────────────────────────────────────────────────────────── */

async function archivePlan(ids: string[], scope: ArchiveScope): Promise<ArchiveTable[]> {
  const present = scope === "present";
  const owner = alias(employees, "arch_plan_owner");
  const member = alias(employees, "arch_plan_member");
  const doer = alias(employees, "arch_plan_doer");

  const owned = await db
    .select({
      id: projectNodes.id,
      kind: projectNodes.kind,
      name: projectNodes.name,
      owner: owner.name,
      status: projectNodes.status,
      progress: projectNodes.progressPercent,
      target: projectNodes.targetDate,
      archived: projectNodes.isArchived,
    })
    .from(projectNodes)
    .leftJoin(owner, eq(owner.id, projectNodes.ownerId))
    .where(
      and(
        or(inArray(projectNodes.ownerId, ids), inArray(projectNodes.initiatorId, ids)),
        putAway(scope, projectNodes.isArchived),
      ),
    )
    .orderBy(desc(projectNodes.updatedAt))
    .limit(CAP);

  // Being on a team is a relationship, not a record with a life of its own.
  const memberships = present
    ? []
    : await db
    .select({
      name: projectNodes.name,
      kind: projectNodes.kind,
      member: member.name,
      since: projectMembers.createdAt,
    })
    .from(projectMembers)
    .leftJoin(member, eq(member.id, projectMembers.employeeId))
    .leftJoin(projectNodes, eq(projectNodes.id, projectMembers.projectNodeId))
    .where(inArray(projectMembers.employeeId, ids))
    .orderBy(desc(projectMembers.createdAt))
    .limit(CAP);

  const planTasks = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      doer: doer.name,
      node: projectNodes.name,
      status: tasks.status,
      dueAt: tasks.dueAt,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .leftJoin(doer, eq(doer.id, tasks.doerId))
    .leftJoin(projectNodes, eq(projectNodes.id, tasks.projectNodeId))
    .where(
      and(inArray(tasks.doerId, ids), isNotNull(tasks.projectNodeId), putAway(scope, tasks.archived)),
    )
    .orderBy(desc(tasks.dueAt))
    .limit(CAP);

  return [
    {
      key: "nodes",
      title: tableTitle(
        scope,
        "Plan items they owned or raised",
        "Archived plan items they own or raised",
      ),
      record: "project-node",
      rowIds: owned.map((r) => r.id),
      columns: [
        { key: "kind", label: "Level" },
        { key: "name", label: "Item" },
        { key: "owner", label: "Owner" },
        { key: "status", label: "Status" },
        { key: "progress", label: "Progress %", align: "right" },
        { key: "target", label: "Target" },
        { key: "arch", label: "Archived" },
      ],
      rows: owned.map((r) => [
        titleCase(r.kind),
        r.name,
        r.owner,
        titleCase(r.status),
        r.progress ?? null,
        day(r.target),
        yesNo(r.archived),
      ]),
      total: await countWhere(
        projectNodes,
        and(
          or(inArray(projectNodes.ownerId, ids), inArray(projectNodes.initiatorId, ids)),
          putAway(scope, projectNodes.isArchived),
        ),
      ),
    },
    ...(present ? [] : [{
      key: "members",
      title: "Teams they were on",
      columns: [
        { key: "kind", label: "Level" },
        { key: "name", label: "Item" },
        { key: "member", label: "Employee" },
        { key: "since", label: "Added" },
      ],
      rows: memberships.map((r) => [titleCase(r.kind), dash(r.name), r.member, day(r.since)]),
      total: await countWhere(projectMembers, inArray(projectMembers.employeeId, ids)),
    } satisfies ArchiveTable]),
    {
      key: "tasks",
      title: tableTitle(scope, "Plan-linked tasks", "Archived plan-linked tasks"),
      record: "task",
      rowIds: planTasks.map((r) => r.id),
      columns: [
        { key: "no", label: "Task" },
        { key: "title", label: "Title" },
        { key: "doer", label: "Doer" },
        { key: "node", label: "Plan item" },
        { key: "status", label: "Status" },
        { key: "due", label: "Due" },
        { key: "done", label: "Completed" },
      ],
      rows: planTasks.map((r) => [
        r.taskNo == null ? null : `#${r.taskNo}`,
        r.title,
        r.doer,
        dash(r.node),
        taskStatus(r.status),
        day(r.dueAt),
        day(r.completedAt),
      ]),
      total: await countWhere(
        tasks,
        and(inArray(tasks.doerId, ids), isNotNull(tasks.projectNodeId), putAway(scope, tasks.archived)),
      ),
    },
  ];
}

/* ── Counts for the Archive index ────────────────────────────────────────── */

type CountSpec = (ids: string[], scope: ArchiveScope) => Promise<number>;

/**
 * One table's contribution to a section's count.
 *
 * `archivedCol` is the row's own archive flag where it has one. In the PRESENT
 * half a table without that flag contributes NOTHING — the same rule the
 * loaders apply, so a card's number and the page it opens can never disagree.
 */
const by =
  (table: PgTable, col: AnyPgColumn, archivedCol?: AnyPgColumn): CountSpec =>
  (ids, scope) => {
    if (scope === "present" && !archivedCol) return Promise.resolve(0);
    return countWhere(table, and(inArray(col, ids), archivedCol && putAway(scope, archivedCol)));
  };

/** `by()` for the tables that stamp a time instead of flipping a flag. */
const byTimestamp =
  (table: PgTable, col: AnyPgColumn, archivedAtCol: AnyPgColumn): CountSpec =>
  (ids, scope) =>
    countWhere(table, and(inArray(col, ids), putAwayAt(scope, archivedAtCol)));

const bySubmissionModule =
  (moduleKey: string): CountSpec =>
  (ids, scope) =>
    countWhere(
      moduleSubmissions,
      and(
        inArray(moduleSubmissions.employeeId, ids),
        eq(moduleSubmissions.module, moduleKey),
        putAway(scope, moduleSubmissions.archived),
      ),
    );

/**
 * What each section counts on the Archive index. The same tables the section
 * itself reads, so a card's number and its page can never disagree — add a
 * table to a loader above and its count belongs here in the same edit.
 */
const SECTION_COUNTS: Record<ArchiveSectionId, CountSpec[]> = {
  tasks: [by(tasks, tasks.doerId, tasks.archived)],
  goals: [
    byTimestamp(weeklyGoals, weeklyGoals.employeeId, weeklyGoals.archivedAt),
    byTimestamp(goals, goals.employeeId, goals.archivedAt),
    by(dailyChecklist, dailyChecklist.employeeId),
  ],
  dcc: [
    by(dccKpiItems, dccKpiItems.ownerEmployeeId, dccKpiItems.archived),
    by(dccEntries, dccEntries.filledById),
    by(dccReviews, dccReviews.ownerEmployeeId),
  ],
  incentives: [
    by(incentiveEntries, incentiveEntries.employeeId),
    by(incentiveRequests, incentiveRequests.employeeId),
    by(incentivePayoutEvents, incentivePayoutEvents.employeeId),
  ],
  attendance: [
    by(attendanceLogs, attendanceLogs.employeeId),
    by(attendanceSheetMonth, attendanceSheetMonth.employeeId),
  ],
  leaves: [by(leaveRequests, leaveRequests.employeeId), by(compOffCredits, compOffCredits.employeeId)],
  reimbursements: [bySubmissionModule("reimbursement")],
  kpis: [
    by(kpiAssignments, kpiAssignments.employeeId, kpiAssignments.archived),
    by(performanceScorecards, performanceScorecards.employeeId),
  ],
  appraisals: [
    by(apprScorecard, apprScorecard.employeeId),
    by(apprItemScore, apprItemScore.employeeId),
    by(apprDimensionScore, apprDimensionScore.employeeId),
    by(pmsReview, pmsReview.employeeId),
  ],
  // Counted in BOTH halves off the flag — see archiveTeamPerformance for why
  // a leaver with no archived row has nothing to show here.
  // Raw SQL and zero where 0232 is not applied — see archiveTeamPerformance.
  "team-performance": [(ids) => archivedPerformanceCount(ids)],
  salary: [
    by(salaryRuns, salaryRuns.employeeId),
    by(salaryPayments, salaryPayments.employeeId),
    by(salaryAdvances, salaryAdvances.employeeId),
  ],
  overtime: [by(overtimeEntries, overtimeEntries.employeeId)],
  "hr-records": [
    by(employeeExits, employeeExits.employeeId),
    by(employeeDocuments, employeeDocuments.employeeId, employeeDocuments.archived),
    by(hrTickets, hrTickets.employeeId, hrTickets.archived),
    by(employeeEvents, employeeEvents.employeeId),
  ],
  sales: [by(outstandingEntries, outstandingEntries.ownerId), bySubmissionModule("reference")],
  plan: [
    (ids, scope) =>
      countWhere(
        projectNodes,
        and(
          or(inArray(projectNodes.ownerId, ids), inArray(projectNodes.initiatorId, ids)),
          putAway(scope, projectNodes.isArchived),
        ),
      ),
    by(projectMembers, projectMembers.employeeId),
    (ids, scope) =>
      countWhere(
        tasks,
        and(inArray(tasks.doerId, ids), isNotNull(tasks.projectNodeId), putAway(scope, tasks.archived)),
      ),
  ],
};

/**
 * How many records each section holds, for the Archive index cards. One pass,
 * all counts in parallel — they are indexed equality counts, not scans.
 */
export async function archiveSectionCounts(opts: {
  scope: ArchiveScope;
  employeeId?: string;
}): Promise<Record<ArchiveSectionId, number>> {
  const ids = await scopeIds(opts.scope, opts.employeeId);
  const empty = Object.fromEntries(
    (Object.keys(SECTION_COUNTS) as ArchiveSectionId[]).map((k) => [k, 0]),
  ) as Record<ArchiveSectionId, number>;
  if (!ids || ids.length === 0) return empty;

  const entries = Object.entries(SECTION_COUNTS) as [ArchiveSectionId, CountSpec[]][];

  // IN BATCHES, not one 33-wide Promise.all. The fifteen sections count across
  // thirty-odd tables between them, and firing all of those at once is worse
  // than useless on both ends of the app: against Supabase they queue on a pool
  // of ten connections while starving whatever else the request needs, and in
  // DUMMY MODE the database is a single-threaded WASM Postgres inside the dev
  // server — thirty simultaneous statements there is how a dev machine with
  // little memory left ends up killing its own render worker. Six at a time is
  // fast enough (these are indexed equality counts) and stays polite.
  const totals: number[] = [];
  const jobs = entries.map(([id, specs]) => async () => {
    // Same early exit the loader takes: nothing in this section can be put away
    // by hand, so for somebody still here the honest number is zero.
    if (opts.scope === "present" && !archiveSection(id).archivable) return 0;
    const parts: number[] = [];
    for (const f of specs) parts.push(await f(ids, opts.scope));
    return parts.reduce((a, b) => a + b, 0);
  });
  const WIDTH = 6;
  for (let i = 0; i < jobs.length; i += WIDTH) {
    totals.push(...(await Promise.all(jobs.slice(i, i + WIDTH).map((j) => j()))));
  }

  return Object.fromEntries(entries.map(([id], i) => [id, totals[i] ?? 0])) as Record<
    ArchiveSectionId,
    number
  >;
}
