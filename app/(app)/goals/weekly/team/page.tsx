import { eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireUser } from "@/lib/auth/current";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { db, employees } from "@/lib/db";
import { teamScopeFor, teamPerformance, deriveTeamStatus } from "@/lib/queries/team-performance";
import { TZ } from "@/lib/weekly-goals/week";
import { TeamPerformanceBoard, type TeamRow } from "@/components/goals/team/team-performance-board";

export const dynamic = "force-dynamic";

function timeLabel(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

/**
 * WMS · Goals · Team Dashboard.
 *
 * A management overview of the whole team: one compact row per person, sorted
 * needs-attention-first, with the full per-employee report behind an inline
 * expander. It replaced a two-column grid of large cards that rendered every
 * metric for everyone — complete, but impossible to compare across at 36+ people.
 *
 * The data layer is untouched: the same `teamScopeFor` roster (which enforces
 * the admin → downline → self permission scope) and the same batched
 * `teamPerformance` snapshot the mobile API reads. The only addition is a
 * page-local manager lookup for the "Team" filter — kept here rather than in
 * `lib/queries/team-performance` so the shared query and `/api/mobile/team/
 * performance` keep their exact current shape.
 */
export default async function TeamPerformancePage() {
  const me = await requireUser();
  const roster = await teamScopeFor(me);
  const perf = await teamPerformance(roster.map((r) => r.id));

  // "Team" in this data set is the reporting line — there is no team entity, so
  // the filter groups by the manager each person reports to.
  const manager = alias(employees, "manager");
  const managerRows =
    roster.length === 0
      ? []
      : await db
          .select({ id: employees.id, managerName: manager.name })
          .from(employees)
          .leftJoin(manager, eq(employees.managerId, manager.id))
          .where(inArray(employees.id, roster.map((r) => r.id)));
  const managerById = new Map(managerRows.map((r) => [r.id, r.managerName]));

  const rows: TeamRow[] = roster.map((m) => {
    const p = perf.get(m.id);
    return {
      id: m.id,
      name: m.name,
      department: m.department,
      managerName: managerById.get(m.id) ?? null,
      goalsCount: p?.goalsCount ?? 0,
      goalsDone: p?.goalsDone ?? 0,
      goalScorePct: p?.goalScorePct ?? null,
      assignedToday: p?.assignedToday ?? 0,
      overdueTasks: p?.overdueTasks ?? 0,
      pendingTasks: p?.pendingTasks ?? 0,
      needHelp: p?.needHelp ?? 0,
      blockedTasks: p?.blockedTasks ?? 0,
      doneToday: p?.doneToday ?? 0,
      plannedToday: p?.plannedToday ?? false,
      dccCompliancePct: p?.dccCompliancePct ?? null,
      trainingHoursMonth: p?.trainingHoursMonth ?? 0,
      lastInLabel: timeLabel(p?.lastInAt ?? null),
      lastOutLabel: timeLabel(p?.lastOutAt ?? null),
      status: deriveTeamStatus(p),
    };
  });

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell as="main" width="full" py={false} className="pt-7 pb-12 max-md:pt-5 max-md:pb-8">
        <header className="mb-5">
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 800,
              fontSize: "clamp(22px, 2vw, 32px)",
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            Team Performance
          </h1>
          <p className="mt-1 text-[13.5px] font-medium text-ink-muted">
            Monitor team performance, workload, goals and blockers.
          </p>
        </header>

        <TeamPerformanceBoard rows={rows} />
      </PageShell>
    </>
  );
}
