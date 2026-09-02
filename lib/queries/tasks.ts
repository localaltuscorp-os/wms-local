import {
  FINE_BUCKET_OFFSETS,
  type FineBucketKey,
} from "@/lib/transforms/aging-buckets-fine";
import { and, eq, gte, inArray, lt, or, asc, desc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { unstable_cache } from "next/cache";
import { db, employees, tasks, taskTimeRollup } from "@/lib/db";
import { TASK_STATUSES, TASK_PRIORITIES, PENDING_STATUSES } from "@/db/enums";
import type { TaskStatus, ApprovalStatus } from "@/db/enums";
import { employeeIdsInDepartments } from "@/lib/queries/departments";
import { resolveTeamScopes } from "@/lib/queries/team-scope";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { effectiveDueAtSql } from "@/lib/tasks/effective-due";
import type { TaskListFilters, TaskListRow } from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Statuses that are still LIVE work. `?overdue=true` narrows to these only:
 * a finished task cannot be overdue, it is finished — including one delivered
 * late, which the Age column already records. `not_approved` IS live: a
 * sent-back task is waiting on the doer, and it is the whole point of the
 * "Sent-back work, by person" drill-through.
 */
const AGE_TERMINAL: readonly string[] = ["done", "approved", "cancelled", "transferred"];

/**
 * Computed on CALL, not at module load. A module-level
 * `TASK_STATUSES.filter(...)` evaluates the moment this file is first imported,
 * and if the enum module has not finished initialising by then (import order,
 * bundler chunking, a cycle introduced later) the value is `undefined` and the
 * `.filter` throws — at import time, taking down every route that touches this
 * file rather than the one query that needed it. There is no measurable cost to
 * building a nine-item array per call.
 */
function overdueOpenStatuses() {
  return TASK_STATUSES.filter((s) => !AGE_TERMINAL.includes(s));
}

/**
 * `?overdue=true` — effective due date strictly before today, still open.
 *
 * Compared against TODAY AT UTC MIDNIGHT, not `now`: a task due today is not
 * overdue at 6pm, and comparing against the current instant would flip it to
 * overdue partway through its own due date.
 */
/**
 * `?age_range=<slug>` — narrow to one of the nine fine aging buckets.
 *
 * The bucket is a window on `effectiveDue − today` in whole days (negative =
 * overdue), and FINE_BUCKET_OFFSETS is the single source for those bounds —
 * the same table `bucketForOffset` is tested against, so a row selected here is
 * provably the same row the chart counted into that bar.
 *
 * Bounds become HALF-OPEN date comparisons. `offset <= max` means "due on or
 * before today+max", and since effective_due_at is a TIMESTAMP rather than a
 * date, "on that day" has to be expressed as `< the following midnight` — a
 * plain `<=` against midnight would drop every task due later that same day.
 */
function ageRangeConditions(key: FineBucketKey) {
  const { min, max } = FINE_BUCKET_OFFSETS[key];
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const dayAfter = (offset: number) =>
    new Date(todayUtc.getTime() + (offset + 1) * MS_PER_DAY);
  const dayStart = (offset: number) =>
    new Date(todayUtc.getTime() + offset * MS_PER_DAY);

  const out = [];
  if (min !== null) out.push(gte(effectiveDueAtSql(), dayStart(min)));
  if (max !== null) out.push(lt(effectiveDueAtSql(), dayAfter(max)));
  return out;
}

function overdueConditions() {
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  // Returned as a LIST rather than one and(): drizzle's and() is typed
  // `SQL | undefined`, and spreading two definite conditions into the existing
  // array keeps the types honest without an assertion.
  return [
    lt(effectiveDueAtSql(), todayUtc),
    inArray(tasks.status, overdueOpenStatuses()),
  ];
}

/**
 * NOT READ — pending work nobody has opened.
 *
 * BOTH halves are required. `first_read_at IS NULL` alone would sweep in every
 * finished task that never had a read receipt written, which is not "unread",
 * it is "done, and nobody needed to open it again". Pairing the null check with
 * PENDING_STATUSES makes this filter return exactly the set the Not Read pill
 * counts (see computeStatCounts in components/tasks/task-list-page.tsx) — if
 * the two ever diverge, the pill's number and the list it opens disagree, which
 * is the failure that made the pill worth wiring up in the first place.
 *
 * A list, like overdueConditions(), so both definite conditions spread into the
 * caller's array without an assertion.
 */
function unreadConditions() {
  return [
    sql`${tasks.firstReadAt} IS NULL`,
    inArray(tasks.status, [...PENDING_STATUSES]),
  ];
}

/**
 * Whole-day index for a timestamp, in UTC.
 *
 * Age is a CALENDAR-DAY difference, not elapsed milliseconds. The previous
 * `Math.floor((now - createdAt) / MS_PER_DAY)` counted complete 24-hour periods,
 * so a task created at 11pm yesterday read "0d" at 9am today — while the Due
 * column beside it, which uses `differenceInCalendarDays`, was already counting
 * that as a day. Two adjacent columns measuring in different units is exactly
 * the Due/Age mismatch this fixes. Flooring to the UTC day makes both agree and
 * removes the drift entirely.
 */
function dayIndex(d: Date): number {
  return Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / MS_PER_DAY,
  );
}

/**
 * Coerce a timestamp that MIGHT already be a Date, might be an ISO string, and
 * might be neither.
 *
 * `effectiveDueAtSql()` is a raw `sql<Date>` fragment, and that type parameter
 * is a COMPILE-TIME ASSERTION with no runtime mapper behind it — drizzle only
 * converts values for real column definitions. So the effective due date can
 * arrive as an ISO string, exactly as lib/tasks/time/engine.ts documents for
 * raw `tx.execute(sql)`, and exactly why the cached wrapper below already casts
 * `r.dueAt as unknown as string | Date` before calling `new Date` on it.
 *
 * Returns null rather than an Invalid Date so callers branch instead of
 * silently producing NaN.
 */
function toDate(v: Date | string | number | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}


/**
 * Age = today − due date, in whole calendar days.
 *
 *   positive → that many days OVERDUE
 *   0        → due today
 *   negative → that many days still REMAINING
 *
 * Both sides go through `dayIndex`, which floors a timestamp to its UTC day
 * boundary, so this is an integer subtraction of two day numbers — NOT a
 * millisecond delta divided and floored. That distinction is the whole point:
 * a due date at 18:00 and a "now" at 09:00 are 15 hours apart, which floor
 * division of elapsed time reports as 0 days even when the calendar has
 * clearly turned over. Normalising first removes that class of bug entirely,
 * and it is why partial hours can never collapse a real gap to 0.
 *
 * `dueAt` is the EFFECTIVE due date (revised ?? original, see
 * effectiveDueAtSql), so moving a deadline moves the age with it. It is
 * `notNull` on the table and non-nullable on TaskListRow, so there is no
 * null branch and no fallback constant — the type carries that guarantee
 * instead of a runtime `return 0`.
 *
 * NOTHING FREEZES. An earlier version stopped the clock for finished tasks so
 * they recorded how late they were DELIVERED. That is gone by request: the
 * formula is now purely today-relative for every row. The consequence is that
 * a completed task keeps accumulating — one delivered a day late last year
 * reads its full elapsed overdue count, not 1d.
 */
function ageInDays(dueAt: Date | string | null, nowDay: number): number {
  const due = toDate(dueAt);
  // THIS GUARD IS WHY /tasks WAS THROWING. `dayIndex` calls getUTCFullYear on
  // its argument; handed the ISO string that effectiveDueAtSql can return, that
  // is a TypeError — which happens inside a server component, so it took the
  // whole page down to the route error boundary rather than spoiling one cell.
  // The previous version of this function read `createdAt`, a real column with
  // a real mapper, which is why the problem only appeared once Age moved onto
  // the due date.
  //
  // Returning 0 here is a CRASH GUARD, not a display fallback: it is the
  // difference between one odd row reading 0d and nobody seeing any tasks.
  if (!due) return 0;
  return nowDay - dayIndex(due);
}

// A task's "effective" status spans two columns: the working `status` and the
// admin `approval_status` verdict. The dashboard counts treat a task as e.g.
// Not Approved when EITHER column says so (lib/queries/dashboard.ts), so the
// list filter must match the same way — otherwise the "Not Approved" KPI
// filtered on `status` alone and showed almost nothing (sir's changes #14).
// All FOUR verdicts, not two. `cancelled` and `transferred` are recorded in
// approval_status exactly like the other two, and computeEmployeeStatusTable
// counts them from either column — so with only two listed here, the Cancelled
// and Transferred cell links opened a SHORTER list than the badge beside them
// promised. Same bug as sir's changes #14, two columns further along.
const APPROVAL_VERDICTS = new Set<TaskStatus>([
  "approved",
  "not_approved",
  "cancelled",
  "transferred",
]);

function statusFilterCondition(statuses: TaskStatus[]) {
  if (statuses.length === 0) return undefined;
  const byStatus = inArray(tasks.status, statuses);
  const verdicts = statuses.filter((s) => APPROVAL_VERDICTS.has(s));
  if (verdicts.length === 0) return byStatus;
  return or(byStatus, inArray(tasks.approvalStatus, verdicts as ApprovalStatus[]));
}

async function listTasksUncached(filters: TaskListFilters): Promise<TaskListRow[]> {
  const conditions = [eq(tasks.archived, filters.archived)];

  if (filters.startDate) conditions.push(gte(tasks.createdAt, filters.startDate));
  if (filters.endDate)
    conditions.push(lt(tasks.createdAt, new Date(filters.endDate.getTime() + MS_PER_DAY)));
  const statusCond = statusFilterCondition(filters.statuses);
  if (statusCond)                    conditions.push(statusCond);
  if (filters.doerIds.length > 0)    conditions.push(inArray(tasks.doerId, filters.doerIds));
  if (filters.initiatorIds.length > 0)
    conditions.push(inArray(tasks.initiatorId, filters.initiatorIds));
  if (filters.priorities.length > 0) conditions.push(inArray(tasks.priority, filters.priorities));
  if (filters.subjects.length > 0)   conditions.push(inArray(tasks.subject, filters.subjects));
  if (filters.clients.length > 0)    conditions.push(inArray(tasks.client, filters.clients));
  if (filters.overdue)               conditions.push(...overdueConditions());
  if (filters.unread)                conditions.push(...unreadConditions());
  if (filters.ageRange)              conditions.push(...ageRangeConditions(filters.ageRange));
  if (filters.taskId)                conditions.push(eq(tasks.id, filters.taskId));

  if (filters.departments.length > 0) {
    // Match tasks whose doer belongs to ANY selected department, via the
    // membership join table (not just their primary department).
    const ids = await employeeIdsInDepartments(filters.departments);
    if (ids.length === 0) return [];
    conditions.push(inArray(tasks.doerId, ids));
  }

  // Team scope matches DOER **or** INITIATOR — a task a team member raised is
  // that team's work even when someone outside it is doing it, and the previous
  // doer-only rule made "my team" silently under-report exactly the delegation
  // a manager opens this filter to see.
  //
  // It stacks with the department filter above rather than replacing it: the
  // two answer different questions, and a user who sets both means the
  // intersection.
  const teamIds = await resolveTeamScopes(filters.teams, filters.viewerId);
  if (teamIds !== null) {
    // An empty resolved set is a real answer (an empty department), so it must
    // match nothing rather than fall through to the whole org.
    if (teamIds.length === 0) return [];
    const scoped = or(
      inArray(tasks.doerId, teamIds),
      inArray(tasks.initiatorId, teamIds),
    );
    if (scoped) conditions.push(scoped);
  }

  // Single query with both doer + initiator joined inline. The previous
  // implementation fetched initiator names in a second round-trip after
  // collecting the IDs from the first result; on a remote Postgres that
  // doubled the wall-clock cost of the list view for no functional gain.
  const doerEmp = alias(employees, "doer_emp");
  const initEmp = alias(employees, "init_emp");

  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      subject: tasks.subject,
      client: tasks.client,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      createdAt: tasks.createdAt,
      // Effective due (revised ?? original) so the table shows + flags overdue
      // from the revised date.
      dueAt: effectiveDueAtSql(),
      archived: tasks.archived,
      doerId: tasks.doerId,
      doerName: doerEmp.name,
      doerDept: doerEmp.department,
      initiatorId: tasks.initiatorId,
      initiatorName: initEmp.name,
      createdById: tasks.createdById,
      updatedAt: tasks.updatedAt,
      approvalStatus: tasks.approvalStatus,
      firstReadAt: tasks.firstReadAt,
      // "Start Time" — when the doer first hit Start on the timer. LEFT join, so
      // a task nobody has started simply has no rollup row and reads null.
      startedAt: taskTimeRollup.firstStartedAt,
      openSessions: taskTimeRollup.openSessionCount,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .leftJoin(doerEmp, eq(tasks.doerId, doerEmp.id))
    .leftJoin(initEmp, eq(tasks.initiatorId, initEmp.id))
    // LEFT, never INNER: the rollup row is only written once a task has its
    // first time event, so an inner join here would silently drop every task
    // that has never been started from the whole list.
    .leftJoin(taskTimeRollup, eq(tasks.id, taskTimeRollup.taskId))
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt))
    .limit(1000);

  const now = Date.now();
  const nowDay = dayIndex(new Date(now));
  return rows.map((r) => ({
    id: r.id,
    taskNo: r.taskNo,
    title: r.title,
    subject: r.subject,
    client: r.client,
    description: r.description,
    status: r.status,
    priority: r.priority,
    doerId: r.doerId,
    doerName: r.doerName ?? null,
    doerDept: r.doerDept ?? null,
    initiatorId: r.initiatorId,
    initiatorName: r.initiatorName ?? null,
    createdAt: r.createdAt,
    dueAt: r.dueAt,
    ageDays: ageInDays(r.dueAt, nowDay),
    archived: r.archived,
    createdById: r.createdById,
    updatedAt: r.updatedAt,
    approvalStatus: r.approvalStatus,
    firstReadAt: r.firstReadAt,
    startedAt: r.startedAt ?? null,
    timerRunning: (r.openSessions ?? 0) > 0,
    completedAt: r.completedAt,
  }));
}

/**
 * Cached wrapper for the hot list path (/tasks, /myday agenda, /archived all
 * call this). Caching it means a burst of concurrent loads is served from
 * cache instead of each hitting the DB — the key defence against connection
 * exhaustion on the 60-conn ceiling. 30s window, busted instantly on any task
 * mutation via the CACHE_TAGS.tasks tag (revalidateTaskRoutes → updateTag).
 * `unstable_cache` serialises Date→string on a hit, so dates are rehydrated.
 */
export async function listTasks(filters: TaskListFilters): Promise<TaskListRow[]> {
  const rows = await unstable_cache(
    () => listTasksUncached(filters),
    ["list-tasks", JSON.stringify(filters)],
    { revalidate: 30, tags: [CACHE_TAGS.tasks] },
  )();
  return rows.map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt as unknown as string | Date),
    dueAt: new Date(r.dueAt as unknown as string | Date),
    updatedAt: new Date(r.updatedAt as unknown as string | Date),
    firstReadAt: r.firstReadAt ? new Date(r.firstReadAt as unknown as string | Date) : null,
    startedAt: r.startedAt ? new Date(r.startedAt as unknown as string | Date) : null,
    completedAt: r.completedAt ? new Date(r.completedAt as unknown as string | Date) : null,
  }));
}

// ─── Phase 4.2 — cursor pagination ────────────────────────────────────────
//
// `listTasks()` above keeps its existing "flat array up to 1000 rows"
// contract so we don't break the 9 existing callers (exports, kanban,
// agenda, archived, etc.) in a single sweep. The new `listTasksPage()`
// returns `{ rows, nextCursor }` and is the path forward — adopt at each
// caller incrementally.
//
// Cursor shape: base64(`${createdAt-iso}|${id}`). The query orders by
// `createdAt desc, id desc` so the cursor encodes BOTH columns to break
// the (rare) tie when two tasks share a millisecond. Forward-only.

export interface TaskListPageOpts {
  /** Default: 50. Hard-capped at 200 server-side so a misbehaving caller
   *  can't request a 10k payload. */
  pageSize?: number;
  /** Opaque cursor from the previous page's `nextCursor`. Null = first page. */
  cursor?: string | null;
}

export interface TaskListPage {
  rows: TaskListRow[];
  nextCursor: string | null;
}

const MAX_PAGE_SIZE = 200;

function encodeCursor(row: { createdAt: Date; id: string }): string {
  // Buffer is fine in the Node runtime; the cursor is opaque so the
  // encoding could change later without breaking callers.
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, "utf8").toString("base64url");
}

function decodeCursor(c: string): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(c, "base64url").toString("utf8");
    const [iso, id] = raw.split("|");
    if (!iso || !id) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return { createdAt: d, id };
  } catch {
    return null;
  }
}

/**
 * Cached /tasks table page. The query is fast (<200ms) but under concurrent
 * load every page view opens a DB connection; against the hard 60-connection
 * ceiling that's the bottleneck, not latency. Memoise per (filters, opts) for
 * 30s, tagged CACHE_TAGS.tasks, so repeated/concurrent loads in the window are
 * served from cache. Mutations call updateTag(CACHE_TAGS.tasks) (see
 * revalidateTaskRoutes in app/(app)/tasks/actions.ts) → read-your-writes.
 *
 * unstable_cache serialises the result, so Date fields arrive as ISO strings
 * on a cache HIT — every Date in TaskListRow is re-wrapped below so the public
 * return type stays Date-typed and all consumers keep working unchanged.
 */
export async function listTasksPage(
  filters: TaskListFilters,
  opts: TaskListPageOpts = {},
): Promise<TaskListPage> {
  const keyParts = [
    "tasks-page",
    JSON.stringify(filters ?? {}),
    JSON.stringify(opts ?? {}),
  ];
  const page = await unstable_cache(
    () => listTasksPageUncached(filters, opts),
    keyParts,
    { revalidate: 30, tags: [CACHE_TAGS.tasks] },
  )();
  return {
    nextCursor: page.nextCursor,
    rows: page.rows.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt as unknown as string | Date),
      dueAt: new Date(r.dueAt as unknown as string | Date),
      updatedAt: new Date(r.updatedAt as unknown as string | Date),
      firstReadAt: r.firstReadAt
        ? new Date(r.firstReadAt as unknown as string | Date)
        : null,
      startedAt: r.startedAt ? new Date(r.startedAt as unknown as string | Date) : null,
      completedAt: r.completedAt
        ? new Date(r.completedAt as unknown as string | Date)
        : null,
    })),
  };
}

async function listTasksPageUncached(
  filters: TaskListFilters,
  opts: TaskListPageOpts = {},
): Promise<TaskListPage> {
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, opts.pageSize ?? 50));
  const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;

  const conditions = [eq(tasks.archived, filters.archived)];
  if (filters.startDate) conditions.push(gte(tasks.createdAt, filters.startDate));
  if (filters.endDate)
    conditions.push(lt(tasks.createdAt, new Date(filters.endDate.getTime() + MS_PER_DAY)));
  const statusCond = statusFilterCondition(filters.statuses);
  if (statusCond) conditions.push(statusCond);
  if (filters.doerIds.length > 0) conditions.push(inArray(tasks.doerId, filters.doerIds));
  if (filters.initiatorIds.length > 0)
    conditions.push(inArray(tasks.initiatorId, filters.initiatorIds));
  if (filters.priorities.length > 0)
    conditions.push(inArray(tasks.priority, filters.priorities));
  if (filters.subjects.length > 0) conditions.push(inArray(tasks.subject, filters.subjects));
  if (filters.taskId) conditions.push(eq(tasks.id, filters.taskId));
  if (filters.overdue) conditions.push(...overdueConditions());
  if (filters.unread) conditions.push(...unreadConditions());
  if (filters.ageRange) conditions.push(...ageRangeConditions(filters.ageRange));

  // Team scope, matching the flat path above. This path IGNORED it entirely
  // before — a pre-existing gap, harmless only because the Tasks page still
  // uses listTasks(); anything that adopted the cursor path would have silently
  // dropped the filter.
  const teamIds = await resolveTeamScopes(filters.teams, filters.viewerId);
  if (teamIds !== null) {
    if (teamIds.length === 0) return { rows: [], nextCursor: null };
    const scoped = or(
      inArray(tasks.doerId, teamIds),
      inArray(tasks.initiatorId, teamIds),
    );
    if (scoped) conditions.push(scoped);
  }

  if (filters.departments.length > 0) {
    const ids = await employeeIdsInDepartments(filters.departments);
    if (ids.length === 0) return { rows: [], nextCursor: null };
    conditions.push(inArray(tasks.doerId, ids));
  }

  // Cursor predicate: (createdAt, id) < (cursor.createdAt, cursor.id).
  // Expressed as the standard SQL keyset comparison so the existing
  // (createdAt) index still helps.
  if (cursor) {
    conditions.push(
      or(
        lt(tasks.createdAt, cursor.createdAt),
        and(eq(tasks.createdAt, cursor.createdAt), lt(tasks.id, cursor.id)),
      )!,
    );
  }

  const doerEmp = alias(employees, "doer_emp");
  const initEmp = alias(employees, "init_emp");

  // Fetch one extra row so we know whether a next page exists without a
  // separate `count(*)` round-trip.
  const fetched = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      subject: tasks.subject,
      client: tasks.client,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      createdAt: tasks.createdAt,
      // Effective due (revised ?? original) — table shows + flags overdue from it.
      dueAt: effectiveDueAtSql(),
      archived: tasks.archived,
      doerId: tasks.doerId,
      doerName: doerEmp.name,
      doerDept: doerEmp.department,
      initiatorId: tasks.initiatorId,
      initiatorName: initEmp.name,
      createdById: tasks.createdById,
      updatedAt: tasks.updatedAt,
      approvalStatus: tasks.approvalStatus,
      firstReadAt: tasks.firstReadAt,
      // "Start Time" — see the note on the same join in listTasksUncached.
      startedAt: taskTimeRollup.firstStartedAt,
      openSessions: taskTimeRollup.openSessionCount,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .leftJoin(doerEmp, eq(tasks.doerId, doerEmp.id))
    .leftJoin(initEmp, eq(tasks.initiatorId, initEmp.id))
    .leftJoin(taskTimeRollup, eq(tasks.id, taskTimeRollup.taskId))
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt), desc(tasks.id))
    .limit(pageSize + 1);

  const hasMore = fetched.length > pageSize;
  const pageRows = hasMore ? fetched.slice(0, pageSize) : fetched;
  const last = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last) : null;

  const now = Date.now();
  const nowDay = dayIndex(new Date(now));
  const rows: TaskListRow[] = pageRows.map((r) => ({
    id: r.id,
    taskNo: r.taskNo,
    title: r.title,
    subject: r.subject,
    client: r.client,
    description: r.description,
    status: r.status,
    priority: r.priority,
    doerId: r.doerId,
    doerName: r.doerName ?? null,
    doerDept: r.doerDept ?? null,
    initiatorId: r.initiatorId,
    initiatorName: r.initiatorName ?? null,
    createdAt: r.createdAt,
    dueAt: r.dueAt,
    ageDays: ageInDays(r.dueAt, nowDay),
    archived: r.archived,
    createdById: r.createdById,
    updatedAt: r.updatedAt,
    approvalStatus: r.approvalStatus,
    firstReadAt: r.firstReadAt,
    startedAt: r.startedAt ?? null,
    timerRunning: (r.openSessions ?? 0) > 0,
    completedAt: r.completedAt,
  }));

  return { rows, nextCursor };
}

/** Minimal card shape for the status Kanban board. */
export interface BoardTask {
  id: string;
  taskNo: number | null;
  title: string;
  subject: string | null;
  client: string | null;
  description: string | null;
  status: (typeof TASK_STATUSES)[number];
  priority: (typeof TASK_PRIORITIES)[number];
  doerId: string;
  doerName: string | null;
  archived: boolean;
  dueAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

/**
 * Tasks for the Kanban board, lightest possible payload. Optionally filtered by
 * the same `TaskListFilters` the list view uses (so the board can carry the
 * full filter bar). The `archived` flag is deliberately NOT applied — the board
 * renders archived tasks in a dedicated "Archived" column — but every other
 * dimension (date range, status, doer, priority, subject, client, department)
 * narrows the board.
 */
export async function listBoardTasks(filters?: TaskListFilters): Promise<BoardTask[]> {
  const keyParts = ["board-tasks", JSON.stringify(filters ?? {})];
  const rows = await unstable_cache(
    () => listBoardTasksUncached(filters),
    keyParts,
    { revalidate: 30, tags: [CACHE_TAGS.tasks] },
  )();
  // unstable_cache turns Date fields into ISO strings on a cache HIT; re-wrap
  // every Date in BoardTask so the return type stays Date-typed.
  return rows.map((r) => ({
    ...r,
    dueAt: new Date(r.dueAt as unknown as string | Date),
    updatedAt: new Date(r.updatedAt as unknown as string | Date),
    completedAt: r.completedAt
      ? new Date(r.completedAt as unknown as string | Date)
      : null,
  }));
}

async function listBoardTasksUncached(filters?: TaskListFilters): Promise<BoardTask[]> {
  const conditions = [];
  if (filters) {
    if (filters.startDate) conditions.push(gte(tasks.createdAt, filters.startDate));
    if (filters.endDate)
      conditions.push(lt(tasks.createdAt, new Date(filters.endDate.getTime() + MS_PER_DAY)));
    const statusCond = statusFilterCondition(filters.statuses);
    if (statusCond) conditions.push(statusCond);
    if (filters.doerIds.length > 0) conditions.push(inArray(tasks.doerId, filters.doerIds));
    if (filters.initiatorIds.length > 0)
      conditions.push(inArray(tasks.initiatorId, filters.initiatorIds));
    if (filters.priorities.length > 0) conditions.push(inArray(tasks.priority, filters.priorities));
    if (filters.subjects.length > 0) conditions.push(inArray(tasks.subject, filters.subjects));
    if (filters.clients.length > 0) conditions.push(inArray(tasks.client, filters.clients));
    if (filters.departments.length > 0) {
      const ids = await employeeIdsInDepartments(filters.departments);
      if (ids.length === 0) return [];
      conditions.push(inArray(tasks.doerId, ids));
    }
  }
  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      subject: tasks.subject,
      client: tasks.client,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      doerId: tasks.doerId,
      // Effective due (revised ?? original) so the board flags overdue from it.
      dueAt: effectiveDueAtSql(),
      updatedAt: tasks.updatedAt,
      archived: tasks.archived,
      completedAt: tasks.completedAt,
      doerName: employees.name,
    })
    .from(tasks)
    .leftJoin(employees, eq(tasks.doerId, employees.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tasks.createdAt))
    .limit(1000);
  return rows.map((r) => ({ ...r, doerName: r.doerName ?? null }));
}

/**
 * A user's pending tasks (as doer) for the day-wise agenda board, soonest
 * due first. Same light shape as the Kanban board.
 */
export async function listAgendaTasks(employeeId: string): Promise<BoardTask[]> {
  const keyParts = ["agenda-tasks", employeeId];
  const rows = await unstable_cache(
    () => listAgendaTasksUncached(employeeId),
    keyParts,
    { revalidate: 30, tags: [CACHE_TAGS.tasks] },
  )();
  // unstable_cache turns Date fields into ISO strings on a cache HIT; re-wrap
  // every Date in BoardTask so the return type stays Date-typed.
  return rows.map((r) => ({
    ...r,
    dueAt: new Date(r.dueAt as unknown as string | Date),
    updatedAt: new Date(r.updatedAt as unknown as string | Date),
    completedAt: r.completedAt
      ? new Date(r.completedAt as unknown as string | Date)
      : null,
  }));
}

async function listAgendaTasksUncached(employeeId: string): Promise<BoardTask[]> {
  const rows = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      subject: tasks.subject,
      client: tasks.client,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      doerId: tasks.doerId,
      // Effective due (revised ?? original) so the agenda sorts + flags by it.
      dueAt: effectiveDueAtSql(),
      updatedAt: tasks.updatedAt,
      archived: tasks.archived,
      completedAt: tasks.completedAt,
      doerName: employees.name,
    })
    .from(tasks)
    .leftJoin(employees, eq(tasks.doerId, employees.id))
    .where(
      and(
        eq(tasks.archived, false),
        eq(tasks.doerId, employeeId),
        inArray(tasks.status, [...PENDING_STATUSES]),
      ),
    )
    .orderBy(asc(effectiveDueAtSql()))
    .limit(1000);
  return rows.map((r) => ({ ...r, doerName: r.doerName ?? null }));
}

/**
 * Row shape for CSV export — superset of TaskListRow with `completedAt`,
 * `approvedAt`, `shortId`, `updatedAt`, and department included. Kept
 * separate from TaskListRow to avoid bloating the UI hot path.
 */
export interface TaskExportRow {
  id: string;
  shortId: string | null;
  subject: string | null;
  title: string;
  status: (typeof TASK_STATUSES)[number];
  priority: (typeof TASK_PRIORITIES)[number];
  doerName: string | null;
  initiatorName: string | null;
  department: string | null;
  createdAt: Date;
  dueAt: Date;
  completedAt: Date | null;
  approvedAt: Date | null;
  updatedAt: Date;
  archived: boolean;
  // Tier-3 (2026-05-20) additions — surfaced for XLSX/PDF exports.
  tags: string[] | null;
  approvalStatus: "approved" | "not_approved" | "cancelled" | "transferred" | null;
  revisedTargetDate: Date | null;
}

/**
 * Same filter semantics as `listTasks` but projects the columns the CSV
 * export needs (including completed_at + approved_at) and accepts a
 * larger row cap. Defaults to 10_000 rows — far above the dashboard's
 * 1k UI ceiling — to keep the response bounded.
 */
export async function listTasksForExport(
  filters: TaskListFilters,
  opts: { limit?: number } = {},
): Promise<TaskExportRow[]> {
  const limit = opts.limit ?? 10_000;
  const conditions = [eq(tasks.archived, filters.archived)];

  if (filters.startDate) conditions.push(gte(tasks.createdAt, filters.startDate));
  if (filters.endDate)
    conditions.push(lt(tasks.createdAt, new Date(filters.endDate.getTime() + MS_PER_DAY)));
  const statusCond = statusFilterCondition(filters.statuses);
  if (statusCond)                    conditions.push(statusCond);
  if (filters.doerIds.length > 0)    conditions.push(inArray(tasks.doerId, filters.doerIds));
  if (filters.initiatorIds.length > 0)
    conditions.push(inArray(tasks.initiatorId, filters.initiatorIds));
  if (filters.priorities.length > 0) conditions.push(inArray(tasks.priority, filters.priorities));
  if (filters.subjects.length > 0)   conditions.push(inArray(tasks.subject, filters.subjects));
  if (filters.clients.length > 0)    conditions.push(inArray(tasks.client, filters.clients));
  if (filters.overdue)               conditions.push(...overdueConditions());
  if (filters.unread)                conditions.push(...unreadConditions());
  if (filters.ageRange)              conditions.push(...ageRangeConditions(filters.ageRange));
  if (filters.taskId)                conditions.push(eq(tasks.id, filters.taskId));

  if (filters.departments.length > 0) {
    // Match tasks whose doer belongs to ANY selected department, via the
    // membership join table (not just their primary department).
    const ids = await employeeIdsInDepartments(filters.departments);
    if (ids.length === 0) return [];
    conditions.push(inArray(tasks.doerId, ids));
  }

  const doerEmp = alias(employees, "doer_emp");
  const initEmp = alias(employees, "init_emp");

  const rows = await db
    .select({
      id: tasks.id,
      shortId: tasks.shortId,
      title: tasks.title,
      subject: tasks.subject,
      status: tasks.status,
      priority: tasks.priority,
      createdAt: tasks.createdAt,
      // Effective due (revised ?? original) for the export's due column.
      dueAt: effectiveDueAtSql(),
      completedAt: tasks.completedAt,
      approvedAt: tasks.approvedAt,
      updatedAt: tasks.updatedAt,
      archived: tasks.archived,
      doerName: doerEmp.name,
      department: doerEmp.department,
      initiatorName: initEmp.name,
      tags: tasks.tags,
      approvalStatus: tasks.approvalStatus,
      revisedTargetDate: tasks.revisedTargetDate,
    })
    .from(tasks)
    .leftJoin(doerEmp, eq(tasks.doerId, doerEmp.id))
    .leftJoin(initEmp, eq(tasks.initiatorId, initEmp.id))
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    shortId: r.shortId ?? null,
    title: r.title,
    subject: r.subject,
    status: r.status,
    priority: r.priority,
    doerName: r.doerName ?? null,
    initiatorName: r.initiatorName ?? null,
    department: r.department ?? null,
    createdAt: r.createdAt,
    dueAt: r.dueAt,
    completedAt: r.completedAt,
    approvedAt: r.approvedAt,
    updatedAt: r.updatedAt,
    archived: r.archived,
    tags: r.tags ?? null,
    approvalStatus: r.approvalStatus,
    revisedTargetDate: r.revisedTargetDate,
  }));
}

/**
 * Distinct task subjects for the filter-bar dropdown. Backed by a full
 * `SELECT DISTINCT subject FROM tasks`, which grows linearly with the
 * tasks table — wrapping in `unstable_cache` so the hot path on /tasks
 * doesn't repeat the scan on every navigation. Invalidated by task
 * create/edit/delete via revalidateTag(CACHE_TAGS.subjects) and by
 * the subjects admin actions.
 */
export const listDistinctSubjects = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await db
      .selectDistinct({ subject: tasks.subject })
      .from(tasks);
    return rows
      .map((r) => r.subject)
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .sort();
  },
  ["list-distinct-subjects"],
  // Dropped `tasks` tag (Operation Butter P0): the distinct list only changes
  // when a NEW subject appears — `subjects` tag + 600s TTL cover that. Keeping
  // `tasks` re-armed a full DISTINCT scan on every task edit for no benefit.
  { tags: [CACHE_TAGS.subjects], revalidate: 600 },
);

/** Distinct non-empty `client` values across all tasks, for the filter bar's
 *  Clients picker. Mirrors listDistinctSubjects. */
export const listDistinctClients = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await db
      .selectDistinct({ client: tasks.client })
      .from(tasks);
    return rows
      .map((r) => r.client)
      .filter((c): c is string => typeof c === "string" && c.length > 0)
      .sort();
  },
  ["list-distinct-clients"],
  // Dropped `tasks` tag (Operation Butter P0) — mirror of listDistinctSubjects.
  { tags: [CACHE_TAGS.clients], revalidate: 600 },
);

export type TaskDetail = {
  id: string;
  taskNo: number | null;
  title: string;
  client: string | null;
  description: string | null;
  subject: string | null;
  notes: string | null;
  status: (typeof TASK_STATUSES)[number];
  priority: (typeof TASK_PRIORITIES)[number];
  createdAt: Date;
  dueAt: Date;
  completedAt: Date | null;
  archived: boolean;
  doerId: string;
  doerName: string | null;
  doerManagerId: string | null;
  initiatorId: string;
  initiatorName: string | null;
  createdById: string | null;
  creatorName: string | null;
  updatedAt: Date;
  // Tier-3 (2026-05-20) additions
  tags: string[] | null;
  approvalStatus: "approved" | "not_approved" | "cancelled" | "transferred" | null;
  // Two-stage approval (mig 0185): which level, if any, this task is signed off at.
  approvalLevel: "none" | "manager" | "admin";
  revisedTargetDate: Date | null;
  // Tier-4 (2026-05-20) — GCal-style scheduling
  startsAt: Date | null;
  endsAt: Date | null;
  allDay: boolean;
  recurrence: string | null;
  recurrenceRule: string | null;
  // Phase 5.2 — set on materialized recurrence children; the UI shows
  // a small "↻ recurring" badge with a click-through to the template.
  recurrenceParentId: string | null;
  recurrenceOccurrenceDate: string | null;
  projectNodeId: string | null;
  // Task-detail redesign (mig 0176)
  estimatedMinutes: number | null;
  doerAvatarUrl: string | null;
  creatorAvatarUrl: string | null;
  /* THE APPROVER — the doer's manager.
     This app has no `approver_id` column, and it does not need one: approval is
     hierarchical here (lib/auth/status-transitions.ts — a manager accepts their
     report's work, the founder gives final sign-off), so the approver IS
     `doer.manager`. Resolved by join rather than inferred in the UI, where two
     screens would eventually infer it differently. */
  doerManagerName: string | null;
  doerManagerAvatarUrl: string | null;
};

export async function getTaskById(taskId: string): Promise<TaskDetail | null> {
  const doerEmp      = alias(employees, "doer_emp");
  const initEmp      = alias(employees, "init_emp");
  const creatorEmp   = alias(employees, "creator_emp");
  const mgrEmp       = alias(employees, "mgr_emp");

  const [row] = await db
    .select({
      id: tasks.id,
      taskNo: tasks.taskNo,
      title: tasks.title,
      client: tasks.client,
      description: tasks.description,
      subject: tasks.subject,
      notes: tasks.notes,
      status: tasks.status,
      priority: tasks.priority,
      createdAt: tasks.createdAt,
      dueAt: tasks.dueAt,
      completedAt: tasks.completedAt,
      archived: tasks.archived,
      doerId: tasks.doerId,
      doerName: doerEmp.name,
      doerManagerId: doerEmp.managerId,
      initiatorId: tasks.initiatorId,
      initiatorName: initEmp.name,
      createdById: tasks.createdById,
      creatorName: creatorEmp.name,
      updatedAt: tasks.updatedAt,
      tags: tasks.tags,
      approvalStatus: tasks.approvalStatus,
      approvalLevel: tasks.approvalLevel,
      revisedTargetDate: tasks.revisedTargetDate,
      startsAt: tasks.startsAt,
      endsAt: tasks.endsAt,
      allDay: tasks.allDay,
      recurrence: tasks.recurrence,
      recurrenceRule: tasks.recurrenceRule,
      recurrenceParentId: tasks.recurrenceParentId,
      recurrenceOccurrenceDate: tasks.recurrenceOccurrenceDate,
      projectNodeId: tasks.projectNodeId,
      estimatedMinutes: tasks.estimatedMinutes,
      doerAvatarUrl: doerEmp.avatarUrl,
      creatorAvatarUrl: creatorEmp.avatarUrl,
      doerManagerName: mgrEmp.name,
      doerManagerAvatarUrl: mgrEmp.avatarUrl,
    })
    .from(tasks)
    .leftJoin(doerEmp,    eq(tasks.doerId,      doerEmp.id))
    .leftJoin(initEmp,    eq(tasks.initiatorId, initEmp.id))
    .leftJoin(creatorEmp, eq(tasks.createdById, creatorEmp.id))
    // LEFT: a doer at the top of a reporting line has no manager, and the task
    // still has to load — it simply has no approver to name.
    .leftJoin(mgrEmp,     eq(doerEmp.managerId,  mgrEmp.id))
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!row) return null;
  return row as TaskDetail;
}
