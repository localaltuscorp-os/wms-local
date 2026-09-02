"use client";

import * as React from "react";
import {
  ArrowUpRight,
  BadgeIndianRupee,
  CalendarX2,
  CircleSlash2,
  Clock4,
  PieChart as PieIcon,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { Donut, type DonutSlice } from "@/components/charts/donut";
import { HBars, type HBarRow } from "@/components/charts/h-bars";
import { CardGrid } from "@/components/layout/card-grid";
import { formatInr } from "@/lib/format";
import type {
  FinanceAttendanceAnalytics,
  FinanceEmployeeRow,
} from "@/lib/attendance/analytics/finance";

/* ------------------------------------------------------------------ */
/* Bucket palette — one colour per deduction reason, used everywhere.  */
/* ------------------------------------------------------------------ */

const BUCKETS = [
  { key: "absence", label: "Absence", color: "var(--color-altus-red)", deep: "var(--color-altus-red-deep)" },
  { key: "unpaidLeave", label: "Unpaid Leave", color: "var(--color-orange)", deep: "var(--color-orange-deep)" },
  { key: "halfDay", label: "Half-Days", color: "var(--color-amber)", deep: "var(--color-amber-deep)" },
  { key: "latePenalty", label: "Late Penalty", color: "var(--color-slate)", deep: "var(--color-slate-deep)" },
] as const;

/** Compact ₹ for hero tiles: crore / lakh / grouped. */
function compactInr(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  return formatInr(n);
}

/** Days as a tidy string (0.5 kept, whole numbers un-suffixed). */
function days(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/* ------------------------------------------------------------------ */
/* KPI hero tile                                                       */
/* ------------------------------------------------------------------ */

function KpiTile({
  label,
  value,
  sublabel,
  accent = "var(--color-ink-strong)",
  accentDeep,
  icon,
  index,
}: {
  label: string;
  value: string;
  sublabel?: string;
  accent?: string;
  accentDeep?: string;
  icon?: React.ReactNode;
  index: number;
}) {
  const deep = accentDeep ?? accent;
  return (
    <div
      className="group relative overflow-hidden rounded-2xl border border-hairline-strong bg-surface-card p-5 max-md:p-4 transition-transform hover:-translate-y-0.5"
      style={{
        boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
        opacity: 0,
        animation: `fadeUp 500ms ease-out ${index * 70}ms forwards`,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: `linear-gradient(90deg, ${accent}, ${deep})` }}
      />
      <div className="flex items-center justify-between gap-2">
        <div
          className="uppercase font-black tracking-[0.07em] leading-tight text-ink-soft"
          style={{ fontSize: 12 }}
        >
          {label}
        </div>
        {icon && (
          <span aria-hidden className="shrink-0 text-ink-subtle" style={{ color: deep }}>
            {icon}
          </span>
        )}
      </div>
      <div
        className="mt-2 tabular-nums leading-none"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(24px, 2.5vw, 34px)",
          letterSpacing: "-0.03em",
          color: deep,
        }}
      >
        {value}
      </div>
      {sublabel && <div className="mt-1.5 text-[12px] font-semibold text-ink-muted">{sublabel}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card shell                                                          */
/* ------------------------------------------------------------------ */

function Card({
  title,
  subtitle,
  icon,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-section border border-hairline bg-surface-card p-6 max-md:p-5 ${className ?? ""}`}
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <header className="mb-5 flex items-start gap-3">
        {icon && (
          <span
            aria-hidden
            className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: "rgba(15,23,42,0.05)", color: "var(--color-ink-strong)" }}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 800,
              fontSize: 18,
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[13px] font-medium text-ink-muted">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Main dashboard                                                      */
/* ------------------------------------------------------------------ */

export function FinanceDashboard({ data }: { data: FinanceAttendanceAnalytics }) {
  const { bucketTotals } = data;

  // Empty state — no employees at all.
  if (data.headcount === 0) {
    return (
      <div className="rounded-section border border-hairline bg-surface-card p-12 text-center">
        <p className="font-bold text-ink-strong" style={{ fontSize: 18 }}>
          No active employees for this month.
        </p>
        <p className="mt-2 font-semibold text-ink-muted" style={{ fontSize: 15 }}>
          Pick a different month above.
        </p>
      </div>
    );
  }

  const donutSlices: DonutSlice[] = BUCKETS.map((b) => ({
    label: b.label,
    value: bucketTotals[b.key],
    color: b.color,
  }));

  const deptBars: HBarRow[] = data.departments
    .filter((d) => d.totalLoss > 0)
    .slice(0, 12)
    .map((d) => ({ label: d.department, value: d.totalLoss, color: "var(--color-altus-red)" }));

  const lossPct =
    data.totalMonthlyCtc > 0
      ? (data.totalSalaryLost / data.totalMonthlyCtc) * 100
      : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Money KPI cards ─────────────────────────────────────────── */}
      <section aria-label="Payroll-impact headline figures">
      <CardGrid min={250} gap="1rem">
        <KpiTile
          index={0}
          label="Total salary lost"
          value={compactInr(data.totalSalaryLost)}
          sublabel={`${data.headcountWithDeductions} of ${data.headcount} with deductions`}
          accent="var(--color-altus-red)"
          accentDeep="var(--color-altus-red-deep)"
          icon={<TrendingDown size={18} strokeWidth={2.4} />}
        />
        <KpiTile
          index={1}
          label="Absence ₹"
          value={compactInr(bucketTotals.absence)}
          accent="var(--color-altus-red)"
          accentDeep="var(--color-altus-red-deep)"
          icon={<CalendarX2 size={18} strokeWidth={2.4} />}
        />
        <KpiTile
          index={2}
          label="Unpaid leave ₹"
          value={compactInr(bucketTotals.unpaidLeave)}
          accent="var(--color-orange)"
          accentDeep="var(--color-orange-deep)"
          icon={<CircleSlash2 size={18} strokeWidth={2.4} />}
        />
        <KpiTile
          index={3}
          label="Half-day ₹"
          value={compactInr(bucketTotals.halfDay)}
          accent="var(--color-amber)"
          accentDeep="var(--color-amber-deep)"
          icon={<CircleSlash2 size={18} strokeWidth={2.4} />}
        />
        <KpiTile
          index={4}
          label="Late penalty ₹"
          value={compactInr(bucketTotals.latePenalty)}
          accent="var(--color-slate)"
          accentDeep="var(--color-slate-deep)"
          icon={<Clock4 size={18} strokeWidth={2.4} />}
        />
        <KpiTile
          index={5}
          label="Projected payroll"
          value={compactInr(data.projectedPayroll)}
          sublabel="Estimate · net of losses"
          accent="var(--color-green)"
          accentDeep="var(--color-green-deep)"
          icon={<Wallet size={18} strokeWidth={2.4} />}
        />
      </CardGrid>
      </section>

      {/* ── Charts row: bucket donut + per-dept loss bars ───────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card
          title="Where the Money Goes"
          subtitle="Salary lost, split by reason"
          icon={<PieIcon size={18} strokeWidth={2.4} />}
        >
          {data.totalSalaryLost > 0 ? (
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
              <Donut
                data={donutSlices}
                size={196}
                centerValue={compactInr(data.totalSalaryLost)}
                centerLabel="Lost"
              />
              <ul className="w-full min-w-0 flex-1 space-y-2.5">
                {BUCKETS.map((b) => {
                  const val = bucketTotals[b.key];
                  const pct = data.totalSalaryLost > 0 ? (val / data.totalSalaryLost) * 100 : 0;
                  return (
                    <li key={b.key} className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="size-3 shrink-0 rounded-full"
                        style={{ background: b.color }}
                      />
                      <span className="flex-1 text-[13.5px] font-semibold text-ink-soft">{b.label}</span>
                      <span className="tabular-nums text-[13.5px] font-bold text-ink-strong">
                        {formatInr(val)}
                      </span>
                      <span className="w-12 text-right tabular-nums text-[12px] font-semibold text-ink-subtle">
                        {pct.toFixed(0)}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <EmptyBox label="No salary lost this month — full attendance, or no CTC on file." />
          )}
        </Card>

        <Card
          title="Payroll Loss by Department"
          subtitle="Total ₹ lost per department (top 12)"
          icon={<BadgeIndianRupee size={18} strokeWidth={2.4} />}
        >
          {deptBars.length > 0 ? (
            <HBars data={deptBars} height={Math.max(200, deptBars.length * 34 + 40)} />
          ) : (
            <EmptyBox label="No department-level losses this month." />
          )}
        </Card>
      </div>

      {/* ── Per-department table ────────────────────────────────────── */}
      <Card
        title="Department Breakdown"
        subtitle={`Loss is ${lossPct.toFixed(1)}% of ${compactInr(data.totalMonthlyCtc)} monthly CTC`}
        icon={<BadgeIndianRupee size={18} strokeWidth={2.4} />}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-hairline-strong text-left">
                <Th>Department</Th>
                <Th align="right">People</Th>
                <Th align="right">Salary lost</Th>
                <Th align="right">Projected pay</Th>
              </tr>
            </thead>
            <tbody>
              {data.departments.map((d) => (
                <tr key={d.department} className="border-b border-hairline last:border-0">
                  <Td className="font-semibold text-ink-strong">{d.department}</Td>
                  <Td align="right" className="tabular-nums text-ink-soft">{d.headcount}</Td>
                  <Td align="right" className="tabular-nums font-bold" style={{ color: d.totalLoss > 0 ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)" }}>
                    {d.totalLoss > 0 ? formatInr(d.totalLoss) : "—"}
                  </Td>
                  <Td align="right" className="tabular-nums text-ink-soft">{formatInr(d.projectedPay)}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-hairline-strong">
                <Td className="font-black text-ink-strong">All departments</Td>
                <Td align="right" className="tabular-nums font-bold text-ink-strong">{data.headcount}</Td>
                <Td align="right" className="tabular-nums font-black" style={{ color: "var(--color-altus-red-deep)" }}>
                  {formatInr(data.totalSalaryLost)}
                </Td>
                <Td align="right" className="tabular-nums font-bold text-ink-strong">{formatInr(data.projectedPayroll)}</Td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ── Per-employee ₹ table ────────────────────────────────────── */}
      <Card
        title="Salary Lost by Person"
        subtitle="Highest loss first · click a row for the daily log"
        icon={<TrendingDown size={18} strokeWidth={2.4} />}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-hairline-strong text-left">
                <Th>Employee</Th>
                <Th align="right">Absent</Th>
                <Th align="right">Half</Th>
                <Th align="right">LWP</Th>
                <Th align="right">Late → cut</Th>
                <Th align="right">Per-day ₹</Th>
                <Th align="right">Salary lost</Th>
                <Th align="right">Projected pay</Th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((e) => (
                <EmployeeRow key={e.employeeId} e={e} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[12px] font-medium text-ink-subtle">
          Per-day rate = {data.perDayConvention}. Projected pay is an estimate (monthly CTC − salary
          lost) and ignores PT / TDS / advances / comp-off. Employees without a salary profile show
          counts only.
        </p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                       */
/* ------------------------------------------------------------------ */

function EmployeeRow({ e }: { e: FinanceEmployeeRow }) {
  const href = `/attendance/insights/employee/${e.employeeId}`;
  const lateCut = e.latePenaltyDays > 0 ? `${e.lateMarks} → ${days(e.latePenaltyDays)}d` : String(e.lateMarks);
  return (
    <tr className="group border-b border-hairline last:border-0 transition-colors hover:bg-surface-soft">
      <Td>
        <a
          href={href}
          className="inline-flex items-center gap-1.5 font-semibold text-ink-strong outline-none hover:text-[var(--color-altus-red-deep)] focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 rounded-sm"
        >
          <span className="truncate">{e.name}</span>
          <ArrowUpRight size={13} strokeWidth={2.4} className="opacity-0 transition-opacity group-hover:opacity-70" aria-hidden />
        </a>
        <div className="text-[12px] font-medium text-ink-subtle">
          {e.department ?? "Unassigned"}
          {!e.hasSalaryProfile && (
            <span className="ml-1.5 rounded-pill bg-surface-track px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-subtle">
              no CTC
            </span>
          )}
        </div>
      </Td>
      <Td align="right" className="tabular-nums text-ink-soft">{e.absentDays || "—"}</Td>
      <Td align="right" className="tabular-nums text-ink-soft">{e.halfDays || "—"}</Td>
      <Td align="right" className="tabular-nums text-ink-soft">{e.unpaidLeaveDays || "—"}</Td>
      <Td align="right" className="tabular-nums text-ink-soft">{lateCut}</Td>
      <Td align="right" className="tabular-nums text-ink-subtle">
        {e.hasSalaryProfile ? formatInr(e.perDay) : "—"}
      </Td>
      <Td
        align="right"
        className="tabular-nums font-bold"
        style={{ color: e.totalLoss > 0 ? "var(--color-altus-red-deep)" : "var(--color-ink-subtle)" }}
      >
        {e.hasSalaryProfile ? (e.totalLoss > 0 ? formatInr(e.totalLoss) : formatInr(0)) : "—"}
      </Td>
      <Td align="right" className="tabular-nums font-semibold text-ink-strong">
        {e.hasSalaryProfile ? formatInr(e.projectedPay) : "—"}
      </Td>
    </tr>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle ${align === "right" ? "text-right" : "text-left"}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className,
  style,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className={`px-3 py-2.5 align-middle ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}
      style={style}
    >
      {children}
    </td>
  );
}

function EmptyBox({ label }: { label: string }) {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-chip border border-solid border-hairline-strong bg-surface-soft px-4 py-8 text-center">
      <p className="text-[13.5px] font-medium text-ink-muted">{label}</p>
    </div>
  );
}
