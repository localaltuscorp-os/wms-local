"use client";

import * as React from "react";
import {
  IndianRupee,
  Clock,
  Scale,
  CalendarCheck,
  PieChart,
  CalendarPlus,
  ShieldCheck,
  AlarmClock,
  LogOut,
  CalendarX,
  Home,
  Briefcase,
  Building2,
} from "lucide-react";
import type {
  SelfAttendanceSummary,
  SelfPeriod,
  SelfPeriodKey,
} from "@/lib/queries/attendance-summary";

/**
 * THE attendance KPI bar — one consolidated section, one period toggle.
 *
 * ── WHAT'S ON IT, AND WHEN ─────────────────────────────────────────────────
 * A KPI shows only when it has something to say. Every tile except Salary Lost
 * hides at zero and the survivors reflow to fill the row — a permanent "Half
 * days 0 / Late 0 / WFH 0" is three tiles of nothing, and reading them is work.
 * Salary Lost is the one exception: ₹0 is the good news the bar exists to give,
 * so it is always present, as a solid red box.
 *
 * ── ONE OR TWO ROWS, SIZED TO FIT ──────────────────────────────────────────
 * Up to six visible tiles sit in ONE comfortable row; a seventh tips the bar
 * into TWO balanced rows whose tiles shrink a little so the pair is no taller
 * than the single row was. The column count is derived from how many tiles
 * actually survived (`ceil(n/2)` for two rows), so the rows are even and the
 * last one never strands a lone card against the left edge.
 *
 * ── ONE SOURCE OF TRUTH ────────────────────────────────────────────────────
 * Every number here is a field on `SelfPeriod`, computed server-side in
 * lib/queries/attendance-summary.ts from the SAME graded days, schedule
 * resolver, hour-balance reconciliation and salary rate the payslip uses. There
 * is no arithmetic in this file beyond formatting and summing Grace + Condoned.
 */

const GREEN = "#15803d";
const AMBER = "#b45309";
const RED = "#b91c1c";
const BLUE = "#1d4ed8";
const TEAL = "#0f766e";
const SLATE = "#475569";

const PERIODS: { key: SelfPeriodKey; label: string }[] = [
  { key: "thisWeek", label: "This Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "last3Months", label: "Last 3 Months" },
];

const h = (n: number) => `${Math.round(n * 10) / 10}h`;
/** Always carries its sign — "+6.9h" / "−6.9h". A bare "6.9h" is ambiguous. */
const signedH = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${h(Math.abs(n))}`;
/** 2.5 → "2.5", 3 → "3". Half-days survive; whole numbers don't grow a ".0". */
const num = (n: number) => (n === Math.trunc(n) ? String(n) : n.toFixed(1));

interface Kpi {
  key: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  /** Small trailing unit, e.g. "/ 20h" or "of 4". */
  sub?: string;
  tone: string;
  /** Draws the attention tint (soft bg + coloured border). */
  warn?: boolean;
  /** Salary Lost only: a solid red box with white text. */
  solid?: boolean;
}

export function AttendanceKpiStrip({
  data,
  /** Card heading. Overridden when an admin reads SOMEONE ELSE's record —
   *  "How am I doing" is a first-person claim over another person's numbers. */
  title = "How am I doing",
}: {
  data: SelfAttendanceSummary;
  title?: string;
}) {
  const [period, setPeriod] = React.useState<SelfPeriodKey>("thisWeek");
  const s: SelfPeriod = data[period];
  const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  const workedAhead = s.requiredElapsedHours <= 0 || s.workedHours >= s.requiredElapsedHours;
  const graceCondoned = s.graceDays + s.condonedDays;

  // Spec order. `show` decides visibility; everything but Salary Lost, Hrs
  // Worked and Effective Days hides at its zero. The survivors reflow.
  const all: (Kpi & { show: boolean })[] = [
    // ── Row 1 ──────────────────────────────────────────────────────────────
    {
      key: "salary",
      icon: <IndianRupee size={15} strokeWidth={2.4} />,
      label: "Salary Lost",
      value: inr(s.salaryReduced),
      tone: RED,
      solid: true,
      show: true,
    },
    {
      key: "hrsWorked",
      icon: <Clock size={15} strokeWidth={2.4} />,
      label: "Hrs Worked",
      value: h(s.workedHours),
      sub: `/ ${h(s.requiredElapsedHours)}`,
      tone: workedAhead ? GREEN : AMBER,
      show: true,
    },
    {
      key: "hrsBalance",
      icon: <Scale size={15} strokeWidth={2.4} />,
      label: "Hrs Balance",
      value: signedH(s.hoursBalance),
      tone: s.hoursBalance >= 0 ? GREEN : RED,
      warn: s.hoursBalance < 0,
      show: s.hoursBalance !== 0,
    },
    {
      key: "effective",
      icon: <CalendarCheck size={15} strokeWidth={2.4} />,
      label: "Effective Days Worked",
      value: num(s.presentDays),
      sub: `of ${num(s.workingDays)}`,
      tone: GREEN,
      show: true,
    },
    {
      key: "half",
      icon: <PieChart size={15} strokeWidth={2.4} />,
      label: "Half Days",
      value: num(s.halfDays),
      tone: AMBER,
      warn: true,
      show: s.halfDays > 0,
    },
    {
      key: "extra",
      icon: <CalendarPlus size={15} strokeWidth={2.4} />,
      label: "Extra Days Worked",
      value: num(s.extraDaysWorked),
      tone: TEAL,
      show: s.extraDaysWorked > 0,
    },
    // ── Row 2 ──────────────────────────────────────────────────────────────
    {
      key: "grace",
      icon: <ShieldCheck size={15} strokeWidth={2.4} />,
      label: "Grace + Condoned",
      value: num(graceCondoned),
      tone: SLATE,
      show: graceCondoned > 0,
    },
    {
      key: "late",
      icon: <AlarmClock size={15} strokeWidth={2.4} />,
      label: "Arrived Late",
      value: num(s.lateDays),
      tone: AMBER,
      warn: true,
      show: s.lateDays > 0,
    },
    {
      key: "early",
      icon: <LogOut size={15} strokeWidth={2.4} />,
      label: "Left Early",
      value: num(s.earlyDays),
      tone: AMBER,
      warn: true,
      show: s.earlyDays > 0,
    },
    {
      key: "absent",
      icon: <CalendarX size={15} strokeWidth={2.4} />,
      label: "Days Absent",
      value: num(s.absentDays),
      tone: RED,
      warn: true,
      show: s.absentDays > 0,
    },
    {
      key: "wfh",
      icon: <Home size={15} strokeWidth={2.4} />,
      label: "WFH Days",
      value: num(s.wfhDays),
      tone: BLUE,
      show: s.wfhDays > 0,
    },
    {
      key: "field",
      icon: <Briefcase size={15} strokeWidth={2.4} />,
      label: "On Field Days",
      value: num(s.fieldDays),
      tone: BLUE,
      show: s.fieldDays > 0,
    },
    {
      key: "clientSite",
      icon: <Building2 size={15} strokeWidth={2.4} />,
      label: "Client Site Days",
      value: num(s.clientSiteDays),
      tone: BLUE,
      show: s.clientSiteDays > 0,
    },
  ];

  const kpis = all.filter((k) => k.show);
  const n = kpis.length;

  // ── DYNAMIC SIZING ─────────────────────────────────────────────────────────
  // ≤6 tiles → one comfortable row (cols = n). 7+ → two balanced rows, the
  // column count derived from the survivor count so the rows are even and the
  // second never strands a single card. Tiles shrink in the two-row case so the
  // pair is no taller than the single row it replaced.
  const twoRows = n > 6;
  const cols = twoRows ? Math.ceil(n / 2) : n;
  const gap = twoRows ? 9 : 10;

  const cardBase: React.CSSProperties = {
    flex: `1 1 calc(100% / ${cols} - ${gap}px)`,
    minWidth: 150,
    minHeight: twoRows ? 82 : 104,
    padding: twoRows ? 11 : 14,
  };
  const valueSize = twoRows ? 21 : 23;

  return (
    <section
      className="wg-rise w-full rounded-[20px] bg-surface-card p-3.5 max-md:p-3"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          className="text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: 16,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>
        <div className="inline-flex rounded-chip border border-hairline bg-surface-soft p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              aria-pressed={period === p.key}
              className="rounded-[9px] px-2.5 py-1 text-[11.5px] font-bold transition-colors"
              style={
                period === p.key
                  ? { background: "linear-gradient(135deg,#E10600,#A80400)", color: "#fff" }
                  : { color: "var(--color-ink-muted)" }
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Balanced flex layout: exactly `cols` tiles per row on a wide screen
          (flex-grow fills the row), wrapping to fewer as the width drops so it
          never overflows or strands an uneven remainder. */}
      <div className="flex flex-wrap" style={{ gap }}>
        {kpis.map((k) => (
          <div
            key={k.key}
            className="min-w-0 rounded-xl border"
            style={{
              ...cardBase,
              ...(k.solid
                ? { borderColor: RED, background: RED, color: "#fff" }
                : {
                    borderColor: k.warn
                      ? `color-mix(in srgb, ${k.tone} 30%, transparent)`
                      : "var(--color-hairline)",
                    background: k.warn
                      ? `color-mix(in srgb, ${k.tone} 5%, transparent)`
                      : undefined,
                  }),
            }}
          >
            <div
              className="flex items-start gap-1 text-[9.5px] font-bold uppercase leading-tight tracking-wide"
              style={{ color: k.solid ? "#fff" : k.tone }}
            >
              <span className="mt-px shrink-0">{k.icon}</span>
              <span className="min-w-0">{k.label}</span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span
                className="font-black tabular-nums"
                style={{
                  fontSize: valueSize,
                  letterSpacing: "-0.02em",
                  color: k.solid ? "#fff" : "var(--color-ink-strong)",
                }}
              >
                {k.value}
              </span>
              {k.sub && (
                <span
                  className="text-[11.5px] font-semibold"
                  style={{
                    color: k.solid ? "rgba(255,255,255,0.85)" : "var(--color-ink-subtle)",
                  }}
                >
                  {k.sub}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
