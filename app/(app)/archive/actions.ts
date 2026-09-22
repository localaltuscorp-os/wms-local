"use server";

import { revalidatePath, updateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  dccKpiItems,
  employeeDocuments,
  employees,
  goals,
  hrTickets,
  kpiAssignments,
  moduleSubmissions,
  projectNodes,
  tasks,
  weeklyGoals,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { ARCHIVE_RECORD_KINDS, type ArchiveRecordKind } from "@/lib/archive/sections";
import { deleteTask, unarchiveTask } from "@/app/(app)/tasks/actions";
import { restoreGoalFromArchive } from "@/app/(app)/goals/cascade/actions";
import { setPerformanceArchived } from "@/lib/productivity/archive";

/**
 * THE ARCHIVE'S ONLY WRITES — take a record back out, or destroy it.
 *
 * The Archive is a reading surface; these two are the exceptions Sir asked for
 * (2026-09): "give option to unarchive and delete that data as well". Both are
 * deliberately blunt instruments with a very small blast radius:
 *
 *   UNARCHIVE  puts the record back on the live module screen it came from —
 *              same status, same doer, same dates. It goes back to the Tasks
 *              list, the goal board, the DCC sheet: wherever it was.
 *   DELETE     removes the row. There is no undo and no recycle bin behind
 *              this one; the confirm in the row is the last stop.
 *
 * A TASK IS WRITTEN BY THE TASKS MODULE, NOT BY THIS FILE. `unarchiveTask` and
 * `deleteTask` (app/(app)/tasks/actions.ts) do four things a bare UPDATE here
 * cannot: they write the `restored` / `deleted` audit event, emit the domain
 * event the outbox and notifications read, put the task back on its doer's
 * Google calendar, and — the one that bit us — call `updateTag(CACHE_TAGS.tasks)`.
 * The WMS list is an `unstable_cache` read; without that tag drop an unarchived
 * task stays invisible on /tasks until the cache expires, which is exactly the
 * "I unarchived it and it did not come back" this delegation fixes. Every other
 * kind flips its own flag here and drops whatever tag its readers use.
 *
 * WHAT KEEPS THIS SAFE:
 *   · Admins only — the same gate the pages carry, re-asserted here because a
 *     server action is a public endpoint and the page's redirect is not a
 *     permission (§23: the nav flag is convenience, the check is the boundary).
 *   · A WHITELIST, not a table name. The client sends a `kind` from a fixed
 *     list and this file decides which table and which column that means, so
 *     no request can reach a table the Archive does not own.
 *   · Only tables that HAVE an archive flag are in it. If a record cannot be
 *     put away by hand, it cannot be taken out or deleted from here either —
 *     an attendance punch, a salary run and an audit event are not the
 *     Archive's to rewrite.
 */

interface RecordTarget {
  table: PgTable;
  id: AnyPgColumn;
  /**
   * What Unarchive writes to put the row back. A PATCH rather than a column
   * name because the tables do not agree on how they say "put away": most flip
   * a boolean (`archived`, `isArchived`), and goals stamp a timestamp
   * (`archived_at`, migration 0215 — their `archived` means DELETED).
   */
  restorePatch: Record<string, unknown>;
  /** For the toast, and for the confirm dialog's wording. */
  label: string;
  /**
   * May `deleteRecord` destroy this row? Default yes — every kind here is
   * something a person archived and can therefore throw away.
   *
   * False for `team-performance`, the one kind whose id addresses something far
   * bigger than the record on screen: an EMPLOYEE, put away from one list. A
   * DELETE there would take the person's whole history with it — their tasks'
   * doer, their goals, their payslips — over a board preference. The Archive's
   * UI hides the button for these rows; this is the half that cannot be got
   * round by posting the id anyway.
   */
  deletable?: boolean;
}

const TARGETS: Record<ArchiveRecordKind, RecordTarget> = {
  task: { table: tasks, id: tasks.id, restorePatch: { archived: false }, label: "task" },
  "weekly-goal": {
    table: weeklyGoals,
    id: weeklyGoals.id,
    restorePatch: { archivedAt: null },
    label: "weekly goal",
  },
  goal: { table: goals, id: goals.id, restorePatch: { archivedAt: null }, label: "goal" },
  "dcc-item": {
    table: dccKpiItems,
    id: dccKpiItems.id,
    restorePatch: { archived: false },
    label: "DCC item",
  },
  "module-submission": {
    table: moduleSubmissions,
    id: moduleSubmissions.id,
    restorePatch: { archived: false },
    label: "submission",
  },
  "kpi-assignment": {
    table: kpiAssignments,
    id: kpiAssignments.id,
    restorePatch: { archived: false },
    label: "KPI assignment",
  },
  "employee-document": {
    table: employeeDocuments,
    id: employeeDocuments.id,
    restorePatch: { archived: false },
    label: "document",
  },
  "hr-ticket": { table: hrTickets, id: hrTickets.id, restorePatch: { archived: false }, label: "ticket" },
  "project-node": {
    table: projectNodes,
    id: projectNodes.id,
    restorePatch: { isArchived: false },
    label: "plan item",
  },
  // The row on Productivity › Team Performance (migration 0232). Unlike every
  // other kind this one is NOT a drizzle patch: the flag is deliberately not a
  // column on the `employees` table (lib/productivity/archive.ts explains why
  // naming it there would break the sign-in on a database without 0232), so the
  // restore runs as raw SQL below and these fields exist only to name it.
  // `deletable: false` is what stops the same surface offering to delete the
  // EMPLOYEE behind the row.
  "team-performance": {
    table: employees,
    id: employees.id,
    restorePatch: {},
    label: "Team Performance row",
    deletable: false,
  },
};

const Input = z.object({
  kind: z.enum(ARCHIVE_RECORD_KINDS),
  id: z.string().uuid(),
});

export type ArchiveActionResult = { ok: true; message: string } | { ok: false; error: string };

/** The Archive's own pages, after either action. */
function refresh(): void {
  revalidatePath("/archive");
  revalidatePath("/archive/[section]", "page");
}

/**
 * Send the record's OWN readers back to the database.
 *
 * Every module screen this surface can restore a row onto is either
 * force-dynamic (it re-reads on every request) or served from one of these
 * cache tags. Dropping the tag is what makes an unarchived record show up on
 * its module screen immediately rather than whenever the cache happens to
 * expire — see the note at the top about the task list.
 */
function refreshRecordReaders(kind: ArchiveRecordKind): void {
  switch (kind) {
    case "weekly-goal":
      updateTag(CACHE_TAGS.weeklyGoals);
      revalidatePath("/goals/weekly");
      break;
    case "goal":
      revalidatePath("/goals");
      break;
    case "dcc-item":
      revalidatePath("/dcc");
      break;
    case "module-submission":
      revalidatePath("/reimbursements");
      revalidatePath("/record-reference");
      break;
    case "kpi-assignment":
      revalidatePath("/hr/kpi");
      break;
    case "employee-document":
      revalidatePath("/hr/record");
      break;
    case "hr-ticket":
      revalidatePath("/support");
      break;
    case "project-node":
      updateTag(CACHE_TAGS.projectNodes);
      revalidatePath("/project-plan");
      break;
    case "team-performance":
      revalidatePath("/productivity/team");
      break;
    case "task":
      // Handled by the Tasks module's own action — it owns the tags.
      break;
  }
}

/** Put a record back where it came from — its module's live screen. */
export async function unarchiveRecord(
  kind: string,
  id: string,
): Promise<ArchiveActionResult> {
  const me = await requireUser();
  if (!me.isAdmin) return { ok: false, error: "Only an admin can change the Archive." };

  const parsed = Input.safeParse({ kind, id });
  if (!parsed.success) return { ok: false, error: "That record cannot be unarchived from here." };

  const target = TARGETS[parsed.data.kind];

  // A task goes home through the Tasks module's own writer, audit event and
  // cache tags included; a cascade goal through the Goals module's, which
  // re-checks who may touch somebody else's goal and revalidates its board.
  if (parsed.data.kind === "task") {
    const res = await unarchiveTask(parsed.data.id);
    if (!res.ok) return { ok: false, error: res.error };
    refresh();
    return { ok: true, message: "Unarchived — the task is back in the Tasks list." };
  }
  if (parsed.data.kind === "goal") {
    const res = await restoreGoalFromArchive({ id: parsed.data.id });
    if (!res.ok) return { ok: false, error: res.error };
    refresh();
    return { ok: true, message: "Unarchived — the goal is back on its board." };
  }
  if (parsed.data.kind === "team-performance") {
    if (!(await setPerformanceArchived(parsed.data.id, false))) {
      return { ok: false, error: "Could not restore that row to Team Performance." };
    }
    refresh();
    revalidatePath("/productivity/team");
    return { ok: true, message: "Restored — the row is back on Team Performance." };
  }

  try {
    await db
      .update(target.table)
      .set(target.restorePatch as never)
      .where(eq(target.id, parsed.data.id));
  } catch {
    return { ok: false, error: `Could not unarchive that ${target.label}.` };
  }
  refresh();
  refreshRecordReaders(parsed.data.kind);
  return { ok: true, message: `Unarchived — the ${target.label} is back on its module screen.` };
}

/**
 * Destroy a record. Irreversible.
 *
 * A failure here is usually a foreign key doing its job — something else still
 * points at this row and the database refuses to orphan it. That is reported as
 * itself rather than swallowed, because "delete failed because the record is
 * still in use" is the answer, not an error to retry.
 */
export async function deleteRecord(kind: string, id: string): Promise<ArchiveActionResult> {
  const me = await requireUser();
  if (!me.isAdmin) return { ok: false, error: "Only an admin can delete from the Archive." };

  const parsed = Input.safeParse({ kind, id });
  if (!parsed.success) return { ok: false, error: "That record cannot be deleted from here." };

  const target = TARGETS[parsed.data.kind];

  if (target.deletable === false) {
    return {
      ok: false,
      error: `A ${target.label} can only be restored from here — the record behind it is the employee, not the row.`,
    };
  }

  // Same reasoning as unarchive: deleting a task is the Tasks module's job —
  // it emits the TaskDeleted event and clears the doer's calendar entry.
  if (parsed.data.kind === "task") {
    const res = await deleteTask(parsed.data.id);
    if (!res.ok) return { ok: false, error: res.error };
    refresh();
    return { ok: true, message: "Deleted the task for good." };
  }

  try {
    await db.delete(target.table).where(eq(target.id, parsed.data.id));
  } catch {
    return {
      ok: false,
      error: `Could not delete that ${target.label} — something else in the system still refers to it.`,
    };
  }
  refresh();
  refreshRecordReaders(parsed.data.kind);
  return { ok: true, message: `Deleted the ${target.label} for good.` };
}
