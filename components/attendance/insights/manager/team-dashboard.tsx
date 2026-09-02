"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Users, CalendarClock, AlertTriangle, UserX, Clock3,
  ArrowUpRight, Inbox, HeartPulse, ChevronRight, CheckCircle2, Plane,
} from "lucide-react";
import { ChartCard, band100 } from "@/components/hr/candidate/analytics/analytics-charts";
import { KpiHero, type HeroStat } from "@/components/hr/candidate/analytics/kpi-hero";
import { Gauge } from "@/components/dashboard/exec/viz/gauge";
import { Avatar } from "@/components/ui/avatar";
import type {
  ManagerTeamAnalytics,
  TeamMemberRow,
  DistributionSlice,
} from "@/lib/attendance/analytics/manager";
import type { WorkforceHealth } from "@/lib/attendance/analytics/health-score";
import type { LeaveRow } from "@/lib/queries/leave";
import { TeamMonthSelector } from "./team-month-selector";

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

export function TeamAttendanceDashboard({ data }: { data: ManagerTeamAnalytics }) {
  const { kpis, today } = data;

  const heroStats: HeroStat[] = [
    { key: "att", label: "Attendance", value: kpis.attendanceRatePct, suffix: "%", accent: band100(kpis.attendanceRatePct).color, accentDeep: band100(kpis.attendanceRatePct).deep, sublabel: `${kpis.present} present · ${kpis.absent} absent` },
    { key: "punc", label: "Punctuality", value: kpis.punctualityRatePct, suffix: "%", accent: band100(kpis.punctualityRatePct).color, accentDeep: band100(kpis.punctualityRatePct).deep, sublabel: `${kpis.lateMarks} late mark${kpis.lateMarks === 1 ? "" : "s"}` },
    { key: "prod", label: "Productivity", value: kpis.productivityPct, suffix: "%", accent: kpis.productivityPct == null ? undefined : band100(kpis.productivityPct).color, accentDeep: kpis.productivityPct == null ? undefined : band100(kpis.productivityPct).deep, sublabel: kpis.avgGoalScorePct == null ? "no goals set" : `${kpis.avgGoalScorePct}% goal score` },
    { key: "hrs", label: "Avg Hours / Day", value: kpis.avgHoursPerDay, suffix: " h", decimals: 1, accent: "var(--color-teal)", accentDeep: "var(--color-teal-deep)", sublabel: `${kpis.totalHours}h total` },
    { key: "size", label: "Team Size", value: kpis.teamSize, sublabel: `${kpis.payableDays} payable days`, accent: "var(--color-ink-strong)" },
    { key: "health", label: "Team Health", value: data.health.score, accent: data.health.band.tone, accentDeep: data.health.band.tone, sublabel: data.health.band.label },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Selector + today strip */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <TeamMonthSelector year={data.year} month={data.month} />
        {today.date && <TodayStrip data={data} />}
      </div>

      {/* KPI hero row */}
      <KpiHero stats={heroStats} />

      {/* Punctuality gauge · health · today panel */}
      <div className="grid grid-cols-3 gap-6 max-lg:grid-cols-1">
        <ChartCard title="Punctuality" subtitle="On-time arrivals this month" icon={<Clock3 size={18} strokeWidth={2.2} />}>
          <div className="flex items-center justify-center py-2">
            <Gauge
              pct={kpis.punctualityRatePct}
              onTime={Math.max(0, (kpis.present + kpis.halfDay) - kpis.lateMarks)}
              late={kpis.lateMarks}
              size={240}
            />
          </div>
        </ChartCard>

        <HealthCard health={data.health} />

        <ChartCard title="Day-Type Mix" subtitle={`${data.monthLabel} · whole team`} icon={<CalendarClock size={18} strokeWidth={2.2} />}>
          <DistributionBars slices={data.distribution} />
        </ChartCard>
      </div>

      {/* Needs attention: late + absent */}
      <div className="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
        <ChartCard title="Late This Month" subtitle="Un-waived late marks, most first" icon={<AlertTriangle size={18} strokeWidth={2.2} />}>
          <AttentionList rows={data.lateEmployees} metric="late" emptyLabel="No late marks — the whole team is on time." />
        </ChartCard>
        <ChartCard title="Absences This Month" subtitle="Absent days, most first" icon={<UserX size={18} strokeWidth={2.2} />}>
          <AttentionList rows={data.absentEmployees} metric="absent" emptyLabel="No absences recorded this month." />
        </ChartCard>
      </div>

      {/* Pending approvals */}
      <ChartCard
        title="Pending Leave Approvals"
        subtitle={data.pendingLeave.length > 0 ? `${data.pendingLeave.length} awaiting your decision` : "Approval queue"}
        icon={<Inbox size={18} strokeWidth={2.2} />}
      >
        <PendingLeaveQueue rows={data.pendingLeave} />
      </ChartCard>

      {/* Per-member table */}
      <ChartCard
        title="Team Roster"
        subtitle="Attendance & productivity per member — open anyone for their full record"
        icon={<Users size={18} strokeWidth={2.2} />}
      >
        <MemberTable rows={data.members} />
      </ChartCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Today strip                                                         */
/* ------------------------------------------------------------------ */

function TodayStrip({ data }: { data: ManagerTeamAnalytics }) {
  const { today } = data;
  const pill = (label: string, value: number, tone: string) => (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-3 py-1.5" style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.05)" }}>
      <span className="inline-block size-2 rounded-full" style={{ background: tone, boxShadow: `0 0 6px ${tone}` }} />
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{label}</span>
      <span className="tabular-nums font-black text-ink-strong" style={{ fontSize: 15 }}>{value}</span>
    </span>
  );
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {pill("In today", today.clockedIn, "var(--color-green)")}
      {pill("Working now", today.working, "var(--color-teal)")}
      {pill("Not in", today.notYetIn, "var(--color-altus-red)")}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Health card                                                         */
/* ------------------------------------------------------------------ */

function HealthCard({ health }: { health: WorkforceHealth }) {
  return (
    <ChartCard title="Team Health" subtitle="Composite workforce score" icon={<HeartPulse size={18} strokeWidth={2.2} />}>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center justify-center rounded-2xl px-5 py-3 shrink-0" style={{ background: `color-mix(in srgb, ${health.band.tone} 12%, transparent)` }}>
          <span className="tabular-nums leading-none" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 40, letterSpacing: "-0.03em", color: health.band.tone }}>
            {health.score}
          </span>
          <span className="mt-1 text-[11px] font-black uppercase tracking-[0.08em]" style={{ color: health.band.tone }}>
            {health.band.label}
          </span>
        </div>
        <ul className="min-w-0 flex-1 flex flex-col gap-2">
          {health.components.slice(0, 4).map((c) => (
            <li key={c.key}>
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <span className="truncate text-[12.5px] font-semibold text-ink-strong" title={c.note}>{c.label}</span>
                <span className="tabular-nums font-black shrink-0" style={{ fontSize: 12.5, color: band100(c.score).deep }}>{c.score}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-track)" }}>
                <span className="block h-full rounded-full" style={{ width: `${c.score}%`, background: `linear-gradient(90deg, ${band100(c.score).deep}, ${band100(c.score).color})` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Distribution bars                                                   */
/* ------------------------------------------------------------------ */

function DistributionBars({ slices }: { slices: DistributionSlice[] }) {
  if (slices.length === 0) return <EmptyState label="No attendance recorded for this month yet." />;
  const total = slices.reduce((n, s) => n + s.value, 0);
  const max = Math.max(1, ...slices.map((s) => s.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {slices.map((s) => {
        const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
        return (
          <li key={s.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="inline-flex items-center gap-2 min-w-0">
                <span className="inline-block size-2.5 rounded-[3px] shrink-0" style={{ background: s.tone }} />
                <span className="truncate text-[13px] font-semibold text-ink-strong">{s.label}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-1.5">
                <span className="tabular-nums font-black" style={{ fontSize: 13.5, color: s.tone }}>{s.value}</span>
                <span className="tabular-nums font-semibold text-ink-muted" style={{ fontSize: 11.5 }}>{pct}%</span>
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-track)" }}>
              <span className="block h-full rounded-full" style={{ width: `${(s.value / max) * 100}%`, background: s.tone }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Attention list (late / absent)                                      */
/* ------------------------------------------------------------------ */

function AttentionList({ rows, metric, emptyLabel }: { rows: TeamMemberRow[]; metric: "late" | "absent"; emptyLabel: string }) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl px-3 py-4" style={{ background: "color-mix(in srgb, var(--color-green) 8%, transparent)" }}>
        <CheckCircle2 size={18} strokeWidth={2.2} style={{ color: "var(--color-green-deep)" }} />
        <span className="text-[13.5px] font-semibold text-ink-strong">{emptyLabel}</span>
      </div>
    );
  }
  const tone = metric === "late" ? "var(--color-amber-deep)" : "var(--color-altus-red-deep)";
  const toneBg = metric === "late" ? "var(--color-amber)" : "var(--color-altus-red)";
  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {rows.slice(0, 8).map((m) => (
        <li key={m.employeeId} className="py-2 first:pt-0 last:pb-0">
          <Link
            href={`/attendance/insights/employee/${m.employeeId}` as Route}
            className="group flex items-center gap-3 rounded-lg -mx-1.5 px-1.5 py-1 outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_5%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60"
          >
            <Avatar name={m.name} size={30} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-bold text-ink-strong">{m.name}</div>
              {m.department && <div className="truncate text-[11.5px] font-medium text-ink-muted">{m.department}</div>}
            </div>
            <span className="shrink-0 rounded-full px-2.5 py-1 tabular-nums font-black" style={{ fontSize: 13, color: tone, background: `color-mix(in srgb, ${toneBg} 14%, transparent)` }}>
              {metric === "late" ? `${m.late} late` : `${m.absent} abs`}
            </span>
            <ChevronRight size={15} strokeWidth={2.4} className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Pending leave queue                                                 */
/* ------------------------------------------------------------------ */

function PendingLeaveQueue({ rows }: { rows: LeaveRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-4" style={{ background: "color-mix(in srgb, var(--color-green) 8%, transparent)" }}>
        <span className="inline-flex items-center gap-2.5">
          <CheckCircle2 size={18} strokeWidth={2.2} style={{ color: "var(--color-green-deep)" }} />
          <span className="text-[13.5px] font-semibold text-ink-strong">No pending leave requests from your team.</span>
        </span>
        <Link href={"/attendance/leave" as Route} className="pastel-cta inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold">
          Leave Centre <ArrowUpRight size={14} strokeWidth={2.4} />
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-hairline">
        {rows.slice(0, 6).map((lv) => (
          <li key={lv.id} className="flex items-center gap-3 py-2.5 first:pt-0">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--color-blue, #2563eb) 12%, transparent)", color: "var(--color-blue, #2563eb)" }}>
              <Plane size={16} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-bold text-ink-strong">{lv.employeeName}</div>
              <div className="truncate text-[12px] font-medium text-ink-muted">
                {lv.kind === "paid" ? "Paid" : "Unpaid"} · {lv.startDate}
                {lv.endDate !== lv.startDate ? ` → ${lv.endDate}` : ""} · {lv.days} day{lv.days === 1 ? "" : "s"}
              </div>
            </div>
            <Link href={"/attendance/leave" as Route} className="shrink-0 inline-flex items-center gap-1 rounded-full border border-hairline px-3 py-1.5 text-[12px] font-bold text-ink-strong hover:border-hairline-strong hover:text-[var(--color-altus-red-deep)] transition-colors">
              Review <ChevronRight size={13} strokeWidth={2.4} />
            </Link>
          </li>
        ))}
      </ul>
      {rows.length > 6 && (
        <Link href={"/attendance/leave" as Route} className="self-start text-[12.5px] font-bold text-[var(--color-altus-red-deep)] hover:underline">
          + {rows.length - 6} more in the leave centre
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Member table                                                        */
/* ------------------------------------------------------------------ */

function MemberTable({ rows }: { rows: TeamMemberRow[] }) {
  if (rows.length === 0) return <EmptyState label="No team members in scope for this month." />;

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <div className="min-w-[720px]">
        {/* Header */}
        <div className="grid items-center gap-3 border-b border-hairline-strong pb-2 px-2 text-[11px] font-black uppercase tracking-[0.08em] text-ink-subtle" style={{ gridTemplateColumns: "minmax(160px,1.6fr) repeat(5, minmax(64px,0.8fr)) minmax(72px,0.9fr) 20px" }}>
          <span>Member</span>
          <span className="text-right">Attend.</span>
          <span className="text-right">On-time</span>
          <span className="text-right">Avg hrs</span>
          <span className="text-right">Absent</span>
          <span className="text-right">Late</span>
          <span className="text-right">Product.</span>
          <span />
        </div>
        {/* Rows */}
        <ul className="flex flex-col">
          {rows.map((m) => (
            <li key={m.employeeId}>
              <Link
                href={`/attendance/insights/employee/${m.employeeId}` as Route}
                className="group grid items-center gap-3 border-b border-hairline px-2 py-2.5 outline-none transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_4%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/50"
                style={{ gridTemplateColumns: "minmax(160px,1.6fr) repeat(5, minmax(64px,0.8fr)) minmax(72px,0.9fr) 20px" }}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="relative shrink-0">
                    <Avatar name={m.name} size={32} />
                    {m.workingNow && (
                      <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface-card" style={{ background: "var(--color-green)" }} title="Working now" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-bold text-ink-strong">{m.name}</span>
                    {m.department && <span className="block truncate text-[11px] font-medium text-ink-muted">{m.department}</span>}
                  </span>
                </span>
                <Stat value={`${m.attendanceRatePct}%`} tone={band100(m.attendanceRatePct).deep} />
                <Stat value={`${m.punctualityRatePct}%`} tone={band100(m.punctualityRatePct).deep} />
                <Stat value={m.avgHoursPerDay.toFixed(1)} tone="var(--color-ink-strong)" />
                <Stat value={String(m.absent)} tone={m.absent > 0 ? "var(--color-altus-red-deep)" : "var(--color-ink-soft)"} />
                <Stat value={String(m.late)} tone={m.late > 0 ? "var(--color-amber-deep)" : "var(--color-ink-soft)"} />
                <Stat value={m.productivityPct == null ? "—" : `${m.productivityPct}%`} tone={m.productivityPct == null ? "var(--color-ink-muted)" : band100(m.productivityPct).deep} />
                <ChevronRight size={15} strokeWidth={2.4} className="justify-self-end text-ink-subtle transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ value, tone }: { value: string; tone: string }) {
  return (
    <span className="text-right tabular-nums font-black" style={{ fontSize: 13.5, color: tone }}>
      {value}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Shared empty state                                                  */
/* ------------------------------------------------------------------ */

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-solid border-hairline-strong px-4 py-10 text-center">
      <Inbox size={22} strokeWidth={2} className="text-ink-subtle" />
      <p className="text-[13.5px] font-semibold text-ink-muted">{label}</p>
    </div>
  );
}
