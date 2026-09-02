import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { ReviewWorkbench } from "@/components/goals/review/review-workbench";
import { ReviewControls } from "@/components/goals/review/review-controls";
import { fyLabel } from "@/components/goals/cascade/util";
import { loadReviewData } from "@/app/(app)/goals/review/review-data";

export const dynamic = "force-dynamic";

/**
 * WMS · Review & Scores — the SAME workbench as Goals › Review (`/goals/review`).
 *
 * Not a second review system: this page renders the identical `ReviewWorkbench`
 * over the identical `loadReviewData` payload and writes through the identical
 * `submitReview` action, so a score set here and a score set in Goals are one
 * row in one table. Person-scoped (?emp=) and FY-scoped (?fy=) exactly as there.
 *
 * WHY A WMS-OWNED PATH: `workspaceForPath` (lib/workspaces.ts) owns `/goals*`
 * for the GOALS room, so a WMS nav entry pointing at `/goals/review` would flip
 * the sidebar to Goals the moment you clicked it. `/review` keeps the room you
 * are in — the same reason `/my-day` exists alongside `/goals/plan`.
 *
 * Access is unchanged: `loadReviewData` calls `requireGoalsAccess()` itself, and
 * the self vs approve verbs still gate on canWrite / canReview inside the
 * workbench. Mounting it here widens the doors, never the permissions.
 */
export default async function WmsReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ emp?: string; fy?: string }>;
}) {
  const sp = await searchParams;
  const data = await loadReviewData({ emp: sp.emp, fy: sp.fy });

  const isSelf = data.viewedEmployeeId === data.myEmployeeId;

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="full">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1
              className="text-ink-strong"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 32 }}
            >
              Review &amp; Scores
            </h1>
            <p className="mt-1 text-[14.5px] text-ink-muted">
              % Done, approved score &amp; approver notes for{" "}
              <span className="font-bold text-ink-soft">{isSelf ? "your" : `${data.viewedName}'s`}</span> goals ·{" "}
              {fyLabel(data.fyStartYear)}
            </p>
          </div>
          {/* basePath keeps the FY stepper and the "Reviewing" picker on THIS
              route — pushing /goals/review would hand the room over to Goals. */}
          <ReviewControls
            roster={data.roster}
            viewedEmployeeId={data.viewedEmployeeId}
            viewedName={data.viewedName}
            myEmployeeId={data.myEmployeeId}
            fyStartYear={data.fyStartYear}
            basePath="/review"
          />
        </header>

        <ReviewWorkbench data={data} />
      </PageShell>
    </>
  );
}
