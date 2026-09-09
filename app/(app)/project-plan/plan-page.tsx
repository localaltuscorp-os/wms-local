import { Suspense } from "react";
import { DashboardHeader } from "@/components/layout/header";
import { BufferingState } from "@/components/ui/spinner";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { TaskDetailDrawer } from "@/components/tasks/task-detail-drawer";
import { TaskDetailLoader } from "@/components/tasks/task-detail-loader";
import { requireUser } from "@/lib/auth/current";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listPlanTree, type PlanNode } from "@/lib/queries/project-plan";
import { STATUS_LABELS_FALLBACK } from "@/lib/format";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import type { TaskStatus } from "@/db/enums";
import { toYmd } from "@/lib/project-plan/levels";
import { PlanBoard, type PlanRow, type PlanLevel } from "@/components/project-plan/plan-board";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Project Plan — the hierarchy screen, shared by all five level routes.
 *
 * Reads the SAME `project_nodes` rows the older /projects workspace reads and
 * the SAME `tasks` rows WMS and the calendar read. Nothing here is a private
 * copy: this page is another window onto records that already exist.
 *
 * WHY ONE COMPONENT FOR SIX SIDEBAR ITEMS. Projects, Milestones, Results,
 * Actions and Sub-Actions are the same tree looked at from five heights, and
 * they need identical rosters, permissions, status labels and column plumbing.
 * Five page files would be five places to add the next column to. Each route is
 * therefore three lines that call this with a `level`, and the board decides
 * what to show — see components/project-plan/plan-board.tsx.
 */
export async function PlanPage({
  level,
  view = "list",
  searchParams,
}: {
  level: PlanLevel;
  /** Which view to land on. The Kanban route is this same page opened on the
   *  board, not a separate screen with its own data — see the note above. */
  view?: "list" | "kanban";
  /** Where `?task=` arrives from the board's WMS chip. */
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const me = await requireUser();
  const [tree, employees, downline, statusDisplay] = await Promise.all([
    listPlanTree(),
    listEmployeeOptions(),
    getDownlineIds(me.id),
    getStatusDisplayMap(),
    // NOT loaded: the Subject and Client rosters. The bulk bar draws those two
    // menus only when handed a roster, and the plan does not offer them — see
    // the note where <BulkActionBar> is mounted in plan-board.tsx.
  ]);

  // The bulk bar's status dropdown writes WMS task statuses, so it needs the
  // same admin-editable labels the WMS table reads — a renamed status reads the
  // same on both screens. (The per-row chips use the Project Module's own
  // eleven statuses from lib/project-plan/status.ts, not these.)
  const labels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;

  // NO STRUCTURE GATE. Status is the ONE guarded action in this module
  // (lib/project-plan/status.ts): the working six may be set by the doer, their
  // supervisor or the project owner; the five approval verdicts only by the
  // project owner or an admin. Everything else — creating, renaming, re-dating,
  // moving, duplicating, deleting, attaching — is open to any signed-in
  // employee, and the server actions no longer test who is asking.
  const canManage = true;

  const rawTask = searchParams?.task;
  const t = Array.isArray(rawTask) ? rawTask[0] : rawTask;
  const selectedTaskId = t && UUID.test(t) ? t : null;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1600px] px-8 pb-16 pt-8 max-lg:px-6 max-md:px-4">
        <PlanBoard
          level={level}
          tree={tree.map(toRow)}
          employees={employees}
          canManage={canManage}
          labels={labels}
          isAdmin={me.isAdmin}
          me={{ id: me.id, isAdmin: me.isAdmin }}
          downline={downline}
          initialView={view}
        />
      </main>

      {/* The FULL WMS record, in the same drawer /tasks, the registers and
          Project Views use — reached from the board's WMS chip. This is what
          makes repeat, custom repeat, the schedule and the approval trail
          available on the hierarchy too, without a second editor existing. */}
      <TaskDetailDrawer open={Boolean(selectedTaskId)}>
        {selectedTaskId ? (
          <Suspense
            key={selectedTaskId}
            fallback={
              <div className="flex min-h-[50vh] items-center justify-center">
                <BufferingState label="Loading task…" />
              </div>
            }
          >
            <TaskDetailLoader
              taskId={selectedTaskId}
              me={{
                id: me.id,
                email: me.email,
                name: me.name,
                avatarUrl: me.avatarUrl,
                department: me.department,
                isAdmin: me.isAdmin,
                isSuperAdmin: isSuperAdmin(me.email),
              }}
            />
          </Suspense>
        ) : null}
      </TaskDetailDrawer>
    </>
  );
}

/**
 * Server node → client row. Dates become strings at this boundary so the table
 * never has to guess a timezone: the target date is a plain local YYYY-MM-DD
 * and the two time columns keep their full instants.
 *
 * Everything the STATUS and PROGRESS columns need travels with the row —
 * `status` / `approvalStatus` / `progressPercent` for this node, and the whole
 * subtree in `children` for lib/project-plan/progress.ts to roll up. Nothing is
 * pre-computed here: the client recomputes progress as rows are edited, from
 * the same pure functions the server would use for an export.
 */
export function toRow(node: PlanNode): PlanRow {
  return {
    id: node.id,
    name: node.name,
    description: node.description,
    notes: node.notes,
    kind: node.kind,
    parentId: node.parentId,
    // The three columns migration 0204 adds. They arrive null when 0204 is
    // unapplied (loadPlanMeta swallows the undefined-column error), and the
    // board renders exactly as it did before — a missing status, not a crash.
    status: node.status,
    approvalStatus: node.approvalStatus,
    progressPercent: node.progressPercent,
    // Migrations 0213 + 0214, guarded the same way: a null priority and an
    // empty link list when the columns are not there yet, so those two cells
    // simply have nothing to show.
    priority: node.priority,
    links: node.links,
    targetDate: node.targetDate ? toYmd(node.targetDate) : null,
    durationMinutes: node.durationMinutes,
    startsAt: node.startsAt ? node.startsAt.toISOString() : null,
    endsAt: node.endsAt ? node.endsAt.toISOString() : null,
    ownerId: node.ownerId,
    ownerName: node.ownerName,
    task: node.task
      ? {
          id: node.task.id,
          status: node.task.status,
          statusLabel: STATUS_LABELS_FALLBACK[node.task.status] ?? node.task.status,
          doerId: node.task.doerId,
          doerName: node.task.doerName,
          priority: node.task.priority,
          updatedAt: node.task.updatedAt.toISOString(),
          onCalendar: node.task.onCalendar,
          timerRunning: node.task.timerRunning,
          client: node.task.client,
          subject: node.task.subject,
          notes: node.task.notes,
          createdAt: node.task.createdAt.toISOString(),
          dueAt: node.task.dueAt.toISOString(),
        }
      : null,
    children: node.children.map(toRow),
  };
}
