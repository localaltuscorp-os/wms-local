"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  ArrowRight,
  BriefcaseBusiness,
  Download,
  Gauge,
  GraduationCap,
  ListChecks,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";
import { DashboardSectionHeader } from "@/components/dashboard/section-header";
import { CollapseToggle, CollapsibleBody, DASHBOARD_CARD } from "@/components/dashboard/section-chrome";
import { SectionDispatch } from "@/components/dashboard/section-dispatch";
import { DashboardSectionNav } from "@/components/dashboard/section-nav";
import { GradeBadge } from "@/components/productivity/grade-badge";
import { formatHours, formatMoney, formatPctCompact, type Grade } from "@/lib/productivity/calc";
import {
  GOALS_THEME,
  KPI_THEME,
  MANAGER_THEME,
  TASK_COLOR,
  TASKS_THEME,
  TRAINING_THEME,
  type SectionTheme,
} from "@/lib/productivity/theme";
import type { ProductivitySnapshot } from "@/lib/productivity/data";
import type { SectionReport } from "@/lib/reports/section-report";

const SECTION_NAV = [
  { id: "performance-overview", label: "Overview" },
  { id: "performance-goals", label: "Goals" },
  { id: "performance-tasks", label: "Tasks" },
  { id: "performance-training", label: "Training" },
  { id: "performance-manager", label: "Manager" },
  { id: "performance-details", label: "Details & Grading" },
];

const COMPLETION_GRADE_BANDS: [Grade, string][] = [
  ["O", "Above 100%"], ["A", "90% and above"], ["B", "80% and above"],
  ["C", "70% and above"], ["D", "60% and above"], ["F", "Below 60%"],
];

const INCENTIVE_GRADE_BANDS: [Grade, string][] = [
  ["O", "30% and above"], ["A", "20% and above"], ["B", "15% and above"],
  ["C", "10% and above"], ["D", "5% and above"], ["F", "Below 5%"],
];

const CARD_SHADOW = "0 1px 2px rgba(15, 23, 42, 0.04), 0 16px 32px -26px rgba(15, 23, 42, 0.38)";

export function ProductivityDashboardView({
  snap,
  backHref,
  viewingOther,
}: {
  snap: ProductivitySnapshot;
  backHref?: Route;
  viewingOther: boolean;
}) {
  const { employee, period, kpi, goals, tasks, training, manager } = snap;
  const [query, setQuery] = React.useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const overdueTotal = tasks.over15 + tasks.days8to14 + tasks.days1to7;

  const sectionVisible = React.useCallback(
    (terms: string) => !normalizedQuery || terms.toLowerCase().includes(normalizedQuery),
    [normalizedQuery],
  );

  const overviewReport = React.useCallback(
    (): SectionReport => ({
      title: "Performance Overview",
      subtitle: "Current-month performance snapshot",
      meta: [{ label: "Period", value: period.label }, { label: "Employee", value: employee.name }],
      columns: [{ label: "Measure" }, { label: "Current result", align: "right" }],
      rows: [
        ["Approved incentive", formatMoney(kpi.incentiveAmount)],
        ["Incentive rate", formatPctCompact(kpi.incentivePct)],
        ["Monthly goals", `${goals.monthly.completed} / ${goals.monthly.target}`],
        ["Open overdue tasks", String(overdueTotal)],
        ["Training attended", `${formatHours(training.attendedHours)} / ${training.targetHours} hrs`],
      ],
    }),
    [employee.name, goals.monthly.completed, goals.monthly.target, kpi.incentiveAmount, kpi.incentivePct, overdueTotal, period.label, training.attendedHours, training.targetHours],
  );

  const goalsReport = React.useCallback(
    (): SectionReport => ({
      title: "Goals Performance",
      subtitle: "Monthly goals and month-to-date weekly delivery",
      meta: [{ label: "Period", value: period.label }, { label: "Employee", value: employee.name }],
      columns: [{ label: "Measure" }, { label: "Completed", align: "right" }, { label: "Attainment", align: "right" }],
      rows: [
        ["Monthly goals", `${goals.monthly.completed} / ${goals.monthly.target}`, formatPctCompact(goals.monthly.pct)],
        ["Weekly goals, month to date", `${goals.mtd.weeks} week${goals.mtd.weeks === 1 ? "" : "s"}`, formatPctCompact(goals.mtd.pct)],
      ],
    }),
    [employee.name, goals.monthly.completed, goals.monthly.pct, goals.monthly.target, goals.mtd.pct, goals.mtd.weeks, period.label],
  );

  const tasksReport = React.useCallback(
    (): SectionReport => ({
      title: "Task Attention",
      subtitle: "Open work grouped by overdue age and support need",
      meta: [{ label: "Period", value: period.label }, { label: "Employee", value: employee.name }],
      columns: [{ label: "Work queue" }, { label: "Count", align: "right", tone: "count" }],
      rows: [
        ["Overdue more than 15 days", String(tasks.over15)],
        ["Overdue 8–14 days", String(tasks.days8to14)],
        ["Overdue 1–7 days", String(tasks.days1to7)],
        ["Needs help", String(tasks.needHelp)],
      ],
    }),
    [employee.name, period.label, tasks.days1to7, tasks.days8to14, tasks.needHelp, tasks.over15],
  );

  const trainingReport = React.useCallback(
    (): SectionReport => ({
      title: "Training Progress",
      subtitle: "Training delivered and attended against the monthly target",
      meta: [{ label: "Period", value: period.label }, { label: "Employee", value: employee.name }],
      columns: [{ label: "Training" }, { label: "Hours", align: "right" }, { label: "Target progress", align: "right" }],
      rows: [
        ["Delivered", `${formatHours(training.givenHours)} hrs`, formatPctCompact(training.givenPct)],
        ["Attended", `${formatHours(training.attendedHours)} hrs`, formatPctCompact(training.attendedPct)],
      ],
    }),
    [employee.name, period.label, training.attendedHours, training.attendedPct, training.givenHours, training.givenPct],
  );

  const managerReport = React.useCallback(
    (): SectionReport => ({
      title: "Manager Delegation",
      subtitle: "Work and goals assigned to direct reports this month",
      meta: [{ label: "Period", value: period.label }, { label: "Manager", value: employee.name }],
      columns: [{ label: "Delegated work" }, { label: "Count", align: "right" }],
      rows: [
        ["Tasks delegated", String(manager?.tasksDelegated ?? 0)],
        ["Goals delegated", String(manager?.goalsDelegated ?? 0)],
      ],
    }),
    [employee.name, manager?.goalsDelegated, manager?.tasksDelegated, period.label],
  );

  return (
    <div className="flex flex-col gap-6 pb-3 max-md:gap-5">
      <EmployeeHeader employee={employee} viewingOther={viewingOther} backHref={backHref} query={query} onQuery={setQuery} />

      <div
        data-dashboard-stickybar
        className="sticky sticky-below-topbar z-40 -mx-1 border-y border-slate-200 bg-white/95 backdrop-blur-md max-md:top-14"
      >
        <DashboardSectionNav sections={SECTION_NAV} />
      </div>

      {sectionVisible("overview performance incentive salary goals tasks training") && (
        <PerformanceSection
          id="performance-overview"
          title="Performance Overview"
          subtitle="A single, current-month view of delivery, recognition, workload, and development."
          Icon={Gauge}
          theme={KPI_THEME}
          report={overviewReport}
        >
          <div className="grid gap-4 md:grid-cols-4">
            <SnapshotTile label="Approved incentive" value={formatMoney(kpi.incentiveAmount)} detail={kpi.incentivePct == null ? "Salary profile needed" : `${formatPctCompact(kpi.incentivePct)} of salary`} theme={KPI_THEME} />
            <SnapshotTile label="Monthly goals" value={`${goals.monthly.completed} / ${goals.monthly.target}`} detail={goals.monthly.pct == null ? "No goals set" : `${formatPctCompact(goals.monthly.pct)} completed`} theme={GOALS_THEME} />
            <SnapshotTile label="Overdue work" value={String(overdueTotal)} detail={overdueTotal === 1 ? "Open task needs attention" : "Open tasks need attention"} theme={TASKS_THEME} />
            <SnapshotTile label="Training attended" value={`${formatHours(training.attendedHours)} hrs`} detail={`${formatHours(training.attendedHours)} of ${training.targetHours} hour target`} theme={TRAINING_THEME} />
          </div>

          <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/70 p-4 md:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Performance rhythm</h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500">Delivery signals arranged by the work cycle, not as a generic score.</p>
              </div>
              <GradeBadge grade={kpi.grade} size="sm" />
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <RhythmRow label="Goal delivery" value={goals.monthly.pct} summary={goals.monthly.pct == null ? "No target set" : `${goals.monthly.completed} complete`} color={GOALS_THEME.accent} />
              <RhythmRow label="Learning progress" value={training.attendedPct} summary={`${formatHours(training.attendedHours)} attended`} color={TRAINING_THEME.accent} />
              <RhythmRow label="Incentive position" value={kpi.incentivePct} summary={kpi.incentivePct == null ? "No salary record" : `${formatPctCompact(kpi.incentivePct)} earned`} color={KPI_THEME.accent} />
            </div>
          </div>
        </PerformanceSection>
      )}

      {sectionVisible("goals monthly weekly attainment achievement grade") && (
        <PerformanceSection
          id="performance-goals"
          title="Goals Performance"
          subtitle="Monthly outcomes alongside the weekly-goal roll-up for this month."
          Icon={Target}
          theme={GOALS_THEME}
          report={goalsReport}
          href={"/goals" as Route}
          linkLabel="Open Goals"
        >
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="space-y-5 rounded-xl border border-slate-100 bg-white p-4 md:p-5">
              <AttainmentBand label="Monthly goals" caption={`${goals.monthly.completed} of ${goals.monthly.target} completed`} value={goals.monthly.pct} color={GOALS_THEME.accent} />
              <AttainmentBand label="Weekly goals · month to date" caption={goals.mtd.weeks ? `${goals.mtd.weeks} weekly board${goals.mtd.weeks === 1 ? "" : "s"} included` : "No weekly goals set"} value={goals.mtd.pct} color="#d97706" />
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/65 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">Achievement signal</p>
              <div className="mt-3 flex items-end gap-3">
                <GradeBadge grade={goals.mtd.grade} size="lg" />
                <div className="pb-1">
                  <p className="text-2xl font-black tracking-tight text-slate-950">{formatPctCompact(goals.mtd.pct)}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-600">Weekly goals MTD</p>
                </div>
              </div>
              <p className="mt-5 border-t border-amber-100 pt-4 text-xs leading-5 text-slate-600">Monthly and weekly views answer different questions, so both are kept visible without mixing their targets.</p>
            </div>
          </div>
        </PerformanceSection>
      )}

      {sectionVisible("tasks overdue help workload attention") && (
        <PerformanceSection
          id="performance-tasks"
          title="Task Attention"
          subtitle="Open assigned work grouped by how long it has been overdue and whether support is needed."
          Icon={ListChecks}
          theme={TASKS_THEME}
          report={tasksReport}
          href={"/tasks" as Route}
          linkLabel="Open Tasks"
        >
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 md:p-6">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-900">Open-work ageing</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500">Older overdue work rises higher, making the priority visible at a glance.</p>
              </div>
              <p className="text-sm font-bold text-slate-700"><span className="text-2xl font-black text-altus-red">{overdueTotal}</span> overdue</p>
            </div>
            <AgeingChart items={[
              { label: ">15 days", count: tasks.over15, color: TASK_COLOR.over15, detail: "Escalate first" },
              { label: "8–14 days", count: tasks.days8to14, color: TASK_COLOR.days8to14, detail: "Recover this week" },
              { label: "1–7 days", count: tasks.days1to7, color: TASK_COLOR.days1to7, detail: "Resolve promptly" },
              { label: "Need help", count: tasks.needHelp, color: TASK_COLOR.needHelp, detail: "Waiting for support" },
            ]} />
          </div>
        </PerformanceSection>
      )}

      {sectionVisible("training learning attended delivered hours development") && (
        <PerformanceSection
          id="performance-training"
          title="Training & Development"
          subtitle="Hours attended and delivered measured against the six-hour monthly development target."
          Icon={GraduationCap}
          theme={TRAINING_THEME}
          report={trainingReport}
          href={"/training" as Route}
          linkLabel="Open Training"
        >
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="rounded-xl border border-slate-100 bg-white p-4 md:p-5">
              <TrainingTrack label="Training attended" hours={training.attendedHours} target={training.targetHours} value={training.attendedPct} color={TRAINING_THEME.accent} note="Employee learning time" />
              <div className="my-5 border-t border-slate-100" />
              <TrainingTrack label="Training delivered" hours={training.givenHours} target={training.targetHours} value={training.givenPct} color="#6d28d9" note="Knowledge shared with others" />
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/65 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-violet-700">Monthly target</p>
              <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">{training.targetHours}<span className="ml-1 text-base font-bold text-slate-500">hrs</span></p>
              <p className="mt-2 text-sm font-semibold text-slate-700">Development capacity</p>
              <p className="mt-4 text-xs leading-5 text-slate-600">Attendance and delivery stay separate so personal learning is never mistaken for coaching provided to the team.</p>
            </div>
          </div>
        </PerformanceSection>
      )}

      {manager && sectionVisible("manager delegation team direct reports") && (
        <PerformanceSection
          id="performance-manager"
          title="Manager Contribution"
          subtitle="This month's work and goals delegated to direct reports."
          Icon={Users}
          theme={MANAGER_THEME}
          report={managerReport}
          href={"/productivity/team" as Route}
          linkLabel="View Team Performance"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <DelegationPanel label="Tasks delegated" value={manager.tasksDelegated} icon={ListChecks} theme={MANAGER_THEME} />
            <DelegationPanel label="Goals delegated" value={manager.goalsDelegated} icon={Target} theme={MANAGER_THEME} />
          </div>
        </PerformanceSection>
      )}

      {sectionVisible("details grading salary incentive completion framework calculation") && (
        <PerformanceSection
          id="performance-details"
          title="Performance Details & Grading"
          subtitle="The calculation details and grade bands previously available only in the full report."
          Icon={BriefcaseBusiness}
          theme={KPI_THEME}
          report={() => ({
            title: "Performance Details & Grading",
            subtitle: "Calculation inputs and current grades",
            meta: [{ label: "Period", value: period.label }, { label: "Employee", value: employee.name }],
            columns: [{ label: "Measure" }, { label: "Current value", align: "right" }],
            rows: [
              ["Monthly base salary", kpi.baseSalary > 0 ? formatMoney(kpi.baseSalary) : "Not on record"],
              ["Incentive grade", kpi.grade ?? "Ungraded"],
              ["Monthly goals grade", goals.monthly.grade ?? "Ungraded"],
              ["MTD goals grade", goals.mtd.grade ?? "Ungraded"],
              ["Weekly boards counted", String(goals.mtd.weeks)],
            ],
          })}
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
            <div className="rounded-xl border border-slate-100 bg-white p-4 md:p-5">
              <h3 className="text-sm font-bold text-slate-900">Calculation details</h3>
              <div className="mt-3 divide-y divide-slate-100">
                <DetailRow label="Monthly base salary" value={kpi.baseSalary > 0 ? formatMoney(kpi.baseSalary) : "Not on record"} />
                <DetailRow label="Incentive grade" value={<GradeBadge grade={kpi.grade} size="sm" />} />
                <DetailRow label="Monthly goals grade" value={<GradeBadge grade={goals.monthly.grade} size="sm" />} />
                <DetailRow label="MTD goals grade" value={<GradeBadge grade={goals.mtd.grade} size="sm" />} />
                <DetailRow label="Weekly boards counted" value={`${goals.mtd.weeks} week${goals.mtd.weeks === 1 ? "" : "s"}`} />
              </div>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/45 p-4 md:p-5">
              <h3 className="text-sm font-bold text-slate-900">How grades are read</h3>
              <p className="mt-1 text-xs font-medium text-slate-500">Completion and incentive use separate scales because they measure different outcomes.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <GradeScale title="Completion · goals and MTD" bands={COMPLETION_GRADE_BANDS} />
                <GradeScale title="Incentive · salary share" bands={INCENTIVE_GRADE_BANDS} />
              </div>
            </div>
          </div>
        </PerformanceSection>
      )}

      {normalizedQuery && ![
        "overview performance incentive salary goals tasks training",
        "goals monthly weekly attainment achievement grade",
        "tasks overdue help workload attention",
        "training learning attended delivered hours development",
        manager ? "manager delegation team direct reports" : "",
        "details grading salary incentive completion framework calculation",
      ].some((terms) => sectionVisible(terms)) && (
        <div className={`${DASHBOARD_CARD} p-8 text-center`}>
          <p className="text-sm font-bold text-slate-800">No dashboard section matches “{query}”.</p>
          <button type="button" onClick={() => setQuery("")} className="mt-2 text-xs font-bold text-altus-red hover:underline">Clear search</button>
        </div>
      )}
    </div>
  );
}

function EmployeeHeader({ employee, viewingOther, backHref, query, onQuery }: { employee: ProductivitySnapshot["employee"]; viewingOther: boolean; backHref?: Route; query: string; onQuery: (query: string) => void }) {
  const role = [employee.designation, employee.department].filter(Boolean).join(" · ");
  return (
    <header className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-hairline-strong bg-surface-card px-5 py-4 md:px-6" style={{ boxShadow: CARD_SHADOW }}>
      <div className="flex min-w-0 items-center gap-4">
        <EmployeeAvatar name={employee.name} size="lg" />
        <div className="min-w-0">
          <h1 className="mt-0.5 truncate text-2xl font-black tracking-tight text-ink-strong md:text-[28px]">{employee.name}</h1>
          <p className="mt-1 text-[13px] font-semibold text-ink-muted">{role || "—"}</p>
          {employee.managerName && <p className="mt-0.5 text-xs text-ink-subtle">Reporting Manager: <span className="font-semibold text-ink-muted">{employee.managerName}</span></p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {backHref && <Link href={backHref} className="text-xs font-bold text-slate-600 hover:text-altus-red">Back to team</Link>}
        <CollapsibleSearch scope="dashboard sections" className="size-8">
          <label className="relative block">
            <span className="sr-only">Find a dashboard section</span>
            <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Find a section…" className="h-8 w-48 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-altus-red focus:ring-2 focus:ring-altus-red/15 max-sm:w-36" />
          </label>
        </CollapsibleSearch>
        <a href={`/api/productivity/report/${employee.id}/pdf`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-altus-red px-3 text-xs font-bold text-white hover:bg-altus-red-deep"><Download size={14} /> Download</a>
      </div>
    </header>
  );
}

function PerformanceSection({ id, title, subtitle, Icon, theme, report, href, linkLabel, children }: { id: string; title: string; subtitle: string; Icon: LucideIcon; theme: SectionTheme; report: () => SectionReport; href?: Route; linkLabel?: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = React.useState(true);
  return (
    <section id={id} className="scroll-mt-32">
      <DashboardSectionHeader
        icon={<span className="grid size-9 place-items-center rounded-xl" style={{ background: theme.tint, color: theme.ink }}><Icon size={18} strokeWidth={2.4} /></span>}
        title={title}
        subtitle={subtitle}
        inset="px-1 md:px-1"
        actions={<><SectionDispatch report={report} />{href && <Link data-sec="link" href={href} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 max-sm:px-2" title={linkLabel}><span className="max-sm:hidden">{linkLabel}</span><ArrowRight size={14} /></Link>}<CollapseToggle expanded={expanded} onToggle={() => setExpanded((value) => !value)} label={title} tone={theme.accent} /></>}
      />
      <CollapsibleBody expanded={expanded}>
        <div className={`${DASHBOARD_CARD} p-4 md:p-6`} style={{ boxShadow: CARD_SHADOW }}>{children}</div>
      </CollapsibleBody>
    </section>
  );
}

function SnapshotTile({ label, value, detail, theme }: { label: string; value: string; detail: string; theme: SectionTheme }) {
  return <div className="rounded-xl border p-4" style={{ background: theme.tint, borderColor: `${theme.accent}55` }}><p className="text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: theme.ink }}>{label}</p><p className="mt-3 text-2xl font-black tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs font-semibold text-slate-600">{detail}</p></div>;
}

function RhythmRow({ label, value, summary, color }: { label: string; value: number | null; summary: string; color: string }) {
  const width = pctWidth(value);
  return <div className="rounded-lg border border-slate-100 bg-white p-3.5"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-slate-800">{label}</p><p className="text-xs font-black tabular-nums text-slate-900">{formatPctCompact(value)}</p></div><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} /></div><p className="mt-2 text-[11px] font-semibold text-slate-500">{summary}</p></div>;
}

function AttainmentBand({ label, caption, value, color }: { label: string; caption: string; value: number | null; color: string }) {
  return <div><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-sm font-bold text-slate-900">{label}</p><p className="mt-0.5 text-xs font-medium text-slate-500">{caption}</p></div><p className="text-2xl font-black tracking-tight text-slate-950">{formatPctCompact(value)}</p></div><div className="mt-3 h-5 overflow-hidden rounded-md bg-slate-100 p-1"><div className="h-full rounded-sm" style={{ width: `${pctWidth(value)}%`, minWidth: value && value > 0 ? 8 : 0, background: color }} /></div></div>;
}

function AgeingChart({ items }: { items: { label: string; count: number; color: string; detail: string }[] }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return <div className="grid min-h-[230px] grid-cols-4 items-end gap-3 border-b border-slate-200 pb-1 md:gap-6">{items.map((item) => <div key={item.label} className="flex h-full min-w-0 flex-col justify-end"><div className="mb-2 text-center"><p className="text-2xl font-black tabular-nums text-slate-950">{item.count}</p><p className="mt-0.5 text-[10px] font-semibold leading-tight text-slate-500 max-sm:hidden">{item.detail}</p></div><div className="relative flex h-[145px] items-end rounded-t-lg bg-white"><div className="w-full rounded-t-lg transition-[height] duration-300" style={{ height: `${item.count ? Math.max(12, (item.count / max) * 100) : 5}%`, background: item.count ? item.color : "#e2e8f0" }} /></div><p className="mt-2 text-center text-[11px] font-bold leading-tight text-slate-700 md:text-xs">{item.label}</p></div>)}</div>;
}

function TrainingTrack({ label, hours, target, value, color, note }: { label: string; hours: number; target: number; value: number | null; color: string; note: string }) {
  return <div><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-sm font-bold text-slate-900">{label}</p><p className="mt-0.5 text-xs font-medium text-slate-500">{note}</p></div><p className="text-lg font-black text-slate-950">{formatHours(hours)} <span className="text-xs font-bold text-slate-500">/ {target} hrs</span></p></div><div className="mt-3 h-4 overflow-hidden rounded-md bg-slate-100 p-1"><div className="h-full rounded-sm" style={{ width: `${pctWidth(value)}%`, minWidth: hours > 0 ? 8 : 0, background: color }} /></div><p className="mt-2 text-right text-xs font-bold text-slate-600">{formatPctCompact(value)} of monthly target</p></div>;
}

function DelegationPanel({ label, value, icon: Icon, theme }: { label: string; value: number; icon: LucideIcon; theme: SectionTheme }) {
  return <div className="flex items-center gap-4 rounded-xl border border-emerald-100 bg-emerald-50/55 p-5"><span className="grid size-11 place-items-center rounded-xl" style={{ background: theme.tint, color: theme.ink }}><Icon size={20} /></span><div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-800">{label}</p><p className="mt-1 text-3xl font-black tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs font-semibold text-slate-600">Assigned to direct reports this month</p></div></div>;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex min-h-11 items-center justify-between gap-4 py-2"><span className="text-xs font-medium text-slate-600">{label}</span><span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">{value}</span></div>;
}

function GradeScale({ title, bands }: { title: string; bands: [Grade, string][] }) {
  return <div className="rounded-lg border border-indigo-100 bg-white/85 p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-indigo-800">{title}</p><div className="divide-y divide-slate-100">{bands.map(([grade, band]) => <div key={grade} className="flex items-center justify-between gap-3 py-1"><GradeBadge grade={grade} size="xs" /><span className="text-[11px] font-semibold text-slate-600">{band}</span></div>)}</div></div>;
}

function pctWidth(value: number | null): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
