import "server-only";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { projectNodes, tasks, employees, taskTimeRollup } from "@/db/schema";
import type { TaskStatus, TaskPriority } from "@/db/enums";
import type { PlanKind } from "@/lib/project-plan/levels";

/**
 * Project Plan — the read side.
 *
 * Loads the whole active hierarchy PLUS, for every executable row, the ONE task
 * that row is (tasks.project_node_id). That task is the same record WMS lists
 * and the Google Calendar sync writes — this screen shows it, it does not copy
 * it. Two batched queries for the entire tree; no per-row lookups.
 */

/** The live WMS task behind an executable row, or null when not scheduled yet. */
export interface PlanTaskRef {
  id: string;
  status: TaskStatus;
  /** Eisenhower priority — the SAME column the WMS list and board sort by. */
  priority: TaskPriority;
  doerId: string;
  doerName: string | null;
  dueAt: Date;
  startsAt: Date | null;
  endsAt: Date | null;
  estimatedMinutes: number | null;
  /** Optimistic-lock token — setTaskStatus refuses a stale write without it. */
  updatedAt: Date;
  /** True once the Google Calendar sync has placed this task on a calendar. */
  onCalendar: boolean;
  /** The WMS list's own Client / Subject columns — an executable plan row IS a
   *  task, so it carries the same two labels rather than a plan-only copy. */
  client: string | null;
  subject: string | null;
  /** Initiator Notes. On an executable row the task IS the record, so the
   *  register reads them from here and never from a plan-side copy. */
  notes: string | null;
  /** When the task was raised — the WMS list's "Age" column counts from here. */
  createdAt: Date;
  /**
   * A work session is OPEN on this task right now — the Start/Stop control's
   * state. Read from `task_time_rollup.open_session_count`, the same projection
   * the WMS list reads, so the button says the same thing on both screens and
   * pressing it here writes the same session ledger.
   */
  timerRunning: boolean;
}

export interface PlanNode {
  id: string;
  name: string;
  /** Free text — the Project Description of brief §4. */
  description: string | null;
  /** Initiator Notes, on a CONTAINER row. An executable row keeps its own on
   *  the linked task (`PlanTaskRef.notes`) — one record, not two copies. */
  notes: string | null;
  kind: PlanKind;
  parentId: string | null;
  sortOrder: number;
  targetDate: Date | null;
  durationMinutes: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  ownerId: string | null;
  ownerName: string | null;
  createdById: string | null;
  /** Working-flow status on a container row (migration 0204). Null until set —
   *  and null for EVERY row when 0204 is unapplied, see `loadPlanMeta`. */
  status: string | null;
  /** Owner/admin verdict layered on top of `status` (migration 0204). */
  approvalStatus: string | null;
  /** Recorded partial completion 0–100; null = derive it from the work below. */
  progressPercent: number | null;
  /** The CONTAINER row's own priority (migration 0213). Null on an executable
   *  row, whose priority of record is its task's — one field, not two copies. */
  priority: TaskPriority | null;
  /** Reference links (migration 0214). Empty when there are none — and empty
   *  for EVERY row when the migrations are unapplied, see `loadPlanExtras`. */
  links: string[];
  /** The shared WMS/Calendar task record. Null on containers and unscheduled rows. */
  task: PlanTaskRef | null;
  children: PlanNode[];
}

/**
 * The three columns migration 0204 adds, loaded SEPARATELY and defensively.
 *
 * 0204 may not have been applied yet (the same situation migration 0142 left
 * the documents table in). Selecting an undefined column does not return null —
 * Postgres raises 42703 and the whole query fails, which would take the entire
 * Project screen down rather than just the new fields. So they are fetched in
 * their own round-trip whose failure is caught: no 0204, no status columns, and
 * the screen renders exactly as it did before with everything else intact.
 *
 * Delete this guard (and read the columns inline) once 0204 is applied
 * everywhere.
 */
interface PlanMeta {
  status: string | null;
  approvalStatus: string | null;
  progressPercent: number | null;
}

const EMPTY_META: PlanMeta = { status: null, approvalStatus: null, progressPercent: null };

async function loadPlanMeta(): Promise<Map<string, PlanMeta>> {
  const out = new Map<string, PlanMeta>();
  try {
    const rows = (await db.execute(sql`
      SELECT id, status, approval_status, progress_percent
      FROM project_nodes
      WHERE is_archived = false
    `)) as unknown as Array<{
      id: string;
      status: string | null;
      approval_status: string | null;
      progress_percent: number | null;
    }>;
    for (const r of rows) {
      out.set(r.id, {
        status: r.status ?? null,
        approvalStatus: r.approval_status ?? null,
        // node-postgres hands back integers as numbers, but a driver that
        // returns text must not turn 0 into NaN or "0" into a truthy string.
        progressPercent:
          r.progress_percent == null ? null : Number(r.progress_percent),
      });
    }
  } catch {
    // 42703 undefined_column — 0204 is not applied. Every row falls back to
    // EMPTY_META below and the rest of the screen is unaffected.
  }
  return out;
}

/**
 * The columns migrations 0213 + 0214 add, loaded with the same defence as
 * `loadPlanMeta` above and for the same reason: a database without them must
 * lose these fields and nothing else.
 *
 * ONE round-trip for both because they are written as one group too — see the
 * insert in `createPlanContainer`, which drops the whole set if either
 * migration is missing. Splitting the read would let the screen show half a
 * group the writer never writes half of.
 *
 * Delete this guard (and read the columns inline) once both are applied
 * everywhere.
 */
interface PlanExtras {
  /** The CONTAINER row's own priority. An executable row's lives on its task. */
  priority: TaskPriority | null;
  links: string[];
}

const EMPTY_EXTRAS: PlanExtras = { priority: null, links: [] };

async function loadPlanExtras(): Promise<Map<string, PlanExtras>> {
  const out = new Map<string, PlanExtras>();
  try {
    const rows = (await db.execute(sql`
      SELECT id, priority, links
      FROM project_nodes
      WHERE is_archived = false
    `)) as unknown as Array<{
      id: string;
      priority: string | null;
      links: string[] | null;
    }>;
    for (const r of rows) {
      out.set(r.id, {
        priority: (r.priority as TaskPriority | null) ?? null,
        // A text[] arrives as a JS array; guard anyway so a driver that hands
        // back a string can't put a bare character per "link" on screen.
        links: Array.isArray(r.links) ? r.links : [],
      });
    }
  } catch {
    // 42703 undefined_column — 0213/0214 are not applied. Every row falls back
    // to EMPTY_EXTRAS and the rest of the screen is unaffected.
  }
  return out;
}

/**
 * The full active tree, children ordered by (sort_order, name) at every level.
 *
 * Ordering is applied ONCE in SQL and then preserved as rows are threaded into
 * the tree, so the REF numbering the client derives from sibling position is
 * stable across reloads.
 */
export async function listPlanTree(): Promise<PlanNode[]> {
  const owner = alias(employees, "plan_owner");
  const doer = alias(employees, "plan_doer");

  const [nodeRows, taskRows, metaById, extrasById] = await Promise.all([
    db
      .select({
        id: projectNodes.id,
        name: projectNodes.name,
        description: projectNodes.description,
        notes: projectNodes.notes,
        kind: projectNodes.kind,
        parentId: projectNodes.parentId,
        sortOrder: projectNodes.sortOrder,
        targetDate: projectNodes.targetDate,
        durationMinutes: projectNodes.durationMinutes,
        startsAt: projectNodes.startsAt,
        endsAt: projectNodes.endsAt,
        ownerId: projectNodes.ownerId,
        ownerName: owner.name,
        createdById: projectNodes.createdById,
      })
      .from(projectNodes)
      .leftJoin(owner, eq(owner.id, projectNodes.ownerId))
      .where(eq(projectNodes.isArchived, false))
      .orderBy(asc(projectNodes.sortOrder), asc(projectNodes.name)),

    // Every non-archived task that belongs to a plan row. Ordered oldest-first
    // so that if a node somehow carries more than one task (the older /projects
    // screen lets any task link to any node), the FIRST one is deterministically
    // the row's task and the rest are left alone rather than fighting over it.
    db
      .select({
        id: tasks.id,
        projectNodeId: tasks.projectNodeId,
        status: tasks.status,
        priority: tasks.priority,
        doerId: tasks.doerId,
        doerName: doer.name,
        dueAt: tasks.dueAt,
        startsAt: tasks.startsAt,
        endsAt: tasks.endsAt,
        estimatedMinutes: tasks.estimatedMinutes,
        updatedAt: tasks.updatedAt,
        googleEventId: tasks.googleEventId,
        client: tasks.client,
        subject: tasks.subject,
        notes: tasks.notes,
        createdAt: tasks.createdAt,
        // Left-joined, so a task that has never been timed simply has no
        // rollup row and reads as "not running" rather than dropping out.
        openSessions: taskTimeRollup.openSessionCount,
      })
      .from(tasks)
      .leftJoin(doer, eq(doer.id, tasks.doerId))
      .leftJoin(taskTimeRollup, eq(taskTimeRollup.taskId, tasks.id))
      .where(and(isNotNull(tasks.projectNodeId), eq(tasks.archived, false)))
      .orderBy(asc(tasks.createdAt)),

    loadPlanMeta(),
    loadPlanExtras(),
  ]);

  const taskByNode = new Map<string, PlanTaskRef>();
  for (const t of taskRows) {
    if (!t.projectNodeId || taskByNode.has(t.projectNodeId)) continue;
    taskByNode.set(t.projectNodeId, {
      id: t.id,
      status: t.status,
      priority: t.priority,
      doerId: t.doerId,
      doerName: t.doerName ?? null,
      dueAt: t.dueAt,
      startsAt: t.startsAt,
      endsAt: t.endsAt,
      estimatedMinutes: t.estimatedMinutes,
      updatedAt: t.updatedAt,
      onCalendar: Boolean(t.googleEventId),
      timerRunning: (t.openSessions ?? 0) > 0,
      client: t.client ?? null,
      subject: t.subject ?? null,
      notes: t.notes ?? null,
      createdAt: t.createdAt,
    });
  }

  const byId = new Map<string, PlanNode>();
  for (const r of nodeRows) {
    const meta = metaById.get(r.id) ?? EMPTY_META;
    const extras = extrasById.get(r.id) ?? EMPTY_EXTRAS;
    byId.set(r.id, {
      ...r,
      kind: r.kind as PlanKind,
      ownerName: r.ownerName ?? null,
      status: meta.status,
      approvalStatus: meta.approvalStatus,
      progressPercent: meta.progressPercent,
      priority: extras.priority,
      links: extras.links,
      task: taskByNode.get(r.id) ?? null,
      children: [],
    });
  }

  const roots: PlanNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else if (!node.parentId) roots.push(node);
    // A node whose parent is archived is intentionally dropped: the parent is
    // gone from the board, so showing its orphaned children as extra roots
    // would put an Action at the top level next to the Projects.
  }
  return roots;
}

/**
 * How many attachments each plan row has, for the whole plan, in ONE query.
 *
 * Counts only — never the files themselves. Minting a signed URL costs a
 * round-trip per file, so the registers show a number and the popover fetches
 * the actual links on demand (listPlanAttachments). A page of 60 milestones
 * therefore costs one extra query, not sixty.
 *
 * Defensive in the same way `loadPlanMeta` is: migration 0212 may not be
 * applied yet, and a missing table must cost the Attachments column, not the
 * whole screen.
 */
export async function attachmentCounts(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try {
    const rows = (await db.execute(sql`
      SELECT node_id, COUNT(*)::int AS n
      FROM project_node_attachments
      GROUP BY node_id
    `)) as unknown as Array<{ node_id: string; n: number }>;
    for (const r of rows) out.set(r.node_id, Number(r.n));
  } catch {
    // 42P01 undefined_table — 0212 is not applied. Every row reports 0 files
    // and the rest of the register is unaffected.
  }
  return out;
}

/**
 * Every descendant id of `rootId`, including itself — the delete/duplicate
 * blast radius. Computed with ONE recursive CTE rather than repeated parent
 * lookups, so a deep branch costs a single round-trip.
 */
export async function descendantIds(rootId: string): Promise<string[]> {
  // drizzle has no builder for WITH RECURSIVE — the sql template still
  // parameterises `rootId`, so this is not string interpolation.
  const rows = (await db.execute(sql`
    WITH RECURSIVE sub AS (
      SELECT id FROM project_nodes WHERE id = ${rootId}
      UNION ALL
      SELECT n.id FROM project_nodes n JOIN sub ON n.parent_id = sub.id
    )
    SELECT id FROM sub
  `)) as unknown as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

/** The tasks linked to any of these nodes — used to keep deletes in step. */
export async function tasksForNodes(nodeIds: string[]): Promise<Array<{ id: string; nodeId: string }>> {
  if (nodeIds.length === 0) return [];
  const rows = await db
    .select({ id: tasks.id, nodeId: tasks.projectNodeId })
    .from(tasks)
    .where(and(inArray(tasks.projectNodeId, nodeIds), eq(tasks.archived, false)));
  return rows.flatMap((r) => (r.nodeId ? [{ id: r.id, nodeId: r.nodeId }] : []));
}
