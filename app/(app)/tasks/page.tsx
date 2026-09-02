import { FINE_BUCKET_SLUGS } from "@/lib/transforms/aging-buckets-fine";
import { Suspense } from "react";
import { DashboardHeader } from "@/components/layout/header";
import { FilterBar } from "@/components/layout/filter-bar";
import { TaskListPage } from "@/components/tasks/task-list-page";
import { TaskDetailLoader } from "@/components/tasks/task-detail-loader";
import { BufferingState } from "@/components/ui/spinner";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { canChangeDoerFor } from "@/lib/auth/doer-permission";
import { markTaskRead } from "@/app/(app)/tasks/read-actions";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listTasks, listDistinctSubjects } from "@/lib/queries/tasks";
import type { TaskListFilters } from "@/lib/types";
import { listActiveClientNames } from "@/lib/queries/clients";
import { listWeekGoalsAsTasks } from "@/lib/weekly-goals/as-task-row";
import { goalScopeFor } from "@/lib/weekly-goals/hierarchy";
import { parseTaskFilters } from "@/lib/task-filters";
import { requireUser } from "@/lib/auth/current";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { TASK_STATUSES, isDeprecatedStatus } from "@/db/enums";
import type { TaskStatus, StatusColorToken } from "@/db/enums";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** `?task=` drives the master–detail split. Anything that isn't a uuid is
 *  ignored rather than 404'd — a stale link should land you on the plain list,
 *  not an error page. */
const TASK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TasksPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const me = await requireUser();
  // Who may reassign a doer: managers, Manan, Om. Resolved on the SERVER and
  // passed down as a boolean — the table is a client component and has no
  // business knowing emails or the org chart. The server actions re-check it.
  const mayChangeDoer = await canChangeDoerFor(me);
  const rawTask = Array.isArray(sp.task) ? sp.task[0] : sp.task;
  const selectedTaskId = rawTask && TASK_ID.test(rawTask) ? rawTask : null;
  // Non-admins default to "assigned to me" when no explicit ?emp= is set.
  const filters = parseTaskFilters(sp, /*archived*/ false, {
    defaultDoerId: me.isAdmin ? undefined : me.id,
  });

  // This week's goals for the view's scope, surfaced as a pinned group above
  // the task table (design §10). Honours the shared client/subject/priority
  // filters. Display-only — never counted in the KPIs.
  //
  // The Tasks page surfaces ONLY the viewer's OWN weekly goals — never anyone
  // else's, not even for admins. Showing every employee's goals here made the
  // page run very long for admins; each person sees just their own goals (the
  // full team view lives on the Weekly Goals board).
  const goalScope: string[] = [me.id];

  // The summary pills describe the user's WHOLE scope, so they are counted over
  // a second read with the status/priority dimensions stripped out. Counting
  // them from `rows` (as the component used to) meant clicking "Pending" filtered
  // the rows AND the counts, so every other pill dropped to 0 and the bar stopped
  // being a summary at all.
  //
  // Everything else — date window, assignee, department, subject, client,
  // archived — is deliberately KEPT, because those are the scope the pills are
  // meant to describe.
  const scopeFilters: TaskListFilters = { ...filters, statuses: [], priorities: [] };
  const sameScope =
    filters.statuses.length === 0 && filters.priorities.length === 0;

  const [allEmployees, rows, scopeRows, subjects, clients, statusDisplay, weeklyGoals] =
    await Promise.all([
      listEmployeeOptions(),
      listTasks(filters),
      // With no status/priority filter the two reads are identical, so skip the
      // second query entirely and reuse the first result below.
      sameScope ? Promise.resolve(null) : listTasks(scopeFilters),
      listDistinctSubjects(),
      listActiveClientNames(),
      getStatusDisplayMap(),
      listWeekGoalsAsTasks({
        scope: { employeeIds: goalScope },
        filters: {
          priorities: filters.priorities,
          subjects: filters.subjects,
          clients: filters.clients,
        },
      }).catch(() => []),
    ]);

  // Read-receipt for the drawer, matching /tasks/[id]: opening a task in the
  // side panel counts as opening it. Fire-and-forget and NULL-guarded, so
  // reopening an already-read record is a no-op.
  if (selectedTaskId) void markTaskRead(selectedTaskId);

  const statusLabels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;
  const statusTones = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.color]),
  ) as Record<TaskStatus, StatusColorToken>;

  const employeeOptions = allEmployees.map((e) => ({
    value: e.id,
    label: e.name,
  }));

  // Status filter options in canonical workflow order, carrying the
  // admin-overridable human labels. Retired statuses (follow_up_1/2/3,
  // cancelled, transferred) are dropped from the picker — see sir's changes
  // #2/#4/#6 — but approved/not_approved stay so the KPI links still filter.
  const statusOptions: { value: string; label: string }[] = [
    ...TASK_STATUSES.filter((s) => !isDeprecatedStatus(s)).map((s) => ({
      value: s as string,
      label: statusLabels[s] ?? s,
    })),
    // Pseudo-status: selecting it shows archived tasks (handled in
    // parseTaskFilters → filters.archived). Lets you reach the Archive from the
    // main Tasks list without leaving for the dedicated /archived page.
    { value: "archived", label: "Archived" },
  ];

  const isoDay = (d: Date | null) =>
    d ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <FilterBar
        employees={employeeOptions}
        subjects={subjects}
        statusOptions={statusOptions}
        clients={clients}
        me={{ id: me.id, isAdmin: me.isAdmin }}
        assigneeMode={filters.assigneeMode}
        taskCount={rows.length}
        initial={{
          start:  isoDay(filters.startDate),
          end:    isoDay(filters.endDate),
          emp:    filters.doerIds,
          view:   "doer",
          dept:   filters.departments,
          prio:   filters.priorities,
          subj:   filters.subjects,
          // Reflect the Archived pseudo-chip back into the picker when active.
          status: filters.archived ? [...filters.statuses, "archived"] : filters.statuses,
          client: filters.clients,
          overdue: filters.overdue,
          ageRange: filters.ageRange ? FINE_BUCKET_SLUGS[filters.ageRange] : null,
          team: filters.teams,
        }}
      />
      <TaskListPage
        title="Tasks"
        rows={rows}
        filters={filters}
        employees={allEmployees}
        me={{ id: me.id, isAdmin: me.isAdmin, canChangeDoer: mayChangeDoer }}
        statusLabels={statusLabels}
        statusTones={statusTones}
        subjects={subjects}
        clients={clients}
        weeklyGoals={weeklyGoals}
        metricsRows={scopeRows ?? rows}
        selectedTaskId={selectedTaskId}
        detail={
          selectedTaskId ? (
            // `key` is what makes arrowing down actually re-suspend: without it
            // React reuses the boundary and the pane would keep showing the
            // previous task until the new payload resolved.
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
          ) : null
        }
      />
    </>
  );
}
