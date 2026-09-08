import { Suspense } from "react";
import { DashboardHeader } from "@/components/layout/header";
import { BufferingState } from "@/components/ui/spinner";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { listPlanTree, attachmentCounts } from "@/lib/queries/project-plan";
import { TaskDetailDrawer } from "@/components/tasks/task-detail-drawer";
import { TaskDetailLoader } from "@/components/tasks/task-detail-loader";
import { ProjectViews } from "@/components/project-plan/project-views";
import { selectionFromQuery } from "@/lib/project-plan/views";
import { toRow } from "../plan-page";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Project Plan — PROJECT VIEWS.
 *
 * Reads the SAME `listPlanTree()` as the hierarchy board and the two registers.
 * There is no "project view" table, no denormalised copy and no second query:
 * this is a third way of looking at rows that already exist, which is what
 * keeps a milestone from reporting one status here and another on the board.
 *
 * THE ONE EXTRA COST is `attachmentCounts()` — a single grouped COUNT for the
 * whole plan, because every row shows a file count. The files themselves (and
 * their signed URLs) are fetched only when a cell is opened.
 *
 * THE TASK DRAWER IS WMS'S OWN. `?task=<uuid>` renders `TaskDetailLoader`
 * inside the same `TaskDetailDrawer` that /tasks uses — the whole record, with
 * Start/End time, Repeat and Custom Repeat, Duration, the Start/Stop timer,
 * status, approvals, checklist and attachments. Actions and Sub-Actions get the
 * full WMS task treatment because they ARE WMS tasks; nothing is reimplemented
 * here, and an edit made in the drawer is an edit to the record WMS lists.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string): string | null => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && UUID.test(s) ? s : null;
  };

  const me = await requireUser();
  const [tree, downline, counts] = await Promise.all([
    listPlanTree(),
    getDownlineIds(me.id),
    attachmentCounts(),
  ]);

  const selectedTaskId = one("task");

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <main className="mx-auto w-full max-w-[1600px] px-8 pb-16 pt-8 max-lg:px-6 max-md:px-4">
        <ProjectViews
          tree={tree.map(toRow)}
          initialSelection={selectionFromQuery(one)}
          attachmentCounts={Object.fromEntries(counts)}
          me={{ id: me.id, isAdmin: me.isAdmin }}
          downline={downline}
        />
      </main>

      {/* The record opens only when the URL names one. `key` re-suspends the
          boundary when a different task is picked, so the drawer never shows
          the previous task while the new payload resolves. */}
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
