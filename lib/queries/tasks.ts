import { and, eq, gte, inArray, lt, or, asc, desc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { unstable_cache } from "next/cache";
import { db, employees, tasks } from "@/lib/db";
import { TASK_STATUSES, TASK_PRIORITIES, PENDING_STATUSES } from "@/db/enums";
import type { TaskStatus, ApprovalStatus } from "@/db/enums";
import { employeeIdsInDepartments } from "@/lib/queries/departments";
import { CACHE_TAGS } from "@/lib/cache-tags";
import type { TaskListFilters, TaskListRow } from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// A task's "effective" status spans two columns: the working `status` and the
// admin `approval_status` verdict. The dashboard counts treat a task as e.g.
// Not Approved when EITHER column says so (lib/queries/dashboard.ts), so the
// list filter must match the same way — otherwise the "Not Approved" KPI
// filtered on `status` alone and showed almost nothing (sir's changes #14).
const APPROVAL_VERDICTS = new Set<TaskStatus>(["approved", "not_approved"]);

function statusFilterCondition(statuses: TaskStatus[]) {
  if (statuses.length === 0) return undefined;
  const byStatus = inArray(tasks.status, statuses);
  const verdicts = statuses.filter((s) => APPROVAL_VERDICTS.has(s));
  if (verdicts.length === 0) return byStatus;
  return or(byStatus, inArray(tasks.approvalStatus, verdicts as ApprovalStatus[]));
}

export async function listTasks(filters: TaskListFilters): Promise<TaskListRow[]> {
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
  if (filters.taskId)                conditions.push(eq(tasks.id, filters.taskId));

  if (filters.departments.length > 0) {
    // Match tasks whose doer belongs to ANY selected department, via the
    // membership join table (not just their primary department).
    const ids = await employeeIdsInDepartments(filters.departments);
    if (ids.length === 0) return [];
    conditions.push(inArray(tasks.doerId, ids));
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
      dueAt: tasks.dueAt,
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
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .leftJoin(doerEmp, eq(tasks.doerId, doerEmp.id))
    .leftJoin(initEmp, eq(tasks.initiatorId, initEmp.id))
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt))
    .limit(1000);

  const now = Date.now();
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
    ageDays: Math.floor((now - r.createdAt.getTime()) / MS_PER_DAY),
    archived: r.archived,
    createdById: r.createdById,
    updatedAt: r.updatedAt,
    approvalStatus: r.approvalStatus,
    firstReadAt: r.firstReadAt,
    completedAt: r.completedAt,
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

export async function listTasksPage(
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
      dueAt: tasks.dueAt,
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
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .leftJoin(doerEmp, eq(tasks.doerId, doerEmp.id))
    .leftJoin(initEmp, eq(tasks.initiatorId, initEmp.id))
    .where(and(...conditions))
    .orderBy(desc(tasks.createdAt), desc(tasks.id))
    .limit(pageSize + 1);

  const hasMore = fetched.length > pageSize;
  const pageRows = hasMore ? fetched.slice(0, pageSize) : fetched;
  const last = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last) : null;

  const now = Date.now();
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
    ageDays: Math.floor((now - r.createdAt.getTime()) / MS_PER_DAY),
    archived: r.archived,
    createdById: r.createdById,
    updatedAt: r.updatedAt,
    approvalStatus: r.approvalStatus,
    firstReadAt: r.firstReadAt,
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
      dueAt: tasks.dueAt,
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
      dueAt: tasks.dueAt,
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
    .orderBy(asc(tasks.dueAt))
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
      dueAt: tasks.dueAt,
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
  { tags: [CACHE_TAGS.subjects, CACHE_TAGS.tasks], revalidate: 600 },
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
  { tags: [CACHE_TAGS.clients, CACHE_TAGS.tasks], revalidate: 600 },
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
};

export async function getTaskById(taskId: string): Promise<TaskDetail | null> {
  const doerEmp      = alias(employees, "doer_emp");
  const initEmp      = alias(employees, "init_emp");
  const creatorEmp   = alias(employees, "creator_emp");

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
      revisedTargetDate: tasks.revisedTargetDate,
      startsAt: tasks.startsAt,
      endsAt: tasks.endsAt,
      allDay: tasks.allDay,
      recurrence: tasks.recurrence,
      recurrenceRule: tasks.recurrenceRule,
      recurrenceParentId: tasks.recurrenceParentId,
      recurrenceOccurrenceDate: tasks.recurrenceOccurrenceDate,
      projectNodeId: tasks.projectNodeId,
    })
    .from(tasks)
    .leftJoin(doerEmp,    eq(tasks.doerId,      doerEmp.id))
    .leftJoin(initEmp,    eq(tasks.initiatorId, initEmp.id))
    .leftJoin(creatorEmp, eq(tasks.createdById, creatorEmp.id))
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!row) return null;
  return row as TaskDetail;
}
