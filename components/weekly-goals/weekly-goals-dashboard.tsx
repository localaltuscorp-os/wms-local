"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { Trophy, Medal, Award, ArrowLeft, Crown } from "lucide-react";
import type { EmployeeRanking, GlobalRanking, WeekTrendPoint } from "@/lib/queries/weekly-goals";
import { formatWeekShort } from "@/lib/weekly-goals/week";

type Period = "week" | "month" | "year";

interface Props {
  trend: WeekTrendPoint[];
  trendScope: string;
  rankings: Record<Period, EmployeeRanking[]>;
  performers: Record<Period, EmployeeRanking | null>;
  /** Org-wide Star of the Month — tasks + goals, not just weekly goals. */
  starOfMonth: GlobalRanking | null;
  myId: string;
}

const PERIOD_LABELS: Record<Period, string> = {
  week: "Performer of the Week",
  month: "Performer of the Month",
  year: "Performer of the Year (since Jan 1)",
};

const PERIOD_TAB: Record<Period, string> = {
  week: "This week",
  month: "This month",
  year: "Year to date",
};

export function WeeklyGoalsDashboard(props: Props) {
  const [period, setPeriod] = React.useState<Period>("week");
  const ranking = props.rankings[period];

  return (
    <main className="mx-auto max-w-[1400px] px-12 max-md:px-4 pt-8 pb-24">
      <header className="mb-7 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(34px, 3.6vw, 48px)",
              letterSpacing: "-0.025em",
              lineHeight: 1,
            }}
          >
            Weekly Goals — Performance
          </h1>
          <p className="mt-2 text-ink-muted font-semibold" style={{ fontSize: 17 }}>
            % done, week-over-week, and who's leading the pack.
          </p>
        </div>
        <Link
          href={"/weekly-goals" as Route}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[14.5px] font-bold border border-hairline bg-surface-card text-ink-strong hover:brightness-95 transition-all"
        >
          <ArrowLeft size={16} strokeWidth={2.4} />
          Back to Weekly Goals
        </Link>
      </header>

      {/* Star of the Month ------------------------------------------- */}
      <StarOfMonth star={props.starOfMonth} />

      {/* Performer-of cards ------------------------------------------ */}
      <div className="mb-8 grid grid-cols-3 gap-4 max-lg:grid-cols-1">
        <PerformerCard label={PERIOD_LABELS.week} performer={props.performers.week} icon={Crown} tone="amber" />
        <PerformerCard label={PERIOD_LABELS.month} performer={props.performers.month} icon={Trophy} tone="purple" />
        <PerformerCard label={PERIOD_LABELS.year} performer={props.performers.year} icon={Award} tone="blue" />
      </div>

      {/* Week-wise trend --------------------------------------------- */}
      <section className="mb-8">
        <h2 className="mb-3 font-black text-ink-strong text-[20px]">
          {props.trendScope} average % done — last 8 weeks
        </h2>
        <div className="rounded-section border border-hairline bg-surface-card p-6">
          <div className="flex items-end gap-3 h-52">
            {props.trend.map((pt) => (
              <div key={pt.weekStart} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                <span className="text-[12px] font-black tabular-nums text-ink-soft">
                  {pt.avgPct}%
                </span>
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full rounded-t-md transition-all"
                    style={{
                      height: `${Math.max(2, pt.avgPct)}%`,
                      background:
                        "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))",
                      opacity: pt.goals === 0 ? 0.18 : 1,
                    }}
                    title={`${pt.goals} goals`}
                  />
                </div>
                <span className="text-[11px] font-bold text-ink-muted whitespace-nowrap">
                  {formatWeekShort(pt.weekStart)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Leaderboard ------------------------------------------------- */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-black text-ink-strong text-[20px]">Leaderboard</h2>
          <div className="inline-flex rounded-full border border-hairline bg-surface-card overflow-hidden">
            {(["week", "month", "year"] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className="px-4 py-2 text-[13.5px] font-bold transition-colors"
                style={{
                  background: period === p ? "var(--color-altus-red)" : "transparent",
                  color: period === p ? "#fff" : "var(--color-ink-soft)",
                }}
              >
                {PERIOD_TAB[p]}
              </button>
            ))}
          </div>
        </div>

        {ranking.length === 0 ? (
          <div className="rounded-section border border-hairline bg-surface-card p-8 text-center text-ink-muted font-semibold">
            No goals recorded for this period yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-section border border-hairline bg-surface-card">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-hairline bg-black/[0.015]">
                  <th className="px-4 py-3 text-left text-[12px] font-black uppercase tracking-[0.05em] text-ink-muted" style={{ width: 70 }}>
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-[12px] font-black uppercase tracking-[0.05em] text-ink-muted">
                    Team member
                  </th>
                  <th className="px-4 py-3 text-right text-[12px] font-black uppercase tracking-[0.05em] text-ink-muted" style={{ width: 90 }}>
                    Goals
                  </th>
                  <th className="px-4 py-3 text-right text-[12px] font-black uppercase tracking-[0.05em] text-ink-muted" style={{ width: 110 }}>
                    Completed
                  </th>
                  <th className="px-4 py-3 text-left text-[12px] font-black uppercase tracking-[0.05em] text-ink-muted" style={{ width: 260 }}>
                    Avg % done
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr
                    key={r.employeeId}
                    className="border-b border-hairline last:border-0"
                    style={{
                      background:
                        r.employeeId === props.myId
                          ? "color-mix(in srgb, var(--color-altus-red) 5%, transparent)"
                          : undefined,
                    }}
                  >
                    <td className="px-4 py-3">
                      <RankBadge rank={i + 1} />
                    </td>
                    <td className="px-4 py-3 font-bold text-ink-strong text-[15px]">
                      {r.employeeName}
                      {r.employeeId === props.myId && (
                        <span className="ml-2 text-[11px] font-black text-altus-red">YOU</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-ink-soft">
                      {r.goals}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-ink-soft">
                      {r.completed}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 flex-1 rounded-full bg-black/[0.06] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${r.avgPct}%`,
                              background:
                                "linear-gradient(90deg, var(--color-green), var(--color-green-deep))",
                            }}
                          />
                        </div>
                        <span className="w-12 text-right tabular-nums font-black text-ink-strong">
                          {r.avgPct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const tone = rank === 1 ? "amber" : rank === 2 ? "slate" : rank === 3 ? "orange" : "slate";
  return (
    <span
      className="inline-flex size-8 items-center justify-center rounded-full font-black tabular-nums text-[14px]"
      style={{
        background:
          rank <= 3
            ? `color-mix(in srgb, var(--color-${tone}) 22%, transparent)`
            : "transparent",
        color: rank <= 3 ? `var(--color-${tone}-deep)` : "var(--color-ink-muted)",
      }}
    >
      {rank <= 3 ? <Medal size={16} /> : rank}
    </span>
  );
}

function PerformerCard({
  label,
  performer,
  icon: Icon,
  tone,
}: {
  label: string;
  performer: EmployeeRanking | null;
  icon: typeof Trophy;
  tone: string;
}) {
  return (
    <div
      className="relative bg-surface-card rounded-section overflow-hidden p-6"
      style={{ border: "1px solid var(--color-hairline)", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{
          height: 5,
          background: `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))`,
        }}
      />
      <span
        aria-hidden
        className="absolute right-5 top-6 inline-flex size-10 items-center justify-center rounded-xl"
        style={{
          background: `color-mix(in srgb, var(--color-${tone}) 14%, transparent)`,
          color: `var(--color-${tone}-deep)`,
        }}
      >
        <Icon size={20} strokeWidth={2.3} />
      </span>
      <span
        className="uppercase font-black tracking-[0.06em] leading-none"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: 13,
          color: `var(--color-${tone}-deep)`,
        }}
      >
        {label}
      </span>
      {performer ? (
        <>
          <span className="block mt-3 font-black text-ink-strong leading-tight" style={{ fontSize: 26 }}>
            {performer.employeeName}
          </span>
          <span className="block mt-1 font-bold text-ink-muted text-[14px] tabular-nums">
            {performer.avgPct}% avg · {performer.completed}/{performer.goals} done
          </span>
        </>
      ) : (
        <span className="block mt-3 font-bold text-ink-muted text-[16px]">No goals yet</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Star of the Month                                                   */
/* ------------------------------------------------------------------ */

const STAR_PURPOSE =
  "The Star of the Month programme recognises and rewards employees who consistently demonstrate exceptional performance, commitment, and contribution to the organisation's success — fostering a culture of excellence, motivation, and healthy competition.";

const STAR_FRAMEWORK: { title: string; points: string[] }[] = [
  { title: "Eligibility", points: [
    "Be a full-time employee of the organisation",
    "Complete the minimum probation period, if applicable",
    "Maintain satisfactory attendance and conduct records",
    "Have no active disciplinary actions during the evaluation period",
  ] },
  { title: "Evaluation period", points: [
    "Monthly — first day to the last day of each month",
  ] },
  { title: "Objectives", points: [
    "Increase employee motivation and engagement",
    "Encourage employees to exceed their performance goals",
    "Improve overall organisational performance and productivity",
    "Create a healthy and competitive work environment",
    "Recognise and appreciate outstanding contributions",
  ] },
  { title: "Key result areas (KRAs)", points: [
    "Achievement of individual targets and goals",
    "Quality and accuracy of work",
    "Productivity and efficiency",
    "Teamwork and collaboration",
    "Initiative and problem-solving ability",
    "Customer / client satisfaction",
    "Compliance with company policies and values",
    "Attendance and punctuality",
  ] },
  { title: "Selection process", points: [
    "Department heads submit employee nominations",
    "Nominations are reviewed by the Evaluation Committee",
    "Employees are assessed against the defined evaluation criteria",
    "Scores are consolidated and reviewed",
    "The highest-scoring employee is selected as Star of the Month",
    "Final approval is provided by management",
  ] },
  { title: "Recognition", points: [
    "A Certificate of Recognition",
    "Public acknowledgement during company meetings",
    "Recognition through internal communication channels",
    "Monetary reward, gift voucher, or other incentives, where applicable",
  ] },
  { title: "Expected outcomes", points: [
    "Increased employee motivation",
    "Improved productivity and performance",
    "Enhanced employee engagement",
    "Stronger organisational culture",
    "Greater recognition of employee achievements",
    "A positive and healthy competitive environment",
  ] },
];

const STAR_DEPARTMENTS: { dept: string; points: string[] }[] = [
  { dept: "Sales", points: [
    "Achievement of sales targets",
    "Revenue generation",
    "New client acquisition",
    "Customer retention and satisfaction",
  ] },
  { dept: "Marketing", points: [
    "Campaign performance",
    "Lead generation",
    "Brand awareness and engagement",
    "Creativity and innovation",
  ] },
  { dept: "Operations", points: [
    "Process efficiency",
    "Quality assurance",
    "Timely completion of assigned tasks",
    "Cost optimisation and resource management",
  ] },
  { dept: "Web Development", points: [
    "Project delivery within timelines",
    "Code quality and best practices",
    "Website performance and functionality",
    "Bug resolution and maintenance support",
  ] },
  { dept: "Technical", points: [
    "Technical expertise and problem-solving",
    "System reliability and support",
    "Innovation and process improvements",
    "Contribution to technical projects",
  ] },
  { dept: "Accounting", points: [
    "Accuracy of financial records",
    "Timely completion of reports",
    "Compliance with accounting standards and policies",
    "Process improvement initiatives",
  ] },
  { dept: "Consulting", points: [
    "Client satisfaction and feedback",
    "Project delivery and outcomes",
    "Professional communication",
    "Knowledge sharing and teamwork",
  ] },
];

function StarOfMonth({ star }: { star: GlobalRanking | null }) {
  const [open, setOpen] = React.useState(false);
  return (
    <section className="mb-8 rounded-section overflow-hidden border border-hairline"
      style={{ background: "linear-gradient(135deg, #1A0F0C 0%, #2A140E 55%, #0B0708 100%)", boxShadow: "0 16px 40px -18px rgba(0,0,0,0.5)" }}>
      <div className="p-7 max-md:p-5 flex items-start justify-between gap-5 flex-wrap">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 mb-2" style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, letterSpacing: "0.18em", fontWeight: 800, textTransform: "uppercase" }}>
            <Crown size={15} style={{ color: "#FFD66B" }} /> Star of the Month
          </div>
          {star ? (
            <>
              <div className="text-white font-black" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: "clamp(28px,3.2vw,42px)", lineHeight: 1.05 }}>
                {star.employeeName}
              </div>
              <div className="mt-1.5 font-bold tabular-nums" style={{ color: "rgba(255,255,255,0.66)", fontSize: 14 }}>
                {star.tasksDone} tasks · {star.goalsDone} goals · {star.onTimePct}% on-time · {star.presentDays}d present · {star.incentivesWon} incentives
              </div>
              <div className="mt-0.5 font-semibold" style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                Scored across tasks, weekly goals, attendance &amp; incentives this month
              </div>
            </>
          ) : (
            <div className="text-white/80 font-bold text-[16px] mt-1">No standout yet this month — keep going.</div>
          )}
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="rounded-full px-4 py-2 text-[13px] font-bold text-white border border-white/20 hover:bg-white/10 transition-colors">
          {open ? "Hide framework" : "View framework"}
        </button>
      </div>
      {open && (
        <div className="px-7 max-md:px-5 pb-7"
          style={{ borderTop: "1px solid rgba(255,255,255,0.10)", paddingTop: 20 }}>
          <div className="mb-2 text-[11px] font-black uppercase tracking-[0.08em]" style={{ color: "#FFD66B" }}>Purpose</div>
          <p className="mb-6 text-[13.5px] max-w-3xl" style={{ color: "rgba(255,255,255,0.82)", lineHeight: 1.55 }}>{STAR_PURPOSE}</p>

          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-5">
            {STAR_FRAMEWORK.map((s) => (
              <div key={s.title}>
                <h4 className="text-[12px] font-black uppercase tracking-[0.08em] mb-2" style={{ color: "#FFD66B" }}>{s.title}</h4>
                <ul className="space-y-1">
                  {s.points.map((p, i) => (
                    <li key={i} className="text-[13px]" style={{ color: "rgba(255,255,255,0.82)" }}>• {p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-7 pt-5" style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }}>
            <h4 className="text-[12px] font-black uppercase tracking-[0.08em] mb-3" style={{ color: "#FFD66B" }}>Department-specific considerations</h4>
            <div className="grid grid-cols-3 max-md:grid-cols-1 gap-x-5 gap-y-4">
              {STAR_DEPARTMENTS.map((d) => (
                <div key={d.dept}>
                  <h5 className="text-[12.5px] font-black mb-1.5" style={{ color: "rgba(255,255,255,0.92)" }}>{d.dept}</h5>
                  <ul className="space-y-1">
                    {d.points.map((p, i) => (
                      <li key={i} className="text-[12.5px]" style={{ color: "rgba(255,255,255,0.72)" }}>• {p}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
