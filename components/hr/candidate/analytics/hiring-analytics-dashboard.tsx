"use client";

import * as React from "react";
import {
  Users,
  Trophy,
  Cpu,
  HeartHandshake,
  Layers,
  ThumbsDown,
  Radio,
  CalendarRange,
  Gauge as GaugeIcon,
  ListChecks,
  Target,
} from "lucide-react";
import { AttainmentRing } from "@/components/dashboard/exec/viz/attainment-ring";
import type { HiringAnalytics } from "@/lib/hr/candidate/analytics-data";
import { KpiHero, type HeroStat } from "./kpi-hero";
import {
  ChartCard,
  EmptyState,
  PipelineDonut,
  FunnelBars,
  SkillDistribution,
  SectionAverages,
  InterviewerList,
  ReasonList,
  SourceList,
  MonthlyTrend,
  band100,
} from "./analytics-charts";

const GREEN = { c: "var(--color-green)", d: "var(--color-green-deep)" };
const RED = { c: "var(--color-altus-red)", d: "var(--color-altus-red-deep)" };
const AMBER = { c: "var(--color-amber)", d: "var(--color-amber-deep)" };
const TEAL = { c: "var(--color-teal)", d: "var(--color-teal-deep)" };
const INDIGO = { c: "var(--color-indigo, #6366f1)", d: "var(--color-indigo-deep, #4338ca)" };

function fmtHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export function HiringAnalyticsDashboard({ data }: { data: HiringAnalytics }) {
  const heroStats: HeroStat[] = [
    { key: "total", label: "Total Interviews", value: data.totalInterviews, sublabel: `${data.totalCandidates} candidate${data.totalCandidates === 1 ? "" : "s"} on file`, accent: INDIGO.c, accentDeep: INDIGO.d },
    { key: "hire", label: "Hire Rate", value: data.hireRate, suffix: "%", sublabel: data.decided > 0 ? `${data.hired}/${data.decided} decided` : "no decisions yet", accent: GREEN.c, accentDeep: GREEN.d },
    { key: "reject", label: "Reject Rate", value: data.rejectRate, suffix: "%", sublabel: data.decided > 0 ? `${data.rejected}/${data.decided} decided` : "no decisions yet", accent: RED.c, accentDeep: RED.d },
    { key: "score", label: "Avg Interview Score", value: data.avgInterviewScore, suffix: "/100", sublabel: "weighted composite", accent: band100(data.avgInterviewScore).color, accentDeep: band100(data.avgInterviewScore).deep },
    { key: "rating", label: "Avg Candidate Rating", value: data.avgCandidateRating, suffix: "/10", sublabel: "interviewer gut call", decimals: 1, accent: AMBER.c, accentDeep: AMBER.d },
    { key: "pipeline", label: "In Pipeline", value: data.pipelineTotal, sublabel: `${data.pipeline.new} new · ${data.pipeline.shortlisted} shortlisted`, accent: TEAL.c, accentDeep: TEAL.d },
  ];

  return (
    <div className="flex flex-col gap-6">
      <KpiHero stats={heroStats} />

      {!data.hasEvaluations && (
        <div className="rounded-section border border-solid border-hairline-strong bg-surface-soft px-6 py-5">
          <p className="text-[14px] font-semibold text-ink-strong">Analytics warm up as interviews are evaluated.</p>
          <p className="mt-1 text-[13px] font-medium text-ink-muted">
            Pipeline and role figures are live from {data.totalCandidates} candidate record{data.totalCandidates === 1 ? "" : "s"}. Score-based charts populate once the Candidate Evaluation is filled.
          </p>
        </div>
      )}

      {/* Row 1 — Pipeline donut + score rings */}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <ChartCard title="Candidate Pipeline" subtitle="Every candidate by current stage" icon={<Layers size={18} strokeWidth={2.2} />}>
          <PipelineDonut slices={data.pipeline} />
        </ChartCard>

        <ChartCard title="Scores at a Glance" subtitle="Interview quality & offer conversion" icon={<GaugeIcon size={18} strokeWidth={2.2} />}>
          <div className="flex flex-wrap items-start justify-around gap-6">
            <RingStat label="Avg Score" value={data.avgInterviewScore} max={100} caption="of 100" />
            <RingStat
              label="Offer Acceptance"
              value={data.offerAcceptanceRate}
              max={100}
              caption={data.offered > 0 ? `${data.accepted}/${data.offered} joined` : "approx"}
            />
          </div>
          <p className="mt-4 text-[11.5px] font-medium leading-relaxed text-ink-muted">
            Offer acceptance is approximated as hired ÷ (shortlisted + hired) — the pipeline has no explicit “offered” stage.
          </p>
        </ChartCard>
      </div>

      {/* Row 2 — Monthly trend (full width) */}
      <ChartCard title="Interview Trend by Month" subtitle="Volume of interviews and average score over time" icon={<CalendarRange size={18} strokeWidth={2.2} />}>
        <MonthlyTrend points={data.trend} />
      </ChartCard>

      {/* Row 3 — Funnel + section averages */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Role-wise Hiring Funnel" subtitle="Candidates and hire rate per position applied" icon={<Target size={18} strokeWidth={2.2} />}>
          <FunnelBars rows={data.funnel} />
        </ChartCard>
        <ChartCard title="Avg Evaluation Scores" subtitle="Mean micro score per evaluation section (0–10)" icon={<ListChecks size={18} strokeWidth={2.2} />}>
          <SectionAverages sections={data.sectionAverages} />
        </ChartCard>
      </div>

      {/* Row 4 — Technical + behavioural distributions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Technical Skill Distribution" subtitle="Average proficiency across candidates (0–10)" icon={<Cpu size={18} strokeWidth={2.2} />}>
          <SkillDistribution skills={data.technicalSkills} />
        </ChartCard>
        <ChartCard title="Behavioural Skill Distribution" subtitle="Average base-expectation ratings (0–10)" icon={<HeartHandshake size={18} strokeWidth={2.2} />}>
          <SkillDistribution skills={data.behaviouralSkills} />
        </ChartCard>
      </div>

      {/* Row 5 — Interviewers + rejection reasons */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Top Interviewers" subtitle="By interviews conducted, with average candidate score" icon={<Trophy size={18} strokeWidth={2.2} />}>
          <InterviewerList people={data.topInterviewers} />
        </ChartCard>
        <ChartCard title="Most Common Rejection Reasons" subtitle="From evaluation notes on rejected candidates" icon={<ThumbsDown size={18} strokeWidth={2.2} />}>
          <ReasonList reasons={data.rejectionReasons} />
        </ChartCard>
      </div>

      {/* Row 6 — Sources + completion time */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <ChartCard title="Top Hiring Sources" subtitle="Where candidates heard about the opening" icon={<Radio size={18} strokeWidth={2.2} />}>
          {data.sourcesAvailable ? <SourceList sources={data.sources} /> : <EmptyState label="No hiring-source data captured on the intake form yet." />}
        </ChartCard>
        <ChartCard title="Interview Completion Time" subtitle="Avg time from form start to submission" icon={<Users size={18} strokeWidth={2.2} />}>
          {data.avgCompletionHours != null ? (
            <div className="flex h-full flex-col items-center justify-center py-4">
              <span
                className="tabular-nums leading-none text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(44px,5vw,64px)", letterSpacing: "-0.03em" }}
              >
                {fmtHours(data.avgCompletionHours)}
              </span>
              <span className="mt-2 text-[12.5px] font-semibold text-ink-muted">
                across {data.completionSamples} completed form{data.completionSamples === 1 ? "" : "s"}
              </span>
            </div>
          ) : (
            <EmptyState label="No completed forms with timing data yet." />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function RingStat({ label, value, max, caption }: { label: string; value: number | null; max: number; caption: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {value != null ? (
        <AttainmentRing value={value} max={max} size={150} />
      ) : (
        <div className="flex size-[150px] items-center justify-center rounded-full border-2 border-solid border-hairline-strong">
          <span className="text-[13px] font-semibold text-ink-muted">No Data</span>
        </div>
      )}
      <span className="font-bold text-ink-strong" style={{ fontSize: 14 }}>{label}</span>
      <span className="text-[12px] font-medium text-ink-muted">{caption}</span>
    </div>
  );
}
