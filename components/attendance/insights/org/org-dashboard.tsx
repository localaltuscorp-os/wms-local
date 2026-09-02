"use client";

import * as React from "react";
import {
  Activity,
  PieChart,
  Clock3,
  Building2,
  Trophy,
  Laptop,
  ShieldCheck,
  MapPin,
  Users,
  Gift,
  Timer,
} from "lucide-react";
import { ChartCard } from "@/components/hr/candidate/analytics/analytics-charts";
import type { OrgAttendanceAnalytics } from "@/lib/attendance/analytics/org";
import type { OrgAttendanceDeepReads } from "@/lib/attendance/analytics/deep-reads";
import { KpiGrid, InsightDonut, HBars, StatCard, type KpiTileData, type DonutSeg } from "./insight-viz";
import { HealthPanel } from "./health-panel";
import { DepartmentTable } from "./department-table";
import { Leaderboards } from "./leaderboards";
import { DrillTable } from "./drill-table";
import { AiInsightsPanel, SmartAlertsPanel } from "@/components/attendance/insights/ai";
import { computeSmartAlerts } from "@/lib/attendance/analytics/alerts";

const GREEN = { c: "var(--color-green)", d: "var(--color-green-deep)" };
const RED = { c: "var(--color-altus-red)", d: "var(--color-altus-red-deep)" };
const AMBER = { c: "var(--color-amber)", d: "var(--color-amber-deep)" };
const TEAL = { c: "var(--color-teal)", d: "var(--color-teal-deep)" };
const INDIGO = { c: "var(--color-indigo, #6366f1)", d: "var(--color-indigo-deep, #4338ca)" };
const SLATE = { c: "var(--color-slate, #64748b)", d: "var(--color-slate-deep, #475569)" };
const BLUE = { c: "#3b82f6", d: "#2563eb" };

const HOURS_TONES: Record<string, string> = {
  "<5": "var(--color-altus-red)",
  "5-7": "var(--color-amber)",
  "7-9": "var(--color-teal)",
  "9-11": "var(--color-green)",
  "11+": "var(--color-indigo, #6366f1)",
};

export function OrgDashboard({
  data,
  deep,
}: {
  data: OrgAttendanceAnalytics;
  deep: OrgAttendanceDeepReads;
}) {
  const [filter, setFilter] = React.useState<string | null>(null);
  const { kpis, today } = data;
  const alerts = React.useMemo(() => computeSmartAlerts(data), [data]);

  const onLeave = kpis.paidLeave + kpis.unpaidLeave;

  const tiles: KpiTileData[] = [
    { key: "total", label: "Total Employees", value: kpis.totalEmployees, sublabel: "active roster", accent: INDIGO.c, accentDeep: INDIGO.d },
    { key: "presentToday", label: "Present Today", value: today ? today.present : null, suffix: today ? `/${today.rosterSize}` : undefined, sublabel: today ? `${today.working} still on the clock` : "not the current month", accent: GREEN.c, accentDeep: GREEN.d },
    { key: "attRate", label: "Attendance %", value: kpis.attendanceRatePct, suffix: "%", sublabel: "effective, month-to-date", accent: TEAL.c, accentDeep: TEAL.d },
    { key: "punRate", label: "Punctuality %", value: kpis.punctualityRatePct, suffix: "%", sublabel: "on-time arrivals", accent: BLUE.c, accentDeep: BLUE.d },
    { key: "avgHrs", label: "Avg Hours / Day", value: kpis.avgHoursPerDay, decimals: 1, sublabel: `vs ${data.targetHoursPerDay}h target`, accent: INDIGO.c, accentDeep: INDIGO.d },
    { key: "payable", label: "Payable Days", value: kpis.payableDays, decimals: kpis.payableDays % 1 === 0 ? 0 : 1, sublabel: "org total this month", accent: SLATE.c, accentDeep: SLATE.d },
    { key: "absent", label: "Absent Days", value: kpis.absent, sublabel: "click to see who", accent: RED.c, accentDeep: RED.d, filterKey: "absent" },
    { key: "late", label: "Late Marks", value: kpis.lateMarks, sublabel: `${kpis.lateWaived} waived`, accent: AMBER.c, accentDeep: AMBER.d, filterKey: "late" },
    { key: "half", label: "Half Days", value: kpis.halfDay, sublabel: "graded half-day", accent: AMBER.c, accentDeep: AMBER.d, filterKey: "halfDay" },
    { key: "leave", label: "On Leave", value: onLeave, sublabel: `${kpis.paidLeave} paid · ${kpis.unpaidLeave} unpaid`, accent: BLUE.c, accentDeep: BLUE.d, filterKey: "onLeave" },
    { key: "incomplete", label: "Incomplete", value: kpis.incomplete, sublabel: "missing a punch", accent: AMBER.c, accentDeep: AMBER.d, filterKey: "incomplete" },
    { key: "compOff", label: "Comp Off", value: kpis.compOff, sublabel: `${deep.compOff.openTotal} open credits`, accent: TEAL.c, accentDeep: TEAL.d, filterKey: "compOff" },
  ];

  const distSegs: DonutSeg[] = data.distribution.map((s) => ({ key: s.key, label: s.label, value: s.value, tone: s.tone }));
  const hoursBars = data.hoursBuckets.map((b) => ({ key: b.key, label: b.label, count: b.count, tone: HOURS_TONES[b.key] }));

  const remoteSegs: DonutSeg[] = deep.remote.slices.map((s) => ({ key: s.key, label: s.label, value: s.count, tone: s.tone }));
  const verifySegs: DonutSeg[] = deep.biometric.slices.map((s) => ({ key: s.key, label: s.label, value: s.count, tone: s.tone }));

  return (
    <div className="flex flex-col gap-6">
      {/* Executive KPI header */}
      <KpiGrid tiles={tiles} activeFilter={filter} onFilter={setFilter} />

      {/* Smart Alerts + AI executive read-out */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SmartAlertsPanel alerts={alerts} />
        <AiInsightsPanel year={data.year} month={data.month} />
      </div>

      {/* Health + distribution */}
      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <ChartCard title="Workforce Health Score" subtitle="Weighted composite of the operational signals" icon={<Activity size={18} strokeWidth={2.2} />}>
          <HealthPanel health={data.health} />
        </ChartCard>
        <ChartCard title="Attendance Distribution" subtitle="Day-type mix across the org · click a slice to filter" icon={<PieChart size={18} strokeWidth={2.2} />}>
          <InsightDonut
            segs={distSegs}
            centerLabel="day records"
            activeKey={filter}
            onSlice={(k) => setFilter((prev) => (prev === k ? null : k))}
          />
        </ChartCard>
      </div>

      {/* Working hours + departments */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <ChartCard title="Working Hours" subtitle="Employees by average worked hours / day" icon={<Clock3 size={18} strokeWidth={2.2} />}>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <StatCard label="Total Hours" value={kpis.totalHours} suffix="h" sub="org, this month" tone="var(--color-indigo-deep, #4338ca)" />
            <StatCard label="Avg / Day" value={kpis.avgHoursPerDay.toFixed(1)} suffix="h" sub={`target ${data.targetHoursPerDay}h`} tone="var(--color-teal-deep)" />
          </div>
          <HBars bars={hoursBars} unit="ppl" />
        </ChartCard>
        <ChartCard title="Department Breakdown" subtitle="Attendance, punctuality & hours per department" icon={<Building2 size={18} strokeWidth={2.2} />}>
          <DepartmentTable departments={data.departments} />
        </ChartCard>
      </div>

      {/* Leaderboards */}
      <ChartCard title="Leaderboards" subtitle="Top performers and the people who need a nudge" icon={<Trophy size={18} strokeWidth={2.2} />}>
        <Leaderboards boards={data.leaderboards} />
      </ChartCard>

      {/* Remote / biometric / location */}
      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="Work Mode" subtitle={`${deep.remote.remoteSharePct}% of punches were off-site`} icon={<Laptop size={18} strokeWidth={2.2} />}>
          <InsightDonut segs={remoteSegs} centerLabel="punches" size={168} />
        </ChartCard>
        <ChartCard title="Verification" subtitle={`${deep.biometric.verifiedSharePct}% verified · ${deep.biometric.biometricSharePct}% biometric`} icon={<ShieldCheck size={18} strokeWidth={2.2} />}>
          <InsightDonut segs={verifySegs} centerLabel="punches" size={168} />
        </ChartCard>
        <ChartCard title="Location Integrity" subtitle="Geofence adherence on located punches" icon={<MapPin size={18} strokeWidth={2.2} />}>
          <LocationPanel deep={deep} />
        </ChartCard>
      </div>

      {/* Overtime + comp-off */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Overtime" subtitle={`${deep.overtime.monthLabel} · approved & pending`} icon={<Timer size={18} strokeWidth={2.2} />}>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Month Hours" value={Math.round(deep.overtime.monthTotalHours)} suffix="h" sub={`${deep.overtime.byStatus.approved} approved`} tone="var(--color-indigo-deep, #4338ca)" />
            <StatCard label="Pending" value={deep.overtime.pendingCount} sub="awaiting review" tone="var(--color-amber-deep)" />
            <StatCard label="All-time" value={Math.round(deep.overtime.allTimeTotalHours)} suffix="h" sub="logged total" tone="var(--color-slate-deep, #475569)" />
          </div>
          {deep.overtime.people.length > 0 && (
            <ul className="mt-4 flex flex-col divide-y divide-hairline">
              {deep.overtime.people.slice(0, 5).map((p, i) => (
                <li key={p.employeeId} className="flex items-center gap-3 py-2">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full tabular-nums font-black" style={{ fontSize: 11, background: "rgba(15,23,42,0.05)", color: "var(--color-ink-strong)" }}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-bold text-ink-strong" style={{ fontSize: 13.5 }}>{p.employeeName}</span>
                  <span className="tabular-nums font-black shrink-0" style={{ fontSize: 13, color: "var(--color-indigo-deep, #4338ca)" }}>{Math.round(p.monthHours)}h</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
        <ChartCard title="Comp-Off Ledger" subtitle="Earned, redeemed & open credits" icon={<Gift size={18} strokeWidth={2.2} />}>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Earned (Month)" value={deep.compOff.monthEarned} sub="new credits" tone="var(--color-teal-deep)" />
            <StatCard label="Redeemed (Month)" value={deep.compOff.monthRedeemed} sub="taken off" tone="var(--color-green-deep)" />
            <StatCard label="Open Balance" value={deep.compOff.openTotal} sub="outstanding liability" tone="var(--color-amber-deep)" />
            <StatCard label="Redeemed (All-time)" value={deep.compOff.redeemedTotal} sub="lifetime" tone="var(--color-slate-deep, #475569)" />
          </div>
        </ChartCard>
      </div>

      {/* Drill table */}
      <ChartCard title="Every Employee" subtitle="Per-person month roll-up · click a row for the full drill-down" icon={<Users size={18} strokeWidth={2.2} />}>
        <DrillTable rows={data.rows} activeFilter={filter} onClearFilter={() => setFilter(null)} />
      </ChartCard>
    </div>
  );
}

function LocationPanel({ deep }: { deep: OrgAttendanceDeepReads }) {
  const { location } = deep;
  if (location.locatedPunches === 0) {
    return (
      <div className="flex min-h-[140px] items-center justify-center rounded-chip border border-solid border-hairline-strong bg-surface-soft px-4 py-8 text-center">
        <p className="text-[13.5px] font-medium text-ink-muted">No geo-located punches this month.</p>
      </div>
    );
  }
  const withinTone = location.withinSharePct >= 90 ? "var(--color-green-deep)" : location.withinSharePct >= 70 ? "var(--color-amber-deep)" : "var(--color-altus-red-deep)";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center">
        <span className="tabular-nums leading-none" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 46, letterSpacing: "-0.03em", color: withinTone }}>
          {location.withinSharePct}%
        </span>
        <span className="mt-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-muted">within geofence</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Avg Distance" value={location.avgDistanceM} suffix="m" sub={`fence ${location.geofenceRadiusM}m`} tone="var(--color-slate-deep, #475569)" />
        <StatCard label="Out of Fence" value={location.outOfGeofence} sub={`of ${location.locatedPunches} located`} tone={location.outOfGeofence > 0 ? "var(--color-altus-red-deep)" : "var(--color-ink-strong)"} />
      </div>
    </div>
  );
}
