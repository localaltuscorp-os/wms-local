import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { FilterBar } from "@/components/layout/filter-bar";
import { TaskListPage } from "@/components/tasks/task-list-page";
import { listEmployees } from "@/lib/queries/employees";
import { listTasks, listDistinctSubjects } from "@/lib/queries/tasks";
import { parseTaskFilters } from "@/lib/task-filters";
import { requireUser } from "@/lib/auth/current";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import { redirect } from "next/navigation";
import type { Route } from "next";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ArchivedPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const me = await requireUser();
  // Archiving is admin-only, so the archive view is too — a doer who types the
  // URL is sent back to their task list.
  if (!me.isAdmin) redirect("/tasks" as Route);
  // Non-admins default to "assigned to me" when no explicit ?emp= is set.
  const filters = parseTaskFilters(sp, /*archived*/ true, {
    defaultDoerId: me.isAdmin ? undefined : me.id,
  });

  const [allEmployees, rows, subjects, statusDisplay] = await Promise.all([
    listEmployees(),
    listTasks(filters),
    listDistinctSubjects(),
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

  const isoDay = (d: Date | null) =>
    d ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <FilterBar
        employees={employeeOptions}
        subjects={subjects}
        me={{ id: me.id, isAdmin: me.isAdmin }}
        assigneeMode={filters.assigneeMode}
        initial={{
          start: isoDay(filters.startDate),
          end:   isoDay(filters.endDate),
          emp:   filters.doerIds,
          view:  "doer",
          dept:  filters.departments,
          prio:  filters.priorities,
          subj:  filters.subjects,
        }}
      />
      <TaskListPage
        title="Archived"
        rows={rows}
        filters={filters}
        basePath="/archived"
        employees={allEmployees.map((e) => ({ id: e.id, name: e.name }))}
        me={{ id: me.id, isAdmin: me.isAdmin }}
        statusLabels={statusLabels}
        statusTones={statusTones}
        subjects={subjects}
      />
      <DashboardFooter />
    </>
  );
}
