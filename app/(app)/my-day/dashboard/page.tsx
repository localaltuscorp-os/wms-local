import { notFound } from "next/navigation";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { requireGoalsAccess } from "@/lib/goals/access";
import { goalsCascadeEnabled } from "@/lib/goals/flag";
import { DailyGoalsDashboard } from "@/components/my-day/dashboard/dashboard-view";
import { loadDailyGoalsDashboard } from "./data";

export const dynamic = "force-dynamic";

/**
 * DAILY GOALS -> DASHBOARD (`/my-day/dashboard`).
 *
 * A child of the Daily Goals planner and nothing else. It is reached from ONE
 * place — the Dashboard button on the planner's own header — and is deliberately
 * absent from the WMS rail, the Goals rail and every other module's chrome:
 *
 *     Daily Goals
 *       ├── My Daily Goals   (/my-day)
 *       └── Dashboard        (/my-day/dashboard)
 *
 * WHY IT LIVES UNDER `/my-day`: `workspaceForPath` (lib/workspaces.ts) owns
 * `/my-day*` for the WMS room, so this route keeps the sidebar exactly where the
 * planner left it — the same reason the planner itself is not at `/goals/plan`.
 * The plan gate in app/(app)/layout.tsx exempts everything under `/my-day`, so
 * the dashboard is reachable without first committing today's plan; that is
 * intended, since a manager opening the dashboard is not there to plan.
 *
 * Gates are the planner's, unchanged and re-asserted here rather than inherited
 * from a layout (layout gates read 200 on prod fetches): `goalsCascadeEnabled()`
 * 404s the route when the module is off, and `requireGoalsAccess()` applies the
 * same permission scope. WHOSE numbers you may read is then decided inside
 * `loadDailyGoalsDashboard` by the goals hierarchy — see its header comment.
 *
 * READ-ONLY: this page has no server actions and writes nothing. The planner at
 * /my-day, the WMS dashboard at /dashboard and the Goals module are untouched.
 */
export default async function DailyGoalsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { me, isAdmin } = await requireGoalsAccess();
  if (!goalsCascadeEnabled()) notFound();

  const sp = await searchParams;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const payload = await loadDailyGoalsDashboard(
    { id: me.id, name: me.name, isAdmin },
    {
      period: pick(sp.period),
      day: pick(sp.day),
      from: pick(sp.from),
      to: pick(sp.to),
      dept: pick(sp.dept),
      lead: pick(sp.lead),
      emp: pick(sp.emp),
      threshold: pick(sp.threshold),
    },
  );

  return (
    <>
      {/* The same white sheet the planner lays down, for the same reason: the
          app-wide `body` gradient in globals.css would otherwise wash this page
          too, and editing that rule would repaint every route in the app. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-white" />
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full" py={false} className="pt-3 pb-10 max-md:pt-2 max-md:pb-8">
        <DailyGoalsDashboard payload={payload} />
      </PageShell>
    </>
  );
}
