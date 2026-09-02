import * as React from "react";
import {
  Activity,
  Flame,
  CalendarCheck2,
  CalendarX2,
  PieChart,
  AlarmClock,
  IndianRupee,
  Wallet,
  Clock3,
  Gauge as GaugeIcon,
  TrendingUp,
  Sparkles,
  Building2,
  ShieldCheck,
} from "lucide-react";
import type { EmployeeAttendanceAnalytics } from "@/lib/attendance/analytics/employee";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { AttendanceKpiStrip } from "@/components/attendance/attendance-kpi-strip";
import { SelfView } from "@/components/attendance/self-view";
import { MONTHLY_HALF_DAY_GRACE } from "@/lib/attendance/hour-balance";
import { TodayPanel } from "@/components/attendance/today-panel";
import { MonthCalendar } from "@/components/attendance/month-calendar";
import { LeaveBalanceCard } from "@/components/attendance/leave/leave-balance-card";
import { Gauge } from "@/components/dashboard/exec/viz/gauge";
import { Sparkline } from "@/components/charts/sparkline";
import { ChartCard } from "@/components/hr/candidate/analytics/analytics-charts";
import { EmployeeMonthSelector } from "@/components/attendance/insights/employee/employee-month-selector";
import { CardGrid } from "@/components/layout/card-grid";

/**
 * The per-EMPLOYEE attendance dashboard — a personal, context-preserving view
 * assembled entirely from the existing engines + viz (no re-derivation). Server
 * component: it composes the client KPI strip / gauge / sparkline as children.
 */

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const CARD_SHADOW =
  "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)";

export function EmployeeAttendanceDashboard({
  data,
}: {
  data: EmployeeAttendanceAnalytics;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Hero data={data} />
      <PersonalKpiCards data={data} />

      <div className="grid grid-cols-3 gap-6 max-xl:grid-cols-1">
        {/* Main column — today + month calendar */}
        <div className="col-span-2 flex flex-col gap-6 max-xl:col-span-1">
          {data.today && (
            <TodayPanel
              inLabel={data.today.inLabel}
              outLabel={data.today.outLabel}
              inISO={data.today.inISO}
              outISO={data.today.outISO}
              fullDayHours={data.targetHoursPerDay}
            />
          )}
          <MonthCalendar
            cells={data.calendar}
            monthLabel={data.monthLabel}
            weekTargetMinutes={data.weeklyTargetMinutes}
          />
        </div>

        {/* Side column — score, punctuality, hours trend */}
        <div className="flex flex-col gap-6">
          <HealthScoreCard data={data} />
          <PunctualityCard data={data} />
          <HoursTrendCard data={data} />
        </div>
      </div>

      {/* Rolling scorecard (week / month / last-month, with ₹) */}
      <AttendanceKpiStrip data={data.periods} />
      <SelfView
        data={data.periods}
        weeklyTargetMinutes={data.weeklyTargetMinutes}
        monthlyHalfDayGrace={MONTHLY_HALF_DAY_GRACE}
      />

      {/* Leave + comp-off context */}
      <div className="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
        <LeaveBalanceCard balance={data.leave} />
        <CompOffCard data={data} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero — lighter personal band                                        */
/* ------------------------------------------------------------------ */

function Hero({ data }: { data: EmployeeAttendanceAnalytics }) {
  const band = data.health.band;
  return (
    <section
      className="wg-rise relative overflow-hidden rounded-[24px] p-7 max-md:p-5"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, #E10600 7%, var(--color-surface-card)), var(--color-surface-card) 62%)",
        boxShadow: CARD_SHADOW,
      }}
    >
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <EmployeeAvatar
            name={data.name}
            size="lg"
            background="linear-gradient(135deg, #E10600, #A80400)"
          />
          <div className="min-w-0">
            <div
              className="uppercase font-bold text-ink-subtle"
              style={{
                fontFamily: "var(--font-mono-display), ui-monospace, monospace",
                fontSize: 11,
                letterSpacing: "0.18em",
              }}
            >
              Attendance · Personal dashboard
            </div>
            <h1
              className="mt-1 truncate text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(26px, 3.4vw, 40px)",
                letterSpacing: "-0.03em",
                lineHeight: 1.02,
              }}
            >
              {data.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] font-semibold text-ink-muted">
              {data.department && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 size={13} strokeWidth={2.4} className="text-ink-subtle" />
                  {data.department}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <CalendarCheck2 size={13} strokeWidth={2.4} className="text-ink-subtle" />
                {data.monthLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-3 max-md:w-full max-md:items-start">
          <EmployeeMonthSelector
            employeeId={data.employeeId}
            year={data.year}
            month={data.month}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-black"
              style={{
                background: `color-mix(in srgb, ${band.tone} 12%, transparent)`,
                color: band.tone,
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${band.tone} 26%, transparent)`,
              }}
            >
              <ShieldCheck size={14} strokeWidth={2.6} />
              {data.health.score} · {band.label}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-black text-ink-strong"
              style={{ background: "var(--color-surface-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
            >
              <Flame size={14} strokeWidth={2.6} style={{ color: "#d97706" }} />
              {data.streak.current}-day streak
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Personal KPI tiles (month-scoped)                                   */
/* ------------------------------------------------------------------ */

interface Tile {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: string;
  warn?: boolean;
}

function PersonalKpiCards({ data }: { data: EmployeeAttendanceAnalytics }) {
  const s = data.summary;
  const month = data.periods.thisMonth;
  const GREEN = "#15803d";
  const AMBER = "#b45309";
  const RED = "#b91c1c";
  const BRAND = "#A80400";

  const tiles: Tile[] = [
    {
      icon: <Activity size={16} strokeWidth={2.4} />,
      label: "Attendance score",
      value: `${data.health.score}`,
      sub: `/ 100 · ${data.health.band.label}`,
      tone: data.health.band.tone,
    },
    {
      icon: <Flame size={16} strokeWidth={2.4} />,
      label: "Current streak",
      value: `${data.streak.current}`,
      sub: `best ${data.streak.longest}`,
      tone: AMBER,
    },
    {
      icon: <CalendarCheck2 size={16} strokeWidth={2.4} />,
      label: "Present",
      value: `${s.present}`,
      sub: s.holidayPresent > 0 ? `+${s.holidayPresent} holiday` : "days",
      tone: GREEN,
    },
    {
      icon: <CalendarX2 size={16} strokeWidth={2.4} />,
      label: "Absent",
      value: `${s.absent}`,
      sub: "days",
      tone: RED,
      warn: s.absent > 0,
    },
    {
      icon: <PieChart size={16} strokeWidth={2.4} />,
      label: "Half days",
      value: `${s.halfDay}`,
      sub: "days",
      tone: AMBER,
      warn: s.halfDay > 0,
    },
    {
      icon: <AlarmClock size={16} strokeWidth={2.4} />,
      label: "Late marks",
      value: `${s.late}`,
      sub: s.leftEarly > 0 ? `${s.leftEarly} early` : "this month",
      tone: AMBER,
      warn: s.late > 0,
    },
    {
      icon: <IndianRupee size={16} strokeWidth={2.4} />,
      label: "Salary impact",
      value: month.salaryReduced > 0 ? inr(month.salaryReduced) : "₹0",
      sub: "this month",
      tone: month.salaryReduced > 0 ? RED : GREEN,
      warn: month.salaryReduced > 0,
    },
    {
      icon: <Wallet size={16} strokeWidth={2.4} />,
      label: "Leave left",
      value: `${data.leave.remaining}`,
      sub: `${data.compOff.open} comp-off`,
      tone: BRAND,
    },
  ];

  return (
    <CardGrid
      min={280}
      gap="0.75rem"
      className="wg-rise"
      style={{ animationDelay: "40ms" }}
    >
      {tiles.map((t) => (
        <div
          key={t.label}
          className="min-w-0 rounded-2xl bg-surface-card p-4 max-md:p-3.5"
          style={{
            boxShadow: t.warn
              ? `inset 0 0 0 1px color-mix(in srgb, ${t.tone} 26%, transparent), 0 6px 24px -20px rgba(15,23,42,0.25)`
              : CARD_SHADOW,
            background: t.warn
              ? `color-mix(in srgb, ${t.tone} 4%, var(--color-surface-card))`
              : undefined,
          }}
        >
          <div
            className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase leading-tight tracking-wide"
            style={{ color: t.tone }}
          >
            <span className="shrink-0">{t.icon}</span>
            <span className="min-w-0 truncate">{t.label}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className="tabular-nums text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 26,
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              {t.value}
            </span>
            {t.sub && (
              <span className="text-[11.5px] font-semibold text-ink-subtle">{t.sub}</span>
            )}
          </div>
        </div>
      ))}
    </CardGrid>
  );
}

/* ------------------------------------------------------------------ */
/* Health score card — score + band + weighted breakdown              */
/* ------------------------------------------------------------------ */

function HealthScoreCard({ data }: { data: EmployeeAttendanceAnalytics }) {
  const { score, band, components } = data.health;
  return (
    <ChartCard
      title="Attendance Health"
      subtitle="Blended 0–100 score across six weighted signals"
      icon={<Sparkles size={17} strokeWidth={2.3} />}
    >
      <div className="flex items-center gap-4">
        <div
          className="grid size-[92px] shrink-0 place-items-center rounded-2xl"
          style={{
            background: `color-mix(in srgb, ${band.tone} 12%, transparent)`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${band.tone} 28%, transparent)`,
          }}
        >
          <span
            className="tabular-nums leading-none"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: 38,
              letterSpacing: "-0.03em",
              color: band.tone,
            }}
          >
            {score}
          </span>
        </div>
        <div className="min-w-0">
          <div
            className="text-[15px] font-black"
            style={{ color: band.tone }}
          >
            {band.label}
          </div>
          <p className="mt-0.5 text-[12.5px] font-medium text-ink-muted">
            {data.rates.attendancePct}% effective attendance ·{" "}
            {data.rates.avgHoursPerDay}h/day
          </p>
        </div>
      </div>

      <ul className="mt-5 flex flex-col gap-2.5">
        {components.map((c) => (
          <li key={c.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-[12.5px] font-semibold text-ink-strong" title={c.note}>
                {c.label}
              </span>
              <span className="shrink-0 tabular-nums text-[12px] font-black text-ink-soft">
                {c.score}
                <span className="ml-1 font-semibold text-ink-subtle">·{c.weight}%</span>
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-track)" }}>
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, c.score))}%`,
                  background:
                    c.score >= 85
                      ? "linear-gradient(90deg,#16a34a,#15803d)"
                      : c.score >= 60
                        ? "linear-gradient(90deg,#f59e0b,#d97706)"
                        : "linear-gradient(90deg,#ef4444,#b91c1c)",
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Punctuality gauge (exec viz)                                        */
/* ------------------------------------------------------------------ */

function PunctualityCard({ data }: { data: EmployeeAttendanceAnalytics }) {
  return (
    <ChartCard
      title="Punctuality"
      subtitle="On-time arrivals vs late marks this month"
      icon={<GaugeIcon size={17} strokeWidth={2.3} />}
    >
      <div className="flex justify-center py-1">
        <Gauge
          pct={data.rates.punctualityPct}
          onTime={data.rates.onTimeDays}
          late={data.rates.lateDays}
          size={240}
        />
      </div>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Working-hours trend                                                 */
/* ------------------------------------------------------------------ */

function HoursTrendCard({ data }: { data: EmployeeAttendanceAnalytics }) {
  const points = data.hoursTrend;
  const hours = points.map((p) => p.hours);
  const avg =
    hours.length > 0 ? hours.reduce((a, b) => a + b, 0) / hours.length : 0;
  const peak = hours.length > 0 ? Math.max(...hours) : 0;

  return (
    <ChartCard
      title="Working Hours"
      subtitle={`Per-day worked hours · ${data.monthLabel}`}
      icon={<TrendingUp size={17} strokeWidth={2.3} />}
    >
      {hours.length < 2 ? (
        <div className="flex min-h-[110px] items-center justify-center rounded-chip border border-solid border-hairline-strong bg-surface-soft px-4 py-8 text-center">
          <p className="text-[13px] font-medium text-ink-muted">
            Not enough worked days yet to chart a trend.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div
                className="tabular-nums text-ink-strong"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 900,
                  fontSize: 30,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
              >
                {avg.toFixed(1)}
                <span className="ml-1 text-[14px] font-bold text-ink-subtle">h avg/day</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted">
                <Clock3 size={13} strokeWidth={2.4} className="text-ink-subtle" />
                Peak {peak.toFixed(1)}h · target {data.targetHoursPerDay}h
              </div>
            </div>
          </div>
          <div className="mt-3">
            <Sparkline
              values={hours}
              responsive
              height={64}
              strokeWidth={2.4}
              color="var(--color-altus-red)"
              className="w-full"
              drawIn
            />
          </div>
        </>
      )}
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */
/* Comp-off ledger                                                     */
/* ------------------------------------------------------------------ */

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d).padStart(2, "0")} ${months[(m ?? 1) - 1]} ${y}`;
}

function CompOffCard({ data }: { data: EmployeeAttendanceAnalytics }) {
  const { total, open, redeemed, rows } = data.compOff;
  const recent = [...rows].reverse().slice(0, 5);
  return (
    <section
      className="rounded-[22px] bg-surface-card p-6 max-md:p-5"
      style={{ boxShadow: CARD_SHADOW }}
    >
      <div className="mb-5 flex items-center gap-2.5">
        <span
          className="inline-grid size-9 place-items-center rounded-xl"
          style={{ background: "color-mix(in srgb, #0d9488 12%, transparent)", color: "#0f766e" }}
        >
          <ShieldCheck size={18} strokeWidth={2.3} />
        </span>
        <h2
          className="text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: 21,
            letterSpacing: "-0.02em",
          }}
        >
          Comp-Off
        </h2>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <CompStat label="Open" value={open} accent="#0f766e" />
        <CompStat label="Redeemed" value={redeemed} accent="#64748b" />
        <CompStat label="Total" value={total} accent="#A80400" />
      </div>

      {recent.length > 0 ? (
        <ul className="mt-5 flex flex-col divide-y divide-hairline">
          {recent.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="text-[13px] font-semibold text-ink-strong">
                Earned {prettyDate(c.earnedDate)}
              </span>
              <span
                className="rounded-pill px-2.5 py-1 text-[11px] font-black uppercase tracking-wide"
                style={
                  c.status === "open"
                    ? { background: "color-mix(in srgb, #0d9488 12%, transparent)", color: "#0f766e" }
                    : { background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }
                }
              >
                {c.status === "open" ? "Open" : `Redeemed${c.redeemedDate ? ` ${prettyDate(c.redeemedDate)}` : ""}`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 text-[13.5px] font-medium text-ink-muted">
          No comp-off credits earned yet. Working an approved holiday or weekly-off
          earns one.
        </p>
      )}
    </section>
  );
}

function CompStat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ background: "var(--color-surface-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
    >
      <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-subtle">{label}</div>
      <div
        className="mt-1 tabular-nums leading-none"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: 28,
          letterSpacing: "-0.02em",
          color: accent,
        }}
      >
        {value}
      </div>
    </div>
  );
}
