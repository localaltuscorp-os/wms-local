import "server-only";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { projectNodes, tasks, employees, taskTimeRollup } from "@/db/schema";
import type { TaskStatus, TaskPriority } from "@/db/enums";
import { type PlanKind, toLetters } from "@/lib/project-plan/levels";

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
  /** The client, HELD on the Project and null on every row that merely inherits
   *  it. `clientForNode` is the walk that answers "which client is this row
   *  for"; this field only says whether the row is the one that decides. */
  clientName: string | null;
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
  /** The client, set on the PROJECT and inherited by everything below it. Null
   *  on the rows that inherit rather than hold it — resolve those with
   *  `clientForNode`, which walks up to the one that does. */
  clientName: string | null;
}

const EMPTY_EXTRAS: PlanExtras = { priority: null, links: [], clientName: null };

async function loadPlanExtras(): Promise<Map<string, PlanExtras>> {
  const out = new Map<string, PlanExtras>();
  try {
    const rows = (await db.execute(sql`
      SELECT id, priority, links, client_name
      FROM project_nodes
      WHERE is_archived = false
    `)) as unknown as Array<{
      id: string;
      priority: string | null;
      links: string[] | null;
      client_name: string | null;
    }>;
    for (const r of rows) {
      out.set(r.id, {
        priority: (r.priority as TaskPriority | null) ?? null,
        // A text[] arrives as a JS array; guard anyway so a driver that hands
        // back a string can't put a bare character per "link" on screen.
        links: Array.isArray(r.links) ? r.links : [],
        clientName: r.client_name?.trim() ? r.client_name : null,
      });
    }
  } catch {
    // 42703 undefined_column — 0213/0214 are not applied. Every row falls back
    // to EMPTY_EXTRAS and the rest of the screen is unaffected.
  }
  return out;
}

/**
 * `task_time_rollup` is a derived timer projection introduced in migration
 * 0175. A database brought up only through the older project-plan migrations
 * still has perfectly usable projects and tasks, but does not have this table.
 *
 * Do not let that optional timer badge take down the whole Project module. The
 * fallback is deliberately narrow: only a missing rollup table/column retries
 * without the join. Connectivity, permissions and every other query failure
 * continue to surface normally instead of being mistaken for "not running".
 */
function missingTimeRollupProjection(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const message = current instanceof Error ? current.message : String(current);
    if (
      /task_time_rollup|open_session_count/i.test(message) &&
      /(does not exist|undefined table|undefined column|42P01|42703)/i.test(message)
    ) {
      return true;
    }
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { cause?: unknown }).cause
        : null;
  }
  return false;
}

async function loadPlanTaskRows() {
  const doer = alias(employees, "plan_doer");
  const fields = {
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
  };
  const activePlanTasks = and(isNotNull(tasks.projectNodeId), eq(tasks.archived, false));

  try {
    return await db
      .select({
        ...fields,
        // Left-joined, so a task that has never been timed simply has no
        // rollup row and reads as "not running" rather than dropping out.
        openSessions: taskTimeRollup.openSessionCount,
      })
      .from(tasks)
      .leftJoin(doer, eq(doer.id, tasks.doerId))
      .leftJoin(taskTimeRollup, eq(taskTimeRollup.taskId, tasks.id))
      .where(activePlanTasks)
      .orderBy(asc(tasks.createdAt));
  } catch (err) {
    if (!missingTimeRollupProjection(err)) throw err;

    // Migration 0175 is absent. Projects remain fully usable; only the live
    // timer indicator is unavailable until the migration is applied.
    return db
      .select({ ...fields, openSessions: sql<number>`0` })
      .from(tasks)
      .leftJoin(doer, eq(doer.id, tasks.doerId))
      .where(activePlanTasks)
      .orderBy(asc(tasks.createdAt));
  }
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
    loadPlanTaskRows(),

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
      clientName: extras.clientName,
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

/**
 * THE CLIENT A ROW BELONGS TO — walked up to the Project that owns it.
 *
 * A client is set once, on the Project (see the New item dialog), and every row
 * beneath it inherits that one answer. This is the walk that resolves it, and
 * it is deliberately a walk rather than a copied column on each row: a copy
 * would let a milestone disagree with its own project the moment someone
 * corrected the project's client, and a plan whose rows name two clients cannot
 * be filed against either.
 *
 * Returns the NEAREST ancestor's client that is actually set — so a project
 * created before clients existed (they are null on every pre-0226 row) does not
 * blank out a client someone later put on a milestone by hand.
 *
 * Null when nothing in the chain has one, which is a real answer: an unfiled
 * plan. The task sync writes that null through rather than inventing a value.
 */
export async function clientForNode(nodeId: string): Promise<string | null> {
  const rows = (await db.execute(sql`
    WITH RECURSIVE up AS (
      SELECT id, parent_id, client_name, 0 AS depth
        FROM project_nodes WHERE id = ${nodeId}
      UNION ALL
      SELECT n.id, n.parent_id, n.client_name, up.depth + 1
        FROM project_nodes n JOIN up ON up.parent_id = n.id
    )
    SELECT client_name FROM up
     WHERE client_name IS NOT NULL AND btrim(client_name) <> ''
     ORDER BY depth ASC
     LIMIT 1
  `)) as unknown as Array<{ client_name: string | null }>;
  return rows[0]?.client_name ?? null;
}

/** One row in the task form's cascading Project → Milestone → Result → Action
 *  picker. Flat on purpose: the cascade is four filters over one list, which is
 *  one query instead of four round-trips as the user works down the chain. */
export interface PlanPickerNode {
  id: string;
  kind: PlanKind;
  parentId: string | null;
  name: string;
}

/**
 * Every live plan row a task can be filed under, down to Action.
 *
 * SUB-ACTIONS AND BELOW ARE EXCLUDED. The picker's deepest choice is an Action,
 * because choosing one means "make this task a SUB-action of it" — there is
 * nothing to pick below that, and offering a sub-action would imply a level the
 * hierarchy does not have room for under it.
 */
export async function listPlanPickerNodes(): Promise<PlanPickerNode[]> {
  const rows = await db
    .select({
      id: projectNodes.id,
      kind: projectNodes.kind,
      parentId: projectNodes.parentId,
      name: projectNodes.name,
    })
    .from(projectNodes)
    .where(
      and(
        eq(projectNodes.isArchived, false),
        inArray(projectNodes.kind, ["project", "milestone", "result", "action"]),
      ),
    )
    .orderBy(asc(projectNodes.sortOrder), asc(projectNodes.name));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as PlanKind,
    parentId: r.parentId,
    name: r.name,
  }));
}

/**
 * WHERE A ROW SITS — the project, milestone and result above it, each named and
 * numbered.
 *
 * For the detail views. A task or an action tells you what it is; it does not
 * tell you which project it belongs to, and "which project is this, and which
 * milestone and result under it?" is the first question anyone asks of a row
 * they opened from a task list.
 *
 * THE RESULT JOINED THE PROJECT AND MILESTONE (Manan, 2026-09-15: "in Detailed
 * View of any Task or Action I should see the names of project, milestone with
 * milestone no and results with results no"). It was project + milestone only,
 * which named the top and the middle of the chain and left out the level the
 * work is actually counted against.
 *
 * EVERY NUMBER IS DERIVED, NOT STORED — the same rule the whole module follows
 * for refs (`refFor`): each is the 1-based position among its siblings, in the
 * plan's own order. Storing them would give a row a number that disagrees with
 * the table the moment anything is reordered, so this recomputes them from the
 * same ordering the board sorts by. The result uses spreadsheet LETTERS (RA,
 * RB … RZ, RAA) because that is what the board labels it.
 *
 * ONE recursive walk up plus one sibling query per named level — three small
 * indexed reads, not a read per ancestor.
 *
 * Null for a task that is not filed into a plan, which is most of them.
 */
export interface PlanBreadcrumb {
  projectId: string;
  projectName: string;
  /** "P2" — the project's own ref, numbered among all projects. */
  projectRef: string;
  milestoneId: string | null;
  milestoneName: string | null;
  /** "M3". Null when the row sits directly under its project. */
  milestoneRef: string | null;
  resultId: string | null;
  resultName: string | null;
  /** "RB" — spreadsheet letters, as the plan board labels results. Null when
   *  the row sits above the result level or was filed without one. */
  resultRef: string | null;
}

export async function planBreadcrumbForNode(
  nodeId: string,
): Promise<PlanBreadcrumb | null> {
  // Walk up to the root, keeping every step — the project, milestone and result
  // are three known kinds on that chain rather than three more queries.
  const chain = (await db.execute(sql`
    WITH RECURSIVE up AS (
      SELECT id, parent_id, kind, name, 0 AS depth
        FROM project_nodes WHERE id = ${nodeId}
      UNION ALL
      SELECT n.id, n.parent_id, n.kind, n.name, up.depth + 1
        FROM project_nodes n JOIN up ON up.parent_id = n.id
    )
    SELECT id, kind, name FROM up ORDER BY depth DESC
  `)) as unknown as Array<{ id: string; kind: string; name: string }>;

  const project = chain.find((r) => r.kind === "project");
  if (!project) return null;
  const milestone = chain.find((r) => r.kind === "milestone") ?? null;
  const result = chain.find((r) => r.kind === "result") ?? null;

  // The ordinals, each read from the same ordering the board renders in.
  const projects = (await db.execute(sql`
    SELECT id FROM project_nodes
     WHERE parent_id IS NULL AND kind = 'project' AND is_archived = false
     ORDER BY sort_order ASC, name ASC
  `)) as unknown as Array<{ id: string }>;
  const projectIndex = projects.findIndex((p) => p.id === project.id);

  let milestoneRef: string | null = null;
  if (milestone) {
    const i = await ordinalAmongSiblings(project.id, "milestone", milestone.id);
    milestoneRef = i === null ? null : `M${i}`;
  }

  let resultRef: string | null = null;
  if (result && milestone) {
    // Numbered among its OWN milestone's results — the parent is the milestone,
    // never the project, so RA under M1 and RA under M2 are different rows and
    // both are correct.
    const i = await ordinalAmongSiblings(milestone.id, "result", result.id);
    resultRef = i === null ? null : `R${toLetters(i)}`;
  }

  return {
    projectId: project.id,
    projectName: project.name,
    projectRef: projectIndex === -1 ? "P?" : `P${projectIndex + 1}`,
    milestoneId: milestone?.id ?? null,
    milestoneName: milestone?.name ?? null,
    milestoneRef,
    resultId: result?.id ?? null,
    resultName: result?.name ?? null,
    resultRef,
  };
}

/**
 * The 1-based position of `childId` among the `kind` children of `parentId`, or
 * null when it is not among them.
 *
 * An archived-out-from-under row is not in the list; it keeps its name and
 * loses only its number, rather than claiming someone else's.
 */
async function ordinalAmongSiblings(
  parentId: string,
  kind: string,
  childId: string,
): Promise<number | null> {
  const siblings = (await db.execute(sql`
    SELECT id FROM project_nodes
     WHERE parent_id = ${parentId} AND kind = ${kind} AND is_archived = false
     ORDER BY sort_order ASC, name ASC
  `)) as unknown as Array<{ id: string }>;
  const i = siblings.findIndex((s) => s.id === childId);
  return i === -1 ? null : i + 1;
}
