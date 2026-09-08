import { notFound, redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { goalsCascadeEnabled, goalsCanvasOn } from "@/lib/goals/flag";
import { istYmd } from "@/lib/weekly-goals/week";
import { loadGoalsDashboardData } from "./data";
import { GoalsOverviewDashboard } from "@/components/goals/dashboard/goals-overview-dashboard";

export const dynamic = "force-dynamic";

/**
 * GOALS DASHBOARD — one read of the whole cascade.
 *
 * The module already had a Dashboard, but it is a TAB on each level board and
 * only ever sees that board's level: open Quarterly's and it reports on
 * quarters. Nothing answered "how is the cascade doing" without opening five
 * pages and holding the numbers in your head.
 *
 * This is that page. Same gates as the level pages, because it is the same
 * data under a wider lens — `goalsCascadeEnabled` kills the module, and
 * `goalsCanvasOn` is what the level boards this reports on require, so it
 * would be reporting on pages nobody can open without it.
 */
export default async function GoalsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!goalsCascadeEnabled()) notFound();
  if (!goalsCanvasOn()) redirect("/goals");

  const sp = await searchParams;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  /* ONE clock read, taken here and threaded down. Pace maths (`deriveHealth`,
     `expectedPct`) is a function of "now", so a component calling `new Date()`
     for itself would let two panels disagree about what today is — and would
     make the server and client renders differ. */
  const now = new Date();

  const data = await loadGoalsDashboardData(
    {
      emp: pick(sp.emp),
      // The multiselect. Re-validated against the viewer's roster inside the
      // loader — this is a URL parameter, so it is whatever the caller typed.
      emps: pick(sp.emps),
      fy: pick(sp.fy),
      from: pick(sp.from),
      to: pick(sp.to),
    },
    istYmd(now),
  );

  return (
    <>
      <DashboardHeader generatedAt={now} />
      <main className="flex w-full flex-1 flex-col">
        <GoalsOverviewDashboard data={data} nowIso={now.toISOString()} />
      </main>
    </>
  );
}
