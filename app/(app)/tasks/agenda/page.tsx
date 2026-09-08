import { DashboardHeader } from "@/components/layout/header";
import { DashboardFooter } from "@/components/layout/footer";
import { FilterBar } from "@/components/layout/filter-bar";
import { MyDayWorkspace } from "@/components/tasks/my-day-workspace";
import type { AgendaTask } from "@/components/tasks/agenda-board";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listTasks, listDistinctSubjects } from "@/lib/queries/tasks";
import { listActiveClientNames } from "@/lib/queries/clients";
import { parseTaskFilters } from "@/lib/task-filters";
import { isDoneLate } from "@/lib/task-late";
import { requireUser } from "@/lib/auth/current";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { TASK_STATUSES, isDeprecatedStatus } from "@/db/enums";
import type { TaskStatus, StatusColorToken } from "@/db/enums";

export const dynamic = "force-dynamic";

const TZ = "Asia/Kolkata";

/** yyyy-mm-dd for a Date in IST. */
function istYmd(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AgendaPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const me = await requireUser();
  // "My Day" scopes to the signed-in user by default (admins too); the same
  // FilterBar as the Tasks tab can widen/redirect it from there.
  const filters = parseTaskFilters(sp, /*archived*/ false, { defaultDoerId: me.id });

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

  const employeeOptions = allEmployees.map((e) => ({ value: e.id, label: e.name }));

  const statusOptions = TASK_STATUSES.filter((s) => !isDeprecatedStatus(s)).map((s) => ({
    value: s,
    label: statusLabels[s] ?? s,
  }));

  // Agenda-card shape derived from the same filtered rows the List view uses,
  // so both views always agree. The board buckets these by IST due-day.
  const agendaTasks: AgendaTask[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    subject: r.subject,
    description: r.description,
    dueYmd: istYmd(r.dueAt),
    late: isDoneLate({ status: r.status, completedAt: r.completedAt, dueAt: r.dueAt }),
  }));

  const now = new Date();
  const todayYmd = istYmd(now);
  const days = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const ymd = istYmd(d);
    const label =
      i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ });
    const sub = d.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: TZ });
    return { ymd, label, sub };
  });

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
          status: filters.statuses,
          client: filters.clients,
        }}
      />
      <MyDayWorkspace
        firstName={me.name.split(" ")[0] ?? me.name}
        isAdmin={me.isAdmin}
        todayYmd={todayYmd}
        days={days}
        agendaTasks={agendaTasks}
        rows={rows}
        employees={allEmployees}
        me={{ id: me.id, isAdmin: me.isAdmin }}
        statusLabels={statusLabels}
        statusTones={statusTones}
      />
      <DashboardFooter />
    </>
  );
}
