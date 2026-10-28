import { DashboardHeader } from "@/components/layout/header";
import { FilterBar } from "@/components/layout/filter-bar";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { InitiatorKanbanBoard } from "@/components/tasks/initiator-kanban-board";
import { DOER_STATUSES, isStatusAxis, type StatusAxis } from "@/lib/status/axes";
import { listBoardTasks, listDistinctSubjects } from "@/lib/queries/tasks";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listActiveClientNames } from "@/lib/queries/clients";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { getOrgSettings } from "@/lib/queries/org-settings";
import { parseTaskFilters } from "@/lib/task-filters";
import { requireUser } from "@/lib/auth/current";
import {
  resolveAdminColumnOrder,
  USER_COLUMN_ORDER,
} from "@/lib/kanban-columns";
import { defaultScopeId, opensOnEveryone } from "@/lib/auth/default-scope";
import { TASK_STATUSES, isDeprecatedStatus } from "@/db/enums";
import type { TaskStatus, StatusColorToken } from "@/db/enums";
import Link from "next/link";
import type { Route } from "next";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function KanbanPage({ searchParams }: PageProps) {
  const me = await requireUser();

  // THE ADMIN-ONLY GATE IS GONE (Manan, 2026-09-14: "every user should be able
  // to see his kanban view"). It used to `redirect("/tasks")` for anyone who
  // was not an admin, on the reasoning that doers work from the list.
  //
  // What replaces it is a SCOPE, not a door: a non-admin lands on their own
  // board. `parseTaskFilters` already resolves `assigneeMode`, so the narrowing
  // is done the same way the list view does it — by defaulting the doer filter
  // to themselves when they have not asked for someone else — rather than by a
  // second, board-only rule that could disagree with the list about who may see
  // what. Admins keep the everyone view they had.
  const sp = await searchParams;
  /* Was `{}` — every viewer's board opened on the WHOLE COMPANY, including a
     team member who can only see their own rows everywhere else. The board is
     the task list in another shape; it defaults the same way now. */
  const filters = parseTaskFilters(sp, /*archived*/ false, {
    defaultDoerId: defaultScopeId(me),
  });

  // FilterBar owns the page-wide View switch as `view`; keep `axis` only for
  // backwards-compatible Kanban links.
  const axisParam =
    typeof sp.view === "string"
      ? sp.view
      : typeof sp.axis === "string"
        ? sp.axis
        : undefined;
  const axis: StatusAxis = isStatusAxis(axisParam) ? axisParam : "doer";

  const [tasks, statusDisplay, employees, org, subjects, clients] =
    await Promise.all([
      listBoardTasks(filters),
      getStatusDisplayMap(),
      listEmployeeOptions(),
      getOrgSettings(),
      listDistinctSubjects(),
      listActiveClientNames(),
    ]);
  const labels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;
  const tones = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.color]),
  ) as Record<TaskStatus, StatusColorToken>;

  // Admins see the admin-configurable order; everyone else the curated list.
  const columnOrder = me.isAdmin
    ? resolveAdminColumnOrder(org.boardColumnOrder)
    : USER_COLUMN_ORDER;

  const employeeOptions = employees.map((e) => ({ value: e.id, label: e.name }));
  const statusOptions = (axis === "doer"
    ? DOER_STATUSES
    : TASK_STATUSES.filter((s) => !isDeprecatedStatus(s))
  ).map((s) => ({
    value: s,
    label: labels[s] ?? s,
  }));
  const isoDay = (d: Date | null) =>
    d ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <FilterBar
        key={axis}
        employees={employeeOptions}
        subjects={subjects}
        statusOptions={statusOptions}
        clients={clients}
        me={{ id: me.id, isAdmin: me.isAdmin, isSuperAdmin: opensOnEveryone(me) }}
        offersScopeChoice
        assigneeMode={filters.assigneeMode}
        statusAxis={axis}
        initial={{
          start:  isoDay(filters.startDate),
          end:    isoDay(filters.endDate),
          emp:    filters.doerIds,
          view:   axis,
          dept:   filters.departments,
          prio:   filters.priorities,
          subj:   filters.subjects,
          status: filters.statuses,
          initiatorStatus: filters.initiatorStatuses,
          client: filters.clients,
        }}
      />
      {/* The KPI strip is portaled here by the active board so it sits outside
          the rounded Kanban panel, in the same page-level position as Tasks. */}
      <div className="w-full px-6 max-md:px-4 pt-4">
        <div id="kanban-kpi-strip" />
      </div>
      <main className="w-full px-6 max-md:px-4 pt-6 pb-10">
        {/* Full-bleed white canvas; status colour lives in the columns.

            SOLID WHITE, NOT A GRADIENT. This was
            `linear-gradient(150deg, #ffffff 0%, #ffffff 60%, #fff7f6 100%)` —
            two white stops and a peach one, so the panel faded to #fff7f6 down
            its bottom-right corner. That is the tint behind the header, and at
            56px of blur it read as a stain on the page rather than as shading.

            The drop shadow went with it: it was `rgba(225,6,0,0.20)`, the brand
            red at 20%, which is a pink halo under all four edges. Slate at the
            same weight gives the panel the same lift with no hue. */}
        <section
          className="relative overflow-hidden rounded-section border border-hairline bg-white p-5 max-md:p-4"
          style={{
            boxShadow:
              "0 1px 2px rgba(15,23,42,0.04), 0 24px 56px -40px rgba(15,23,42,0.20)",
          }}
        >
          {/* Brand strip only. The "soft red wash" that used to sit beside it
              here — a 360px radial of altus-red at 8%, bled off the top-right
              corner — is gone: a pink haze behind the header is exactly the
              tint this page was asked to drop. The 3px rule stays, because it
              is a crisp brand rule rather than a wash, and it is the WMS
              identity on this screen. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0"
            style={{
              height: 3,
              background:
                "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep) 55%, transparent)",
            }}
          />
          {/* The "Kanban View" heading that used to be centred here is gone —
              the top bar already says "Kanban" on this route.

              With it gone the row is `justify-end` and the link is IN FLOW.
              It was absolutely positioned only to escape the centred heading;
              left as-is it would have been a floating button over an empty
              header, and `absolute` inside a row with nothing else in it has no
              height to be centred against. */}
          <header className="wg-rise relative mb-4 flex items-center justify-end gap-3">
            <Link
              href={"/tasks" as Route}
              className="wg-btn inline-flex items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-4 h-9 text-[13.5px] font-bold text-ink-soft hover:text-ink-strong hover:border-hairline-strong transition-colors"
              style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}
            >
              List View →
            </Link>
          </header>
          <div className="relative">
            {axis === "doer" ? (
              <KanbanBoard
                tasks={tasks}
                labels={labels}
                tones={tones}
                isAdmin={me.isAdmin}
                columnOrder={columnOrder}
                kpiPortalTarget="kanban-kpi-strip"
              />
            ) : (
              /* The same tasks, re-columned by Initiator Status. */
              <InitiatorKanbanBoard
                me={{ id: me.id, isAdmin: me.isAdmin }}
                kpiPortalTarget="kanban-kpi-strip"
                cards={tasks.map((t) => ({
                  id: t.id,
                  taskNo: t.taskNo,
                  title: t.title,
                  description: t.description,
                  client: t.client,
                  subject: t.subject,
                  status: t.status,
                  approvalStatus: t.approvalStatus,
                  archived: t.archived,
                  dueAt: t.dueAt,
                  doerId: t.doerId,
                  doerName: t.doerName ?? "Unassigned",
                  initiatorId: t.initiatorId,
                  updatedAt: t.updatedAt,
                }))}
              />
            )}
          </div>
        </section>
      </main>
    </>
  );
}
