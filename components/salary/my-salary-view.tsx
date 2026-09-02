"use client";

import * as React from "react";
import {
  Wallet,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  Receipt,
  Plus,
  Minus,
} from "lucide-react";
import { MonthCalendar, type MonthCell } from "@/components/attendance/month-calendar";

/**
 * Shape assembled server-side by `lib/salary/my-salary.ts`. The money always
 * comes from the payroll engine; `hourly` only decides how the month is
 * PRESENTED — hours for the shifts whose pay tracks hours, days for everyone
 * else.
 */
export interface MySalaryMonth {
  month: string; // 'YYYY-MM'
  label: string; // 'July 2026'
  designation: string | null;
  companyName: string | null;
  /** "live" = computed just now for the open month. */
  source: "live" | "run" | "legacy";
  /** The graded calendar for this month — same cells the Attendance page draws. */
  cells: MonthCell[];
  /** This employee's OWN weekly target; the calendar must not fall back to 54h. */
  weekTargetMinutes: number | null;
  monthlyCtc: number;
  /** Earnings before overtime. `baseAmount + overtimeAmount === gross`. */
  baseAmount: number;
  overtimeAmount: number;
  /** Server-computed attendance reduction (₹0 for hourly staff). Same figure the
   *  Attendance KPI shows — never re-derived in the browser. */
  attendanceDeduction: number;
  gross: number;
  pt: number;
  advance: number;
  previousPending: number;
  finalPayment: number;
  salaryGiven: number | null;
  hourly: boolean;
  workedHours: number | null;
  targetHours: number | null;
  overtimeHours: number;
  hourlyRate: number | null;
  present: number;
  absent: number;
  halfDay: number;
  finalWorkingDays: number;
  daysInMonth: number;
  paid: boolean;
  remarks: string | null;
}

/** "4h" not "4.00h"; "1.5h" keeps its half. */
function hrs(h: number): string {
  return `${Number.isInteger(h) ? h : Math.round(h * 100) / 100}h`;
}

function inr(n: number): string {
  const whole = Number.isInteger(n);
  return (
    "₹" +
    n.toLocaleString("en-IN", whole ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

/** Day counts are halves as often as not — "18.5" must not render as "18.5000". */
function fmtDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * My Salary — the employee's OWN self-service pay view. Read-only: a net-pay
 * card with the month picker built in, the full "how it's calculated" breakdown
 * (compact by default, expandable to every attendance / hours / salary figure),
 * the attendance KPIs and the graded calendar. No other person's data is loaded.
 *
 * ── ONE SET OF NUMBERS ─────────────────────────────────────────────────────
 * Every figure here is read from the server-graded month (`MySalaryMonth` +
 * its calendar cells) — the SAME source the Attendance page uses. Nothing is
 * recomputed on the client beyond formatting and summing rows that already add
 * up, so this page and the Attendance page can never disagree.
 */
export function MySalaryView({ months }: { months: MySalaryMonth[] }) {
  const [sel, setSel] = React.useState(0);
  const [showDetail, setShowDetail] = React.useState(false);
  const m = months[sel];

  if (!m) {
    return (
      <div className="rounded-3xl border border-solid border-hairline-strong bg-surface-card p-12 text-center">
        <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl" style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-soft)" }}>
          <Wallet size={22} strokeWidth={2.2} />
        </span>
        <p className="text-[15px] font-semibold text-ink-muted">No salary records yet.</p>
        <p className="mt-1 text-[13px] text-ink-subtle">Your monthly salary will appear here once it's processed.</p>
      </div>
    );
  }

  const paidAmount = m.salaryGiven ?? m.finalPayment;
  // Post-gross deductions net of any carried balance — pt + advance − pending.
  // Defined as gross − final so the compact card always reconciles exactly.
  const deductions = Math.round((m.gross - m.finalPayment) * 100) / 100;
  // The attendance-driven reduction of base pay — the SAME "Salary Lost" the
  // Attendance KPI shows. Computed server-side (see MySalaryMonth.attendanceDeduction:
  // ₹0 for hourly staff, monthly shortfall for a full-timer) so the browser never
  // re-derives it and the two surfaces can never disagree.
  const attendanceDeduction = Math.round(m.attendanceDeduction * 100) / 100;
  // Signed: pending carried in, minus PT and advance taken out.
  const otherAdjustments = Math.round((m.previousPending - m.pt - m.advance) * 100) / 100;

  // Leave / extra-day counts come from the graded calendar — the same cells the
  // Attendance page draws — over the ELAPSED days, so they stay consistent with
  // the present/absent KPIs (which are elapsed-only).
  const elapsed = m.cells.filter((c) => !c.future);
  const paidLeaveDays = elapsed.filter((c) => c.code === "PL" || c.code === "CO").length;
  const unpaidLeaveDays = elapsed.filter((c) => c.code === "LWP").length;
  const extraDaysWorked = elapsed.filter((c) => c.code === "HP").length;

  const requiredHours = m.targetHours;
  const workedHours = m.workedHours;
  const lessHours =
    requiredHours != null && workedHours != null ? Math.max(0, requiredHours - workedHours) : null;

  return (
    <div className="space-y-6">
      {/* ── NET PAY — the month picker lives here, top-right ─────────────── */}
      <div className="wg-rise rounded-2xl border border-hairline bg-surface-card px-5 py-4 max-md:px-4 max-md:py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-ink-muted">
            <Wallet size={14} strokeWidth={2.6} /> Net pay · {m.label}
          </div>
          {months.length > 1 && (
            <div className="relative shrink-0">
              <select
                aria-label="Select month"
                value={sel}
                onChange={(e) => {
                  setSel(Number(e.target.value));
                  setShowDetail(false);
                }}
                className="cursor-pointer appearance-none rounded-lg border border-hairline bg-surface-soft py-1.5 pl-3 pr-8 text-[13px] font-bold text-ink-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--color-altus-red)_45%,transparent)]"
              >
                {months.map((mo, i) => (
                  <option key={mo.month} value={i}>
                    {mo.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle" />
            </div>
          )}
        </div>

        <div className="mt-1.5 tabular-nums leading-none text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(26px, 3.4vw, 38px)" }}>
          {inr(m.finalPayment)}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          {m.designation ? (
            <p className="text-[12.5px] font-semibold text-ink-muted">
              {m.designation}
              {m.companyName ? ` · ${m.companyName}` : ""}
            </p>
          ) : (
            <span />
          )}
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-black"
            style={{
              background: "var(--color-surface-soft)",
              color: m.paid ? "var(--color-green-deep)" : "var(--color-ink-muted)",
            }}
          >
            {m.paid ? <CheckCircle2 size={15} strokeWidth={2.6} /> : <Clock size={15} strokeWidth={2.6} />}
            {m.paid ? `Paid · ${inr(paidAmount)}` : "Payment Pending"}
          </span>
        </div>
      </div>

      {/* ── HOW YOUR SALARY IS CALCULATED — compact, expandable ──────────── */}
      <div className="wg-rise rounded-3xl border border-hairline bg-surface-card p-5" style={{ animationDelay: "60ms" }}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[13px] font-black uppercase tracking-[0.07em] text-ink-muted">
            <Receipt size={15} className="text-ink-subtle" /> How your salary is calculated
          </h2>
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            aria-expanded={showDetail}
            aria-label={showDetail ? "Hide full breakdown" : "Show full breakdown"}
            className="grid size-7 shrink-0 place-items-center rounded-lg border border-hairline text-ink-soft transition-colors hover:text-ink-strong"
          >
            {showDetail ? <Minus size={15} strokeWidth={2.6} /> : <Plus size={15} strokeWidth={2.6} />}
          </button>
        </div>

        {/* Compact — base + overtime − deductions = final, always. */}
        <div className="space-y-0.5">
          <Line label="Base Salary" value={inr(m.baseAmount)} />
          {m.overtimeAmount > 0 && <Line label="Additional Hours Pay" value={`+ ${inr(m.overtimeAmount)}`} gain />}
          <Line label="Deductions" value={deductions > 0 ? `− ${inr(deductions)}` : inr(0)} deduct={deductions > 0} />
          <div className="my-2 border-t border-solid border-hairline-strong" />
          <div className="flex items-center justify-between rounded-xl bg-surface-soft px-3 py-3">
            <span className="text-[14px] font-black text-ink-strong">Final Payment</span>
            <span className="text-[18px] font-black tabular-nums text-ink-strong">{inr(m.finalPayment)}</span>
          </div>
        </div>

        {/* Full breakdown — every figure from the graded month + payroll engine. */}
        {showDetail && (
          <div className="mt-4 border-t border-solid border-hairline pt-2">
            <Section title="Attendance">
              <Line label="Working Days" value={fmtDays(m.finalWorkingDays)} muted />
              <Line label="Effective Days Worked" value={fmtDays(m.present)} muted />
              <Line label="Half Days" value={fmtDays(m.halfDay)} muted />
              <Line label="Absent Days" value={fmtDays(m.absent)} muted />
              <Line label="Paid Leave" value={fmtDays(paidLeaveDays)} muted />
              <Line label="Unpaid Leave" value={fmtDays(unpaidLeaveDays)} muted />
              <Line label="Extra Days Worked" value={fmtDays(extraDaysWorked)} muted />
            </Section>

            <Section title="Hours">
              {requiredHours != null && <Line label="Required Hours" value={hrs(requiredHours)} muted />}
              {workedHours != null && <Line label="Hours Worked" value={hrs(workedHours)} muted />}
              <Line label="Additional Hours" value={hrs(m.overtimeHours)} muted />
              {lessHours != null && <Line label="Less Hours" value={hrs(lessHours)} muted />}
            </Section>

            <Section title="Salary">
              <Line label="Monthly Salary / CTC" value={inr(m.monthlyCtc)} muted />
              <Line label="Base Earned" value={inr(m.baseAmount)} muted />
              {m.overtimeAmount > 0 && <Line label="Additional Hours Pay" value={`+ ${inr(m.overtimeAmount)}`} gain />}
              <Line
                label="Attendance Deduction"
                value={attendanceDeduction > 0 ? `− ${inr(attendanceDeduction)}` : inr(0)}
                deduct={attendanceDeduction > 0}
              />
              <Line
                label="Other Adjustments"
                value={
                  otherAdjustments === 0
                    ? inr(0)
                    : `${otherAdjustments > 0 ? "+ " : "− "}${inr(Math.abs(otherAdjustments))}`
                }
                deduct={otherAdjustments < 0}
                gain={otherAdjustments > 0}
              />
              <div className="my-1.5 border-t border-solid border-hairline" />
              <Line label="Final Payment" value={inr(m.finalPayment)} />
            </Section>
          </div>
        )}
      </div>

      {m.remarks && (
        <div className="rounded-2xl border border-hairline bg-surface-card p-4 text-[13.5px] text-ink-soft">
          <span className="font-bold text-ink-strong">Note: </span>
          {m.remarks}
        </div>
      )}

      {/* ── ATTENDANCE KPIs + the graded calendar for the selected month ──── */}
      {m.cells.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
            <KpiCard
              label="Days worked"
              value={`${fmtDays(m.present)} / ${fmtDays(m.finalWorkingDays)}`}
              hint="of your working days"
              tone="green"
            />
            <KpiCard label="Half days" value={fmtDays(m.halfDay)} hint="counted as half a day each" />
            <KpiCard
              label="Absent"
              value={fmtDays(m.absent)}
              hint="no punch, no approved leave"
              tone={m.absent > 0 ? "red" : undefined}
            />
          </div>
          <MonthCalendar
            cells={m.cells}
            monthLabel={m.label}
            compact
            weekTargetMinutes={m.weekTargetMinutes ?? undefined}
          />
        </div>
      )}

      {/* History quick list — pay per month; selecting one drives the page. */}
      {months.length > 1 && (
        <div className="rounded-3xl border border-hairline bg-surface-card p-2">
          <p className="px-3 pb-1 pt-2 text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">History</p>
          {months.map((mo, i) => (
            <button
              key={mo.month}
              type="button"
              onClick={() => {
                setSel(i);
                setShowDetail(false);
              }}
              aria-current={i === sel ? "true" : undefined}
              className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition-colors ${i === sel ? "bg-surface-soft" : "hover:bg-surface-soft/60"}`}
            >
              <span className="flex items-center gap-3">
                <span
                  className="grid size-8 place-items-center rounded-lg bg-surface-soft"
                  style={{ color: mo.paid ? "var(--color-green-deep)" : "var(--color-ink-soft)" }}
                >
                  {mo.paid ? <CheckCircle2 size={15} /> : <Clock size={15} />}
                </span>
                <span className="text-[14px] font-bold text-ink-strong">{mo.label}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-[14px] font-black tabular-nums text-ink-strong">{inr(mo.finalPayment)}</span>
                <ChevronRight size={16} className="text-ink-subtle" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A titled group inside the expanded breakdown. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 first:mt-1">
      <p className="px-3 pb-1 pt-2 text-[14.5px] font-bold uppercase tracking-[0.14em] text-ink-muted">
        {title}
      </p>
      {children}
    </div>
  );
}

function Line({
  label,
  value,
  muted,
  deduct,
  gain,
}: {
  label: string;
  value: string;
  muted?: boolean;
  /** A subtraction — renders red. */
  deduct?: boolean;
  /** Money ADDED — green, so it reads as earnings at a glance. */
  gain?: boolean;
}) {
  const tone = deduct ? "text-altus-red" : gain ? "text-[#16a34a]" : "text-ink-strong";
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className={`text-[13.5px] font-semibold ${muted ? "text-ink-muted" : "text-ink-soft"}`}>
        {label}
      </span>
      <span className={`text-[14px] font-bold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

/** One headline attendance number with a tone and a sentence under it. */
function KpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "green" | "red";
}) {
  const fg =
    tone === "green" ? "#16a34a" : tone === "red" ? "var(--color-altus-red)" : "var(--color-ink-strong)";
  return (
    <div className="rounded-2xl border border-hairline bg-surface-card px-4 py-3.5">
      <div className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">{label}</div>
      <div className="mt-1 text-[26px] font-black leading-none tabular-nums" style={{ color: fg }}>
        {value}
      </div>
      <div className="mt-1.5 text-[12px] text-ink-subtle">{hint}</div>
    </div>
  );
}
