import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { FilterBar } from "@/components/layout/filter-bar";
import { TaskListPage } from "@/components/tasks/task-list-page";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listTasks, listDistinctSubjects } from "@/lib/queries/tasks";
import { listActiveClientNames } from "@/lib/queries/clients";
import { parseTaskFilters } from "@/lib/task-filters";
import { requireUser } from "@/lib/auth/current";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { TASK_STATUSES, isDeprecatedStatus } from "@/db/enums";
import type { TaskStatus, StatusColorToken } from "@/db/enums";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TasksPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const me = await requireUser();
  // Non-admins default to "assigned to me" when no explicit ?emp= is set.
  const filters = parseTaskFilters(sp, /*archived*/ false, {
    defaultDoerId: me.isAdmin ? undefined : me.id,
  });

  const [allEmployees, rows, subjects, clients, statusDisplay] = await Promise.all([
    listEmployeeOptions(),
    listTasks(filters),
    listDistinctSubjects(),
    listActiveClientNames(),
    getStatusDisplayMap(),
  ]);

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
        }}
      />
      <TaskListPage
        title="Tasks"
        rows={rows}
        filters={filters}
        employees={allEmployees}
        me={{ id: me.id, isAdmin: me.isAdmin }}
        statusLabels={statusLabels}
        statusTones={statusTones}
        subjects={subjects}
        clients={clients}
      />
      <DashboardFooter />
    </>
  );
}
