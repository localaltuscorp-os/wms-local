"use server";

import { revalidatePath, updateTag } from "next/cache";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { projectNodes, tasks, employees } from "@/db/schema";
import { TASK_PRIORITIES } from "@/db/enums";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { afterResponse } from "@/lib/after";
import { createTasksCore } from "@/lib/tasks/create-task";
import { reconcileTaskEvent } from "@/lib/google/sync";
import { descendantIds } from "@/lib/queries/project-plan";
import { MAX_BULK_ROWS } from "@/lib/project-plan/bulk";
import {
  PLAN_KINDS,
  PARENT_KIND,
  KIND_LABEL,
  isExecutable,
  hasTask,
  type PlanKind,
} from "@/lib/project-plan/levels";
import {
  canSetPlanStatus,
  isRestrictedStatus,
  isWorkingStatus,
  type PlanRestrictedStatus,
} from "@/lib/project-plan/status";
import { actorFor } from "@/lib/project-plan/authz";
import { setTaskStatus } from "@/app/(app)/tasks/actions";

/**
 * Project Plan — the write side.
 *
 * THE CENTRAL RULE (brief §27/§54): an Action / Sub-Action / Sub-Sub-Action is
 * ONE record shared by three surfaces. The hierarchy row lives in
 * `project_nodes` (structure, ordering, plan fields); the work itself is a
 * single `tasks` row pointing back via `tasks.project_node_id`, and THAT is
 * what WMS lists and what the Google Calendar sync writes. Nothing here ever
 * creates a second copy of a task — `syncNodeTask` below is the only path that
 * touches the task, and it either creates the one task or updates it in place.
 */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const PATH = "/project-plan";

/** Both project surfaces read the same rows, so both caches drop together. */
function revalidatePlanSurfaces() {
  revalidatePath(PATH);
  revalidatePath("/projects");
  updateTag(CACHE_TAGS.projectNodes);
}

// ── Permissions ─────────────────────────────────────────────────────────────
//
// There is exactly ONE permission rule in this module, and it is not here: it
// is `canSetPlanStatus` in lib/project-plan/status.ts, applied by
// `setPlanNodeStatus` below. The working six statuses may be set by the doer,
// their supervisor or the project owner; the five approval verdicts (Not
// Approved / Approved / On Hold / Cancelled / Archived) only by the project
// owner or an admin.
//
// Every other action in this file — create, update, move, duplicate, delete —
// is open to any signed-in employee by explicit product decision. The former
// "structure owner" test (admin or ≥1 report) and the "you can only change rows
// you created" test have both been removed; do not reintroduce one here without
// that decision changing.

/**
 * Load a node for mutation.
 *
 * Existence and a well-formed id ONLY. There is deliberately no ownership test:
 * the plan is a shared working document, and STATUS is the single guarded
 * action in this module (see `canSetPlanStatus` — the working six may be set by
 * the doer, their supervisor or the project owner; the five approval verdicts
 * only by the project owner or an admin). Everything else — creating,
 * renaming, re-dating, moving, duplicating, deleting, attaching files — is open
 * to any signed-in employee, by explicit product decision.
 */
async function loadNode(
  id: string,
): Promise<{ ok: true; node: typeof projectNodes.$inferSelect } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  const node = await db.query.projectNodes.findFirst({ where: eq(projectNodes.id, id) });
  if (!node) return fail("Row not found.");
  return { ok: true, node };
}

// ── The task bridge ─────────────────────────────────────────────────────────

/**
 * Bring the linked WMS task in step with its hierarchy row.
 *
 * Creation is LAZY: a row becomes a real task the moment it has both an owner
 * and a target date — the two things `tasks` cannot be inserted without
 * (doer_id and due_at are NOT NULL). Until then the row is plan-only and shows
 * as "Not scheduled". This is what keeps WMS and everyone's calendar free of
 * half-typed placeholder rows.
 *
 * Never throws: a calendar or task hiccup must not roll back the user's edit to
 * the hierarchy, which is already committed by the time this runs.
 */
async function syncNodeTask(nodeId: string, actor: { id: string; name: string }): Promise<void> {
  try {
    const node = await db.query.projectNodes.findFirst({ where: eq(projectNodes.id, nodeId) });
    if (!node || node.isArchived) return;
    // Result now gets a task too (see TASK_KINDS) — Project and Milestone
    // still never do, and neither does any row whose level lost its task.
    if (!hasTask(node.kind as PlanKind)) return;

    const [existing] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.projectNodeId, nodeId), eq(tasks.archived, false)))
      .orderBy(asc(tasks.createdAt))
      .limit(1);

    const owner = node.ownerId;
    const due = node.targetDate;

    // Not schedulable yet — leave any existing task exactly as it is rather
    // than tearing it down because a field was momentarily cleared.
    if (!owner || !due) return;

    if (existing) {
      await db
        .update(tasks)
        .set({
          title: node.name,
          doerId: owner,
          dueAt: due,
          startsAt: node.startsAt ?? null,
          endsAt: node.endsAt ?? null,
          estimatedMinutes: node.durationMinutes ?? null,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, existing.id));
      afterResponse(() => reconcileTaskEvent(existing.id));
      return;
    }

    // First time this row is schedulable → create THE task through the shared
    // core, so short-id, the audit event, notifications and calendar sync are
    // byte-identical to a task created anywhere else in the app.
    await createTasksCore(actor, {
      title: node.name,
      doerId: owner,
      initiatorId: actor.id,
      priority: "imp_not_urgent",
      dueAt: due.toISOString(),
      startsAt: node.startsAt ? node.startsAt.toISOString() : null,
      endsAt: node.endsAt ? node.endsAt.toISOString() : null,
      projectNodeId: node.id,
    });
  } catch (err) {
    console.error("[project-plan] task sync failed for node", nodeId, err);
  }
}

// ── Create ──────────────────────────────────────────────────────────────────

const KindSchema = z.enum(PLAN_KINDS);

const CreateSchema = z.object({
  kind: KindSchema,
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, "A name is required.").max(160).optional(),
});

export async function createPlanNode(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { kind, parentId = null } = parsed.data;
  const name = parsed.data.name ?? "";

  const needsParent = PARENT_KIND[kind];
  if (needsParent && !parentId) return fail(`A ${kind} needs a parent ${needsParent}.`);
  if (!needsParent && parentId) return fail("A project can't have a parent.");

  if (parentId) {
    const parent = await db.query.projectNodes.findFirst({ where: eq(projectNodes.id, parentId) });
    if (!parent) return fail("Parent not found.");
    if (parent.kind !== needsParent) return fail(`A ${kind} must sit under a ${needsParent}.`);
  }

  try {
    // Append: one past the highest sibling. Gaps of 10 leave room for a future
    // drag-drop to slot a row between two others without renumbering the list.
    const [maxRow] = (await db
      .select({ next: sql<number>`COALESCE(MAX(${projectNodes.sortOrder}), 0) + 10` })
      .from(projectNodes)
      .where(
        parentId
          ? eq(projectNodes.parentId, parentId)
          : sql`${projectNodes.parentId} IS NULL AND ${projectNodes.kind} = 'project'`,
      )) as Array<{ next: number }>;

    // EVERY EXECUTABLE ROW BECOMES A TASK, including one added by the bare "+"
    // on a row, which collects nothing. `tasks.doer_id` and `tasks.due_at` are
    // both NOT NULL, so a task cannot exist without the two — and this path has
    // neither. Rather than leave the row out of WMS until somebody fills them
    // in, it opens with the two safe answers: the person adding the row, and
    // today. Both are ordinary editable cells the moment the row lands, so a
    // wrong guess costs one click and the work is never invisible.
    //
    // Containers get neither: a project has no doer and no deadline of its own,
    // and `syncNodeTask` refuses to build a task for one anyway.
    const seedTask = hasTask(kind);
    const [row] = await db
      .insert(projectNodes)
      .values({
        name: name || defaultName(kind),
        kind,
        parentId,
        sortOrder: maxRow?.next ?? 10,
        createdById: me.id,
        ownerId: seedTask ? me.id : null,
        targetDate: seedTask ? startOfToday() : null,
      })
      .returning({ id: projectNodes.id });
    if (!row) return fail("Insert returned no row.");
    // After the insert, and never in a way that can fail the create: the plan
    // row is saved either way, and `syncNodeTask` swallows its own errors.
    if (seedTask) await syncNodeTask(row.id, { id: me.id, name: me.name });
    revalidatePlanSurfaces();
    return { ok: true, id: row.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Create the plan row that a brand-new WMS task will hang off.
 *
 * Used ONLY by the "New Item" dialog's task path, as `NewTaskForm.beforeSubmit`:
 * the row has to exist before `createTask` can point at it, and doing it here —
 * inside the same submit — is what keeps one dialog for one thought.
 *
 * Deliberately does NOT call `syncNodeTask`. The row is created already carrying
 * an owner and a target date, so the lazy sync WOULD build a task for it — and
 * the caller is about to create that task itself with the full set of fields
 * (subject, client, priority, description, notes, tags, recurrence). Letting
 * both run is how you get two tasks for one row.
 */
/**
 * Reference links (migration 0214). URLs only — an `href` the register renders
 * must not be able to carry `javascript:`, so the scheme is checked here rather
 * than trusted from the browser that typed it.
 */
const LinksSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .refine((u) => /^https?:\/\//i.test(u), "Links must start with http:// or https://"),
  )
  .max(50)
  .nullable()
  .optional();

const CreateForTaskSchema = z.object({
  kind: KindSchema,
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, "A name is required.").max(160),
  ownerId: z.string().uuid(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  durationMinutes: z.number().int().min(0).max(60 * 24 * 30).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  links: LinksSchema,
});

export async function createPlanNodeForTask(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateForTaskSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { kind, parentId = null, name, ownerId, targetDate } = parsed.data;

  // Only the task levels come here — Result and the three executables. A
  // project or a milestone reaching this path would silently become a task
  // nobody asked for.
  if (!hasTask(kind)) {
    return fail(`A ${KIND_LABEL[kind].toLowerCase()} isn't a task — it has no doer or due date.`);
  }

  const needsParent = PARENT_KIND[kind];
  if (needsParent && !parentId) return fail(`A ${kind} needs a parent ${needsParent}.`);
  if (!needsParent && parentId) return fail("A project can't have a parent.");

  if (parentId) {
    const parent = await db.query.projectNodes.findFirst({ where: eq(projectNodes.id, parentId) });
    if (!parent) return fail("Parent not found.");
    if (parent.kind !== needsParent) return fail(`A ${kind} must sit under a ${needsParent}.`);
  }

  try {
    const [maxRow] = (await db
      .select({ next: sql<number>`COALESCE(MAX(${projectNodes.sortOrder}), 0) + 10` })
      .from(projectNodes)
      .where(
        parentId
          ? eq(projectNodes.parentId, parentId)
          : sql`${projectNodes.parentId} IS NULL AND ${projectNodes.kind} = 'project'`,
      )) as Array<{ next: number }>;

    const base = {
      name,
      kind,
      parentId,
      sortOrder: maxRow?.next ?? 10,
      createdById: me.id,
      ownerId,
      // The plan's own copy of the schedule. `syncNodeTask` mirrors these onto
      // the task on every later edit, so they must match what the task is
      // about to be created with.
      targetDate: new Date(`${targetDate}T00:00:00.000Z`),
      durationMinutes: parsed.data.durationMinutes ?? null,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
    };
    // 0214's column, so an Action's Links cell reads the same field the three
    // container levels write. Dropped on its own if 0214 hasn't landed — the
    // row and its task matter more than the links on it.
    const links = parsed.data.links?.length ? parsed.data.links : null;

    let row: { id: string } | undefined;
    try {
      [row] = await db
        .insert(projectNodes)
        .values({ ...base, links })
        .returning({ id: projectNodes.id });
    } catch (err) {
      if (!isUndefinedColumn(err)) throw err;
      console.warn("[project-plan] migration 0214 not applied — links dropped");
      [row] = await db
        .insert(projectNodes)
        .values(base)
        .returning({ id: projectNodes.id });
    }
    if (!row) return fail("Insert returned no row.");
    revalidatePlanSurfaces();
    return { ok: true, id: row.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Create a CONTAINER row — Project / Milestone — from the full new-item form.
 *
 * The counterpart to `createPlanNodeForTask`. The create buttons all open the
 * same form (the real WMS task form), so both paths receive the same shape;
 * where they differ is what happens to it:
 *
 *   TASK_KINDS  →  createPlanNodeForTask + createTask   ONE task, as ever
 *   container   →  this, and NO task                    a milestone isn't work
 *
 * RESULT MOVED to the first row. It used to be a container here; it now carries
 * a task, because people put an owner and a target date on one and expect to
 * see it in WMS. It keeps its derived progress either way — see `hasTask` vs
 * `isExecutable` in lib/project-plan/levels.ts.
 *
 * The container half is why migration 0213 exists: client, subject, priority,
 * initiator and tags have nowhere to live on a row that has no task, and a form
 * that collects six fields and discards them is worse than one that never asked.
 *
 * Deliberately does NOT call `syncNodeTask`. That function already returns
 * early for a level with no task (`hasTask` guard), so this is belt-and-braces
 * rather than load-bearing — but it also means adding a level to TASK_KINDS can
 * never silently turn old project rows into tasks.
 */
const CreateContainerSchema = z.object({
  kind: KindSchema,
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1, "A name is required.").max(160),
  clientName: z.string().trim().max(200).nullable().optional(),
  subject: z.string().trim().max(200).nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).nullable().optional(),
  initiatorId: z.string().uuid().nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(20_000).nullable().optional(),
  notes: z.string().trim().max(20_000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).nullable().optional(),
  links: LinksSchema,
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(),
  // Project and Milestone send neither — the form hides the Schedule section
  // for those two levels. Result may send both.
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

export async function createPlanContainer(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateContainerSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { kind, parentId = null, name, targetDate } = parsed.data;

  // The mirror of the guard in `createPlanNodeForTask`. A row of a task level
  // arriving here would become a plan row with no task — invisible in WMS and
  // on the calendar. Result is now one of them, so it goes down that path too.
  if (hasTask(kind)) {
    return fail(`A ${KIND_LABEL[kind].toLowerCase()} is a task — it can't be created as a container.`);
  }

  const needsParent = PARENT_KIND[kind];
  if (needsParent && !parentId) return fail(`A ${kind} needs a parent ${needsParent}.`);
  if (!needsParent && parentId) return fail("A project can't have a parent.");

  if (parentId) {
    const parent = await db.query.projectNodes.findFirst({ where: eq(projectNodes.id, parentId) });
    if (!parent) return fail("Parent not found.");
    if (parent.kind !== needsParent) return fail(`A ${kind} must sit under a ${needsParent}.`);
  }

  try {
    const [maxRow] = (await db
      .select({ next: sql<number>`COALESCE(MAX(${projectNodes.sortOrder}), 0) + 10` })
      .from(projectNodes)
      .where(
        parentId
          ? eq(projectNodes.parentId, parentId)
          : sql`${projectNodes.parentId} IS NULL AND ${projectNodes.kind} = 'project'`,
      )) as Array<{ next: number }>;

    // The columns every database has, whether or not 0213 landed.
    const base = {
      name,
      kind,
      parentId,
      sortOrder: maxRow?.next ?? 10,
      createdById: me.id,
      ownerId: parsed.data.ownerId ?? null,
      description: parsed.data.description ?? null,
      notes: parsed.data.notes ?? null,
      targetDate: targetDate ? new Date(`${targetDate}T00:00:00.000Z`) : null,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
    };
    // The 0213 + 0214 columns, which prod may not have yet. Dropped as one
    // group: they are written in a single insert, so a missing column in either
    // migration costs the whole group rather than the row.
    const intake = {
      clientName: parsed.data.clientName ?? null,
      subject: parsed.data.subject ?? null,
      priority: parsed.data.priority ?? null,
      initiatorId: parsed.data.initiatorId ?? null,
      tags: parsed.data.tags?.length ? parsed.data.tags : null,
      links: parsed.data.links?.length ? parsed.data.links : null,
    };

    let row: { id: string } | undefined;
    try {
      [row] = await db
        .insert(projectNodes)
        .values({ ...base, ...intake })
        .returning({ id: projectNodes.id });
    } catch (err) {
      // 42703 = undefined_column — migration 0213 hasn't been applied here.
      // Save the row rather than the whole create: the structure is the part
      // the user cannot re-enter from the register, and the intake fields are
      // still on screen if they retry after the migration.
      if (!isUndefinedColumn(err)) throw err;
      console.warn("[project-plan] migration 0213/0214 not applied — container intake fields dropped");
      [row] = await db
        .insert(projectNodes)
        .values(base)
        .returning({ id: projectNodes.id });
    }

    if (!row) return fail("Insert returned no row.");
    revalidatePlanSurfaces();
    return { ok: true, id: row.id };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Create MANY rows at one level, under one parent, in one go.
 *
 * The bulk-upload counterpart to the two single-row creates above, and
 * deliberately not a loop over either of them: the parent check, the roster
 * lookup and the `MAX(sort_order)` read are all facts about the DESTINATION,
 * not about each row, so they happen once. Fifty rows cost one validation, one
 * ordering query and one INSERT.
 *
 * WHERE THE TASKS COME FROM. Nothing here creates a task by hand. Executable
 * rows go through `syncNodeTask`, exactly as an inline edit does — so a row
 * that arrives with an owner AND a target date becomes a real WMS task (short
 * id, audit event, notifications, calendar sync, all through `createTasksCore`)
 * and one that arrives without them stays a plan row until somebody fills them
 * in. That is the module's existing lazy rule; bulk upload obeys it rather than
 * inventing a second way for a task to be born.
 *
 * ONE ROW'S TASK CANNOT COST THE IMPORT. The plan rows are committed before any
 * of this runs, and `syncNodeTask` swallows its own failures — so a calendar
 * hiccup on row 12 leaves 50 plan rows and 49 tasks, not a half-written import
 * and an error page.
 */
const BulkRowSchema = z.object({
  name: z.string().trim().min(1, "A name is required.").max(160),
  ownerId: z.string().uuid().nullable().optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  description: z.string().trim().max(20_000).nullable().optional(),
});

const BulkCreateSchema = z.object({
  kind: KindSchema,
  parentId: z.string().uuid().nullable().optional(),
  rows: z.array(BulkRowSchema).min(1, "Nothing to import.").max(MAX_BULK_ROWS),
});

export async function bulkCreatePlanNodes(
  input: unknown,
): Promise<Result<{ created: number; tasks: number }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = BulkCreateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { kind, parentId = null, rows } = parsed.data;

  // The destination, checked ONCE — every row lands in the same place.
  const needsParent = PARENT_KIND[kind];
  if (needsParent && !parentId) {
    return fail(`A ${KIND_LABEL[kind].toLowerCase()} needs a ${KIND_LABEL[needsParent].toLowerCase()} to sit under.`);
  }
  if (!needsParent && parentId) return fail("A project can't have a parent.");

  if (parentId) {
    const parent = await db.query.projectNodes.findFirst({ where: eq(projectNodes.id, parentId) });
    if (!parent) return fail("The row these were going under no longer exists.");
    if (parent.kind !== needsParent) {
      return fail(`A ${KIND_LABEL[kind].toLowerCase()} must sit under a ${KIND_LABEL[needsParent!].toLowerCase()}.`);
    }
    if (parent.isArchived) return fail("That row is archived — restore it before adding to it.");
  }

  // A container has no doer and no due date, so an owner on one is just its
  // owner; on an executable row it is the person the task will be created for.
  const executable = hasTask(kind);

  try {
    const [maxRow] = (await db
      .select({ next: sql<number>`COALESCE(MAX(${projectNodes.sortOrder}), 0) + 10` })
      .from(projectNodes)
      .where(
        parentId
          ? eq(projectNodes.parentId, parentId)
          : sql`${projectNodes.parentId} IS NULL AND ${projectNodes.kind} = 'project'`,
      )) as Array<{ next: number }>;
    const first = maxRow?.next ?? 10;

    // Gaps of 10, matching every other create in this file — room for a future
    // drag-drop to slot a row between two others without renumbering the run.
    const values = rows.map((r, i) => ({
      name: r.name,
      kind,
      parentId,
      sortOrder: first + i * 10,
      createdById: me.id,
      // Same rule as the single create: an executable row ALWAYS becomes a
      // task, so a sheet that left Owner or Target Date blank gets the two safe
      // answers — the importer, and today — rather than fifty rows that are in
      // the plan and invisible in WMS. A container keeps whatever was given,
      // which for a date is nothing at all.
      ownerId: r.ownerId ?? (executable ? me.id : null),
      description: r.description ?? null,
      targetDate: r.targetDate
        ? new Date(`${r.targetDate}T00:00:00.000Z`)
        : executable
          ? startOfToday()
          : null,
      // Only the scheduled levels send these; the client drops them for a
      // Project or a Milestone, which are dated by the work underneath them.
      startsAt: r.startsAt ? new Date(r.startsAt) : null,
      endsAt: r.endsAt ? new Date(r.endsAt) : null,
    }));

    const inserted = await db
      .insert(projectNodes)
      .values(values)
      .returning({ id: projectNodes.id });

    // The plan is saved. Everything below this point is the task bridge, and
    // every failure in it is already swallowed row by row.
    let tasks = 0;
    if (executable) {
      // No row is skipped any more: every executable row was just written with
      // an owner and a target date, defaulted above where the sheet left them
      // blank, so every one of them has a task to build.
      for (const row of inserted) {
        await syncNodeTask(row.id, { id: me.id, name: me.name });
        tasks++;
      }
    }

    revalidatePlanSurfaces();
    return { ok: true, created: inserted.length, tasks };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** Postgres 42703 (undefined_column), however the driver wrapped it. */
function isUndefinedColumn(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code;
  if (code === "42703") return true;
  const cause = (err as { cause?: { code?: unknown } })?.cause;
  if (cause?.code === "42703") return true;
  return /column .* does not exist/i.test(err instanceof Error ? err.message : String(err));
}

/**
 * Midnight UTC on today's date — the default due date for a row added by "+".
 *
 * Matches how `bulkCreatePlanNodes` stores a typed target date
 * (`new Date(\`${ymd}T00:00:00.000Z\`)`), so a defaulted date and a typed one
 * are the same kind of value and sort together. Date-only by intent: nobody
 * picked a time, so storing the current clock would invent a deadline of
 * "14:37 today" that no one asked for.
 */
function startOfToday(): Date {
  const now = new Date();
  return new Date(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}T00:00:00.000Z`,
  );
}

function defaultName(kind: PlanKind): string {
  switch (kind) {
    case "project": return "New project";
    case "milestone": return "New milestone";
    case "result": return "New result";
    case "action": return "New action";
    case "sub_action": return "New sub-action";
    case "sub_sub_action": return "New sub-sub-action";
  }
}

// ── Update (inline editing) ─────────────────────────────────────────────────

const UpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(160).optional(),
  /** Free text, or null to clear it. The Project Description of brief §4;
   *  `project_nodes.description` has existed since #13, so this only opens the
   *  write path the hierarchy table needs. */
  description: z.string().trim().max(2000).nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  /** "YYYY-MM-DD" or null to clear. */
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).nullable().optional(),
  durationMinutes: z.number().int().min(0).max(60 * 24 * 30).nullable().optional(),
  /** Full ISO instants (the client combines its date + time inputs). */
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  /**
   * The CONTAINER row's own priority (migration 0213), or null to clear it.
   *
   * Refused on an executable row below: an action IS its task, and the task
   * already has a priority that WMS, the board's inline cell and the task
   * drawer all read. Writing a second one onto the node would give the same row
   * two priorities free to disagree — the same rule `status` and `notes`
   * already follow in this module.
   */
  priority: z.enum(TASK_PRIORITIES).nullable().optional(),
  /**
   * Initiator Notes on a CONTAINER row, or null to clear. Refused on an
   * executable row for the same reason as `priority`: its notes are the task's,
   * which is what the task drawer edits and the register reads.
   */
  notes: z.string().trim().max(20_000).nullable().optional(),
  /** Reference links (migration 0214), replacing the list wholesale. */
  links: LinksSchema,
});

export async function updatePlanNode(input: unknown): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...patch } = parsed.data;

  const auth = await loadNode(id);
  if (!auth.ok) return auth;

  const set: Partial<typeof projectNodes.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  // An empty string is a CLEAR, not a stored blank — otherwise a row would
  // carry "" and every `description &&` check on the read side would still
  // count it as absent while the column claimed otherwise.
  if (patch.description !== undefined) set.description = patch.description || null;
  if (patch.ownerId !== undefined) set.ownerId = patch.ownerId;
  if (patch.durationMinutes !== undefined) set.durationMinutes = patch.durationMinutes;
  if (patch.targetDate !== undefined) {
    // Noon local, not midnight: a midnight timestamp lands on the previous day
    // for anyone west of the storage zone once it round-trips.
    set.targetDate = patch.targetDate ? new Date(`${patch.targetDate}T12:00:00`) : null;
  }
  if (patch.notes !== undefined) {
    if (isExecutable(auth.node.kind as PlanKind)) {
      return fail(
        `An ${KIND_LABEL[auth.node.kind as PlanKind].toLowerCase()} keeps its notes on its task — edit them there.`,
      );
    }
    set.notes = patch.notes || null;
  }
  if (patch.links !== undefined) set.links = patch.links?.length ? patch.links : null;
  if (patch.priority !== undefined) {
    if (isExecutable(auth.node.kind as PlanKind)) {
      return fail(
        `An ${KIND_LABEL[auth.node.kind as PlanKind].toLowerCase()} takes its priority from its task — set it there.`,
      );
    }
    set.priority = patch.priority;
  }
  if (patch.startsAt !== undefined) set.startsAt = patch.startsAt ? new Date(patch.startsAt) : null;
  if (patch.endsAt !== undefined) set.endsAt = patch.endsAt ? new Date(patch.endsAt) : null;

  if (set.startsAt && set.endsAt && set.endsAt < set.startsAt) {
    return fail("The end time must be at or after the start time.");
  }
  if (patch.ownerId) {
    const person = await db.query.employees.findFirst({ where: eq(employees.id, patch.ownerId) });
    if (!person) return fail("That person no longer exists.");
  }

  try {
    try {
      await db.update(projectNodes).set(set).where(eq(projectNodes.id, id));
    } catch (err) {
      // 42703 — 0213 is not applied here. Save everything else rather than
      // losing the whole edit over a column the screen already degrades on.
      if (!isUndefinedColumn(err) || (set.priority === undefined && set.links === undefined)) throw err;
      console.warn("[project-plan] migration 0213/0214 not applied — priority and links not saved");
      const { priority: _p, links: _l, ...rest } = set;
      await db.update(projectNodes).set(rest).where(eq(projectNodes.id, id));
    }
    await syncNodeTask(id, { id: me.id, name: me.name });
    revalidatePlanSurfaces();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// -- Status (working flow + restricted verdicts) -----------------------------

// `actorFor` — the caller's relationship to ONE node (owner? doer? their
// supervisor?) — now lives in lib/project-plan/authz.ts, because the attachment
// actions have to rule on exactly the same facts. Two copies of that question
// would eventually answer it differently.

const StatusSchema = z.object({
  id: z.string().uuid(),
  /** Any value from either flow - which of them the caller may actually use is
   *  decided by canSetPlanStatus below, never by the shape of this input. */
  status: z.string().min(1).max(40),
});

/**
 * Set a plan row's status.
 *
 * THE PERMISSION IS ENFORCED HERE, not in the picker. The restricted verdicts
 * (Approved / Not Approved / On Hold / Cancelled / Archived) are an authority
 * decision, so a doer POSTing "approved" straight at this action is refused by
 * the same rule the dropdown uses - the dropdown merely renders what this
 * module already says is allowed.
 *
 * WHERE THE VALUE LANDS depends on the row, and this is the part that keeps the
 * module honest about having ONE source of truth:
 *
 *   Executable row (action / sub-action / sub-sub-action)
 *     It IS a WMS task, so a working status is written to that task through the
 *     SAME `setTaskStatus` action WMS and the kanban call - including its
 *     optimistic-lock check and its activity/notification side effects. The
 *     node gets no copy.
 *
 *   Container row (project / milestone / result)
 *     No task exists to hold it, so it goes in project_nodes.status.
 *
 *   Restricted verdict, either kind of row
 *     project_nodes.approval_status, layered on top rather than overwriting the
 *     progress report underneath. 'archived' is the is_archived boolean, which
 *     already has a column and a cascade - see deletePlanNode.
 */
export async function setPlanNodeStatus(input: unknown): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = StatusSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, status } = parsed.data;

  const [node] = await db.select().from(projectNodes).where(eq(projectNodes.id, id)).limit(1);
  if (!node) return fail("That row no longer exists.");

  // Deliberately NOT authorizeNode: that asks "did you create this row?", which
  // is the wrong question for a status. A doer reporting progress on work
  // someone else planned is exactly the normal case.
  const actor = await actorFor(me, node);
  const verdict = canSetPlanStatus(actor, status);
  if (!verdict.ok) return fail(verdict.reason);

  try {
    if (status === "archived") {
      // Archiving is a cascade with task and calendar consequences - there is
      // one implementation of it, and this is not a second one.
      const res = await deletePlanNode(id);
      return res.ok ? { ok: true } : res;
    }

    if (isRestrictedStatus(status)) {
      // 'archived' returned above — it is the is_archived boolean, not a value
      // of this column, which is exactly why the column's type excludes it.
      const verdict = status as Exclude<PlanRestrictedStatus, "archived">;
      await db
        .update(projectNodes)
        .set({ approvalStatus: verdict, updatedAt: new Date() })
        .where(eq(projectNodes.id, id));
      revalidatePlanSurfaces();
      return { ok: true };
    }

    if (!isWorkingStatus(status)) return fail(`"${status}" is not a project status.`);

    if (isExecutable(node.kind)) {
      const [linked] = await db
        .select({ id: tasks.id, updatedAt: tasks.updatedAt })
        .from(tasks)
        .where(and(eq(tasks.projectNodeId, id), eq(tasks.archived, false)))
        .orderBy(asc(tasks.createdAt))
        .limit(1);

      if (linked) {
        // The one shared record. setTaskStatus carries the optimistic lock, the
        // activity trail and the notifications - none of which we reimplement.
        const res = await setTaskStatus(linked.id, status, linked.updatedAt.toISOString());
        if (!res.ok) return fail(res.error);
        revalidatePlanSurfaces();
        return { ok: true };
      }
      // Not scheduled yet - no task to carry it. Fall through and record it on
      // the node so the intent is not lost; syncNodeTask builds the task once
      // the row has an owner and a date.
    }

    await db
      .update(projectNodes)
      .set({ status, updatedAt: new Date() })
      .where(eq(projectNodes.id, id));
    revalidatePlanSurfaces();
    return { ok: true };
  } catch (err) {
    return fail(migrationHint(err));
  }
}

const ProgressSchema = z.object({
  id: z.string().uuid(),
  /** 0-100, or null to go back to deriving it from the work underneath. */
  percent: z.number().int().min(0).max(100).nullable(),
});

/**
 * Record a container's partial completion - the "this milestone is 40% there"
 * judgement that makes 3.5/10 possible.
 *
 * Only ever an OVERRIDE. Null clears it and progress goes back to being derived
 * from the done/total of the executable rows beneath (lib/project-plan/
 * progress.ts), which is the default and the honest one. Same authority as a
 * restricted verdict: declaring a milestone 75% done when three of its ten
 * actions are finished is a ruling, not a progress report.
 */
export async function setPlanNodeProgress(input: unknown): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ProgressSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, percent } = parsed.data;

  const [node] = await db.select().from(projectNodes).where(eq(projectNodes.id, id)).limit(1);
  if (!node) return fail("That row no longer exists.");

  if (isExecutable(node.kind)) {
    // An action is done or it is not - its progress IS its task's status. A
    // hand-set 60% here would immediately disagree with the row's own chip.
    return fail(`A ${KIND_LABEL[node.kind]} is measured by its status, not a percentage.`);
  }

  try {
    await db
      .update(projectNodes)
      .set({ progressPercent: percent, updatedAt: new Date() })
      .where(eq(projectNodes.id, id));
    revalidatePlanSurfaces();
    return { ok: true };
  } catch (err) {
    return fail(migrationHint(err));
  }
}

/**
 * Turn Postgres 42703 (undefined_column) into something a person clicking a
 * dropdown can act on. These three columns arrive with migration 0204, which
 * may not be applied yet.
 */
function migrationHint(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/column .*"?(status|approval_status|progress_percent)"?.* does not exist/i.test(msg)) {
    return "Project statuses need migration 0204 - run `pnpm db:migrate`.";
  }
  return msg;
}

// ── Delete (archive, cascading) ─────────────────────────────────────────────

/**
 * Archive a row and everything under it, and archive the tasks those rows are.
 * Never a hard delete — `project_nodes` revokes DELETE from the app role
 * (migration 0027) and the whole module has always archived instead, so history
 * and any WMS references survive. Archiving the task also tears its Google
 * Calendar event down, via reconcileTaskEvent's archived branch.
 */
export async function deletePlanNode(id: string): Promise<Result<{ nodes: number; tasks: number }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const auth = await loadNode(id);
  if (!auth.ok) return auth;

  try {
    const ids = await descendantIds(id);
    if (ids.length === 0) return fail("Row not found.");

    const doomed = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(inArray(tasks.projectNodeId, ids), eq(tasks.archived, false)));

    await db
      .update(projectNodes)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(inArray(projectNodes.id, ids));

    if (doomed.length > 0) {
      await db
        .update(tasks)
        .set({ archived: true, updatedAt: new Date() })
        .where(inArray(tasks.id, doomed.map((t) => t.id)));
      afterResponse(() => Promise.allSettled(doomed.map((t) => reconcileTaskEvent(t.id))));
    }

    revalidatePlanSurfaces();
    return { ok: true, nodes: ids.length, tasks: doomed.length };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** How much a delete would take with it — the confirmation dialog's numbers. */
export async function planDeleteImpact(id: string): Promise<Result<{ nodes: number; tasks: number }>> {
  await requireUser();
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid id.");
  try {
    const ids = await descendantIds(id);
    const linked = ids.length
      ? await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(and(inArray(tasks.projectNodeId, ids), eq(tasks.archived, false)))
      : [];
    // The row itself doesn't count as one of its own children.
    return { ok: true, nodes: Math.max(0, ids.length - 1), tasks: linked.length };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Duplicate (deep) ────────────────────────────────────────────────────────

/** Guard rail: one duplicate may not clone an unbounded branch in a request. */
const MAX_DUPLICATE_NODES = 500;

/**
 * Copy a row and its whole subtree in as a new sibling directly after it.
 *
 * Plan fields come along (dates, duration, owner) because a
 * duplicate is meant to save re-typing. The copies are plan rows: each one is
 * then handed to `syncNodeTask`, which creates its task only if it is an
 * executable level that already carries an owner AND a target date — the same
 * bar a hand-typed row has to clear. So duplicating a scheduled branch really
 * does put the copies in WMS, and duplicating a draft branch does not.
 */
export async function duplicatePlanNode(id: string): Promise<Result<{ id: string; count: number }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const auth = await loadNode(id);
  if (!auth.ok) return auth;
  const source = auth.node;


  try {
    const ids = await descendantIds(id);
    if (ids.length > MAX_DUPLICATE_NODES) {
      return fail(`That branch has ${ids.length} rows — too large to duplicate in one go (limit ${MAX_DUPLICATE_NODES}).`);
    }
    // Archived descendants are deliberately excluded: they are not on the board,
    // so copying them would resurrect deleted work inside the duplicate.
    const rows = await db
      .select()
      .from(projectNodes)
      .where(and(inArray(projectNodes.id, ids), eq(projectNodes.isArchived, false)))
      .orderBy(asc(projectNodes.sortOrder), asc(projectNodes.name));
    if (!rows.some((r) => r.id === id)) return fail("Row not found.");

    const byParent = new Map<string | null, typeof rows>();
    for (const r of rows) {
      const key = r.parentId;
      const list = byParent.get(key) ?? [];
      list.push(r);
      byParent.set(key, list);
    }

    const created: string[] = [];

    // Breadth-first clone so a parent always exists before its children.
    async function cloneInto(sourceId: string, newParentId: string | null, sortOrder: number): Promise<string> {
      const src = rows.find((r) => r.id === sourceId)!;
      const [copy] = await db
        .insert(projectNodes)
        .values({
          name: sourceId === id ? `${src.name} (copy)` : src.name,
          kind: src.kind,
          parentId: newParentId,
          sortOrder,
          description: src.description,
          notes: src.notes,
          targetDate: src.targetDate,
          ownerId: src.ownerId,
          vendorId: src.vendorId,
          durationMinutes: src.durationMinutes,
          startsAt: src.startsAt,
          endsAt: src.endsAt,
          createdById: me.id,
        })
        .returning({ id: projectNodes.id });
      const newId = copy!.id;
      created.push(newId);
      const kids = byParent.get(sourceId) ?? [];
      let order = 10;
      for (const kid of kids) {
        await cloneInto(kid.id, newId, order);
        order += 10;
      }
      return newId;
    }

    // Space the run before choosing the copy's slot: with legacy rows all
    // sharing sort_order 100, "original + 5" would land after EVERY sibling
    // instead of directly after the row that was duplicated.
    await renumberSiblings(source.parentId, source.kind as PlanKind);
    const [spaced] = await db
      .select({ sortOrder: projectNodes.sortOrder })
      .from(projectNodes)
      .where(eq(projectNodes.id, id))
      .limit(1);

    const rootId = await cloneInto(id, source.parentId, (spaced?.sortOrder ?? source.sortOrder) + 5);

    // The copy slots in right after the original; renormalise once more so the
    // +5 can't collide with a later insert.
    await renumberSiblings(source.parentId, source.kind as PlanKind);

    for (const newId of created) {
      await syncNodeTask(newId, { id: me.id, name: me.name });
    }

    revalidatePlanSurfaces();
    return { ok: true, id: rootId, count: created.length };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

// ── Reorder ─────────────────────────────────────────────────────────────────

/** Rewrite a sibling run as 10, 20, 30 … in its current visible order. */
async function renumberSiblings(parentId: string | null, kind: PlanKind): Promise<void> {
  const siblings = await db
    .select({ id: projectNodes.id })
    .from(projectNodes)
    .where(
      and(
        eq(projectNodes.isArchived, false),
        parentId
          ? eq(projectNodes.parentId, parentId)
          : and(sql`${projectNodes.parentId} IS NULL`, eq(projectNodes.kind, kind)),
      ),
    )
    .orderBy(asc(projectNodes.sortOrder), asc(projectNodes.name));

  let order = 10;
  for (const s of siblings) {
    await db.update(projectNodes).set({ sortOrder: order }).where(eq(projectNodes.id, s.id));
    order += 10;
  }
}

const MoveSchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(["up", "down"]),
});

/**
 * Move a row one place among its siblings. Reordering never changes parentage —
 * a row swaps sort_order with its neighbour and nothing else, so the tree (and
 * therefore every derived REF below it) stays intact.
 */
export async function movePlanNode(input: unknown): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = MoveSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid input.");
  const { id, direction } = parsed.data;

  const auth = await loadNode(id);
  if (!auth.ok) return auth;
  const node = auth.node;

  try {
    // Normalise the run FIRST. `project_nodes.sort_order` defaults to 100, so
    // every row created before this screen existed shares that one value and
    // siblings are currently ordered by name alone. Swapping two rows that both
    // hold 100 writes 100 twice and the move silently does nothing — which is
    // exactly what a user would report as "the arrows are broken". Renumbering
    // to 10/20/30… in the CURRENT visible order first makes the swap meaningful
    // and is a no-op on runs that are already spaced.
    await renumberSiblings(node.parentId, node.kind as PlanKind);

    const siblings = await db
      .select({ id: projectNodes.id, sortOrder: projectNodes.sortOrder, name: projectNodes.name })
      .from(projectNodes)
      .where(
        and(
          eq(projectNodes.isArchived, false),
          node.parentId
            ? eq(projectNodes.parentId, node.parentId)
            : and(sql`${projectNodes.parentId} IS NULL`, eq(projectNodes.kind, node.kind)),
        ),
      )
      .orderBy(asc(projectNodes.sortOrder), asc(projectNodes.name));

    const i = siblings.findIndex((s) => s.id === id);
    if (i === -1) return fail("Row not found among its siblings.");
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= siblings.length) return { ok: true }; // already at the end — a no-op, not an error

    const a = siblings[i]!;
    const b = siblings[j]!;
    await db.update(projectNodes).set({ sortOrder: b.sortOrder }).where(eq(projectNodes.id, a.id));
    await db.update(projectNodes).set({ sortOrder: a.sortOrder }).where(eq(projectNodes.id, b.id));

    revalidatePlanSurfaces();
    return { ok: true };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
