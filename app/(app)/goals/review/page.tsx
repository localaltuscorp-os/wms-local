import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { ReviewWorkbench } from "@/components/goals/review/review-workbench";
import { DailyScoreCard } from "@/components/goals/review/daily-score-card";
import { getDailyScore, type DailyScore } from "@/lib/queries/daily-score";
import { ReviewControls } from "@/components/goals/review/review-controls";
import { fyLabel } from "@/components/goals/cascade/util";
import { loadReviewData } from "./review-data";

export const dynamic = "force-dynamic";

/**
 * Review & Scores — the per-level review workbench for the Goals module.
 * Person-scoped (?emp=) and FY-scoped (?fy=) via loadReviewData, which unifies
 * ALL five planning levels (Daily / Weekly / Monthly / Quarterly / Yearly) into
 * one ReviewItem shape. Each goal is reviewed with % Done (self), Approved %Done
 * (manager / management) and Approver Notes. Available to anyone with Goals
 * access; the self vs approve verbs gate on canWrite / canReview.
 */
export default async function GoalsReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ emp?: string; fy?: string }>;
}) {
  const sp = await searchParams;
  const data = await loadReviewData({ emp: sp.emp, fy: sp.fy });
  // Scored for the person being REVIEWED, so a manager viewing someone else's
  // board sees that person's day, not their own.
  let score: DailyScore | null = null;
  try {
    score = await getDailyScore(data.viewedEmployeeId ?? data.myEmployeeId);
  } catch {
    score = null;
  }

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
          <ReviewControls
            roster={data.roster}
            viewedEmployeeId={data.viewedEmployeeId}
            viewedName={data.viewedName}
            myEmployeeId={data.myEmployeeId}
            fyStartYear={data.fyStartYear}
          />
        </header>

        {/* Sir's DAILY SCORE — planned-vs-closed, the fresh/carried split, and
            the average gap between a task's original due date and when it was
            actually finished. Best-effort: the workbench must still render if
            the score query fails. */}
        {score && <DailyScoreCard score={score} />}
        <ReviewWorkbench data={data} />
      </PageShell>
    </>
  );
}
