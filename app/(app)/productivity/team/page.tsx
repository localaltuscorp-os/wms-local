import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { db, employees, departments } from "@/lib/db";
import { getProductivityViewer, productivityScopeFor } from "@/lib/productivity/access";
import { teamPerformance, deriveTeamStatus } from "@/lib/queries/team-performance";
import { TZ } from "@/lib/weekly-goals/week";
import { TeamPerformanceBoard, type TeamRow } from "@/components/goals/team/team-performance-board";

export const dynamic = "force-dynamic";

/**
 * Productivity Dashboard · Team Performance — the manager/admin overview, and
 * the way into anyone else's dashboard.
 *
 * REUSED WHOLESALE, not rebuilt: the table, its filters, its sort and its
 * search are the existing `TeamPerformanceBoard`, and the metrics are the
 * existing batched `teamPerformance` snapshot. The only thing this module
 * changes is what selecting a row MEANS — `variant="productivity"` sends the
 * click to that person's Productivity Dashboard instead of unfolding a summary.
 * One board, two destinations, no second implementation to keep in step.
 *
 * SCOPE comes from `productivityScopeFor`, deliberately NOT the Goals board's
 * `teamScopeFor`. This module's rule is direct reports (admins: everyone), and
 * `canViewProductivityOf` enforces exactly that on the dashboard the rows open.
 * Listing anyone the drill-down would then refuse is a broken link with extra
 * steps, so the list and the gate read from the same rule.
 *
 * An employee has an empty scope and simply cannot open this page — 404, not a
 * visible-but-empty table, so the surface never advertises itself to people who
 * have no business on it.
 */
export default async function ProductivityTeamPerformancePage() {
  const viewer = await getProductivityViewer();
  if (!viewer.isAdmin && !viewer.isManager) notFound();

  const roster = await productivityScopeFor(viewer);
  const ids = roster.map((r) => r.id);
  const perf = await teamPerformance(ids);

  // Department + reporting line for the board's two filter vocabularies. Kept
  // page-local (as the Goals page does) so the shared roster query and the
  // mobile API keep their exact current shapes.
  const manager = alias(employees, "prod_team_mgr");
  const contextRows =
    ids.length === 0
      ? []
      : await db
          .select({
            id: employees.id,
            managerName: manager.name,
            departmentName: departments.name,
            departmentLegacy: employees.department,
          })
          .from(employees)
          .leftJoin(manager, eq(employees.managerId, manager.id))
          .leftJoin(departments, eq(employees.departmentId, departments.id))
          .where(inArray(employees.id, ids));
  const contextById = new Map(contextRows.map((r) => [r.id, r]));

  const rows: TeamRow[] = roster.map((m) => {
    const p = perf.get(m.id);
    const ctx = contextById.get(m.id);
    return {
      id: m.id,
      name: m.name,
      department: ctx?.departmentName ?? ctx?.departmentLegacy ?? null,
      managerName: ctx?.managerName ?? null,
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
      <PageShell as="main" width="full" py={false} className="pt-7 pb-14 max-md:pt-5 max-md:pb-10">
        <header className="mb-6">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
            Productivity Dashboard
          </div>
          <h1
            className="mt-0.5 text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 800,
              fontSize: "clamp(22px, 2.2vw, 30px)",
              letterSpacing: "-0.025em",
              lineHeight: 1.08,
            }}
          >
            Team Performance
          </h1>
          <p className="mt-1.5 text-[13px] font-medium text-ink-muted">
            {viewer.isAdmin
              ? "Select anyone to open their full Productivity Dashboard."
              : "Select a direct report to open their full Productivity Dashboard."}
          </p>
        </header>

        <TeamPerformanceBoard rows={rows} variant="productivity" />
      </PageShell>
    </>
  );
}

function timeLabel(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}
