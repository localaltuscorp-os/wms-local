import { requireHrStaff } from "@/lib/hr/access";
import { DashboardHeader } from "@/components/layout/header";
import { HrTitleBar } from "@/components/hr/console/hr-title-bar";
import { PageShell } from "@/components/layout/page-shell";
import { loadHiringAnalytics, type HiringAnalytics } from "@/lib/hr/candidate/analytics-data";
import { HiringAnalyticsDashboard } from "@/components/hr/candidate/analytics/hiring-analytics-dashboard";

export const dynamic = "force-dynamic";

/**
 * HIRING ANALYTICS — the executive read-out for the Interview Intelligence
 * Platform. HR-staff only. One data load (loadHiringAnalytics) computes 18
 * metrics off the candidate_intake table + eval-v2 scoring core; the client
 * dashboard renders the pipeline, funnels, skill distributions and trends.
 */
export default async function HiringAnalyticsPage() {
  await requireHrStaff();

  // Resilient: a slow/failed load must never hard-crash the page — fall back to
  // the empty analytics shape (renders sensible empty-states).
  let data: HiringAnalytics;
  try {
    data = await loadHiringAnalytics();
  } catch {
    data = emptyFallback();
  }

  const generatedAt = new Date(data.generatedAt);

  return (
    <div className="flex min-h-full flex-col">
      <DashboardHeader generatedAt={generatedAt} />
      <HrTitleBar />
      <PageShell width="standard" py={false} className="pt-8 pb-20">
        <HiringAnalyticsDashboard data={data} />
      </PageShell>
    </div>
  );
}

function emptyFallback(): HiringAnalytics {
  return {
    generatedAt: new Date().toISOString(),
    totalCandidates: 0,
    totalInterviews: 0,
    hasEvaluations: false,
    pipeline: { new: 0, shortlisted: 0, rejected: 0, hired: 0 },
    pipelineTotal: 0,
    decided: 0,
    hired: 0,
    rejected: 0,
    hireRate: null,
    rejectRate: null,
    avgInterviewScore: null,
    avgCandidateRating: null,
    topInterviewers: [],
    funnel: [],
    technicalSkills: [],
    behaviouralSkills: [],
    sectionAverages: [],
    rejectionReasons: [],
    sources: [],
    sourcesAvailable: false,
    avgCompletionHours: null,
    completionSamples: 0,
    trend: [],
    offerAcceptanceRate: null,
    offered: 0,
    accepted: 0,
    flaggedForReview: 0,
  };
}
