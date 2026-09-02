import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";
import { requireHrStaff } from "@/lib/hr/access";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { loadHiringAnalytics, type HiringAnalytics } from "@/lib/hr/candidate/analytics-data";
import { HiringAnalyticsDashboard } from "@/components/hr/candidate/analytics/hiring-analytics-dashboard";
import { HrShellSidebar } from "@/components/hr/hr-shell-sidebar";

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
    <div className="flex min-h-dvh">
      <HrShellSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
      <DashboardHeader generatedAt={generatedAt} />
      <PageShell width="standard" py={false} className="pt-8 pb-20">
        <Link
          href={"/hr?open=pre-interview" as Route}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted transition hover:text-ink-strong"
        >
          <ArrowLeft size={15} /> Back to HR
        </Link>

        <header className="mb-7">
          <h1
            className="text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}
          >
            Hiring Analytics
          </h1>
        </header>

        <HiringAnalyticsDashboard data={data} />
      </PageShell>
      </div>
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
