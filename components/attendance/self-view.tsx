import { CalendarRange, Clock3, AlarmClock, LogOut, PieChart, IndianRupee } from "lucide-react";
import type { AttendanceSummary } from "@/lib/attendance/summary";
import type { SelfAttendanceSummary, SelfPeriodKey } from "@/lib/queries/attendance-summary";

/**
 * Attendance SELF-VIEW — the personal scorecard Sir asked for on the punch
 * screen. Three periods (This Week · This Month · Last Month), each spelling out
 * Present X/Y, Late, Early, Half-days, avg hours/day and — the point of the
 * whole thing — the ₹ salary that got reduced. This replaces the old
 * present-average / check-in-average vanity stats.
 */

const ACCENT = "#A80400"; // module accent (brand red)
const OK_GREEN = "#15803d"; // green = good outcome (no salary reduced)
const RED = "var(--color-altus-red)";

const inr = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const num = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

interface Segment {
  key: SelfPeriodKey;
  label: string;
  sub: string;
}

const SEGMENTS: Segment[] = [
  { key: "thisWeek", label: "This Week", sub: "Mon → today" },
  { key: "thisMonth", label: "This Month", sub: "to date" },
  { key: "lastMonth", label: "Last Month", sub: "final" },
];

/** 3240 → "54", 1620 → "27". */
function targetHoursLabel(min: number): string {
  const h = Math.round((min / 60) * 10) / 10;
  return String(h);
}

export function SelfView({
  data,
  weeklyTargetMinutes,
  monthlyHalfDayGrace,
}: {
  data: SelfAttendanceSummary;
  /** THIS employee's weekly requirement. Part-timers must never be shown 54h. */
  weeklyTargetMinutes: number;
  /** Half-days forgiven per calendar month before salary is touched. */
  monthlyHalfDayGrace: number;
}) {
  return (
    <section
      className="wg-rise rounded-[22px] bg-surface-card p-6 max-md:p-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
        animationDelay: "80ms",
      }}
    >
      {/* header */}
      <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-grid size-9 place-items-center rounded-xl"
            style={{ background: "color-mix(in srgb, #E10600 10%, transparent)", color: ACCENT }}
          >
            <PieChart size={18} strokeWidth={2.3} />
          </span>
          <div>
            <h2
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 21,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              My Attendance
            </h2>
            <p className="text-[13px] font-medium text-ink-subtle">
              Present, late, early &amp; the salary it costs
            </p>
          </div>
        </div>
      </div>

      {/* 3 period segments */}
      <div className="grid grid-cols-3 gap-3.5 max-md:grid-cols-1">
        {SEGMENTS.map((seg, i) => (
          <PeriodCard key={seg.key} seg={seg} s={data[seg.key]} delay={i * 60} />
        ))}
      </div>

      {/* rules caption */}
      <p className="mt-4 text-[12px] leading-relaxed font-medium text-ink-subtle">
        <span className="font-bold text-ink-strong">Fair-play rules:</span> hit
        <span className="tabular-nums font-bold text-ink-strong">
          {" "}{targetHoursLabel(weeklyTargetMinutes)} h
        </span>{" "}
        in a Mon–Sat week and every late / early / half-day that week is waived (the week reads as full days). Surplus hours carry to later weeks in the same month. After that, your first
        <span className="tabular-nums font-bold text-ink-strong"> {monthlyHalfDayGrace}</span> half-days each month are warnings only; from the next one each costs
        <span className="tabular-nums font-bold text-ink-strong"> ½ day</span>. Salary reduced = deducted days × your per-day rate.
      </p>
    </section>
  );
}

function PeriodCard({ seg, s, delay }: { seg: Segment; s: AttendanceSummary; delay: number }) {
  const reduced = s.salaryReduced;
  const hasCut = reduced > 0;
  return (
    <div
      className="wg-rise relative overflow-hidden rounded-[18px] p-4"
      style={{
        background: "var(--color-surface-soft)",
        boxShadow: "inset 0 0 0 1px var(--color-hairline)",
        animationDelay: `${delay}ms`,
      }}
    >
      {/* period label */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: ACCENT }}>
          <CalendarRange size={13} strokeWidth={2.6} />
          {seg.label}
        </span>
        <span className="text-[11px] font-semibold text-ink-subtle">{seg.sub}</span>
      </div>

      {/* Present X / Y hero */}
      <div className="mt-3 flex items-baseline gap-1.5">
        <span
          className="tabular-nums text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 34, letterSpacing: "-0.03em", lineHeight: 1 }}
        >
          {num(s.presentDays)}
        </span>
        <span className="tabular-nums text-[16px] font-bold text-ink-subtle">/ {s.workingDays}</span>
      </div>
      <div className="mt-0.5 text-[12px] font-semibold text-ink-subtle">days present</div>

      {/* mini metric grid */}
      <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Metric icon={<AlarmClock size={13} strokeWidth={2.4} />} label="Late" value={`${s.lateDays}`} warn={s.lateDays > 0} />
        <Metric icon={<LogOut size={13} strokeWidth={2.4} />} label="Early" value={`${s.earlyDays}`} warn={s.earlyDays > 0} />
        <Metric icon={<PieChart size={13} strokeWidth={2.4} />} label="Half-days" value={`${s.halfDays}`} warn={s.halfDays > 0} />
        <Metric icon={<Clock3 size={13} strokeWidth={2.4} />} label="Avg / day" value={`${num(s.avgHoursPerDay)} h`} />
      </div>

      {/* salary reduced */}
      <div
        className="mt-3.5 flex items-center justify-between gap-2 rounded-[13px] px-3 py-2.5"
        style={{
          background: hasCut ? `color-mix(in srgb, ${RED} 9%, transparent)` : "color-mix(in srgb, #16a34a 8%, transparent)",
          boxShadow: `inset 0 0 0 1px ${hasCut ? `color-mix(in srgb, ${RED} 22%, transparent)` : "color-mix(in srgb, #16a34a 20%, transparent)"}`,
        }}
      >
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.1em]" style={{ color: hasCut ? RED : OK_GREEN }}>
          <IndianRupee size={13} strokeWidth={2.8} />
          Salary reduced
        </span>
        <span
          className="tabular-nums"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 19, letterSpacing: "-0.02em", color: hasCut ? RED : OK_GREEN }}
        >
          ₹{inr(reduced)}
        </span>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  warn = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="min-w-0">
      <span className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
        <span style={{ color: warn ? RED : "var(--color-ink-subtle)" }}>{icon}</span>
        {label}
      </span>
      <span
        className="mt-0.5 block tabular-nums font-black"
        style={{ fontSize: 17, letterSpacing: "-0.02em", color: warn ? RED : "var(--color-ink-strong)" }}
      >
        {value}
      </span>
    </div>
  );
}
