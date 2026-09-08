import { Suspense } from "react";
import { DashboardHeader } from "@/components/layout/header";
import { BufferingState } from "@/components/ui/spinner";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listPlanTree, attachmentCounts } from "@/lib/queries/project-plan";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import type { TaskStatus } from "@/db/enums";
import { TaskDetailDrawer } from "@/components/tasks/task-detail-drawer";
import { TaskDetailLoader } from "@/components/tasks/task-detail-loader";
import { PlanRegister, type RegisterLevel } from "@/components/project-plan/plan-register";
import { toRow } from "./plan-page";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Project Plan — the REGISTER page, shared by all four listable levels.
 *
 * Reads the SAME `listPlanTree()` the hierarchy board reads. The register is a
 * flattening of that tree, not a second query and not a denormalised copy —
 * which is what keeps a row from reporting one status here and another on the
 * board.
 *
 * The only extra round-trip is `attachmentCounts()`: one grouped COUNT for the
 * whole plan, because the Attachments column needs a number per row. The files
 * themselves (and their signed URLs) are fetched only when a cell is opened.
 *
 * THE TASK DRAWER, on the Actions and Sub-Actions registers. Those rows ARE WMS
 * tasks, so `?task=<uuid>` renders `TaskDetailLoader` inside the same
 * `TaskDetailDrawer` that /tasks and Project Views use — the whole record, with
 * Start/End time, Repeat and Custom Repeat, Duration, the Start/Stop timer,
 * status, approvals, checklist and attachments. Milestones and Results never
 * set the param (they carry no task), so the drawer simply never mounts there.
 */
export async function RegisterPage({
  level,
  searchParams,
}: {
  level: RegisterLevel;
  /** Only the executable registers pass this — it is where `?task=` arrives. */
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const me = await requireUser();
  const [tree, downline, counts, employees, statusDisplay] = await Promise.all([
    listPlanTree(),
    getDownlineIds(me.id),
    attachmentCounts(),
    // Roster for the create dialog's Owner / Doer pickers.
    listEmployeeOptions(),
    // The shared bulk bar wants the label map even though the register turns
    // its task-side menus off. NOT loaded here: the Subject and Client rosters
    // the hierarchy board loads — those two menus do not exist on this screen.
    getStatusDisplayMap(),
  ]);

  // Admin-editable WMS status labels — a renamed status reads the same wherever
  // it appears. (The per-row chips use the Project Module's own eleven statuses
  // from lib/project-plan/status.ts, not these.)
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
  const task = Array.isArray(rawTask) ? rawTask[0] : rawTask;
  const selectedTaskId = task && UUID.test(task) ? task : null;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1600px] px-8 pb-16 pt-8 max-lg:px-6 max-md:px-4">
        <PlanRegister
          level={level}
          tree={tree.map(toRow)}
          attachmentCounts={Object.fromEntries(counts)}
          me={{ id: me.id, isAdmin: me.isAdmin }}
          downline={downline}
          employees={employees}
          canManage={canManage}
          labels={labels}
        />
      </main>

      {/* `key` re-suspends the boundary when a different task is picked, so the
          drawer never shows the previous task while the new payload resolves. */}
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
