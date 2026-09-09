import { WORKER_TYPE_LABELS, type WorkerType } from "@/lib/attendance/worker-type";

/**
 * "What am I actually being measured against?" — the employee's own resolved
 * configuration, on screen (spec §10).
 *
 * Every figure here comes from `lib/attendance/effective-config.ts`, the same
 * resolver the grader and the salary engine read. Nothing is hardcoded: a
 * part-timer sees 4.5h / 27h, a full-timer sees 9h / 54h, and neither can be
 * shown the other's numbers.
 */
export interface ScheduleSummaryProps {
  workerType: WorkerType;
  officialStart: string;
  officialEnd: string;
  dailyTargetMinutes: number;
  weeklyTargetMinutes: number;
  /** Hours actually worked in the current week. */
  thisWeekMinutes: number;
  /** Running surplus/deficit for the CALENDAR MONTH (never carried over). */
  hourBalanceMinutes: number;
}

/** 270 → "4.5h", 540 → "9h", 3240 → "54h". */
function hours(min: number): string {
  const h = min / 60;
  const rounded = Math.round(h * 10) / 10;
  return `${rounded}h`;
}

/** Signed balance: "+2h", "0h", "−1.5h". */
function signedHours(min: number): string {
  if (min === 0) return "0h";
  const sign = min > 0 ? "+" : "−";
  return `${sign}${hours(Math.abs(min))}`;
}

function Stat({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "good" | "warn";
}) {
  const color =
    tone === "good"
      ? "var(--color-green-deep)"
      : tone === "warn"
        ? "var(--color-altus-red-deep)"
        : "var(--color-ink-strong)";
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
        {label}
      </div>
      <div
        className="mt-0.5 truncate text-[15px] font-black tabular-nums"
        style={{ color }}
      >
        {value}
      </div>
    </div>
  );
}

export function ScheduleSummary({
  workerType,
  officialStart,
  officialEnd,
  dailyTargetMinutes,
  weeklyTargetMinutes,
  thisWeekMinutes,
  hourBalanceMinutes,
}: ScheduleSummaryProps) {
  const weekMet = thisWeekMinutes >= weeklyTargetMinutes;
  return (
    <section
      className="wg-rise bg-surface-card rounded-[20px] p-5 max-md:p-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
      }}
      aria-label="My attendance configuration"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-black uppercase tracking-[0.12em] text-ink-subtle">
          My schedule
        </h2>
        <span className="text-[12px] font-semibold tabular-nums text-ink-subtle">
          {officialStart} – {officialEnd}
        </span>
      </div>

      <div className="grid grid-cols-5 gap-4 max-md:grid-cols-2">
        <Stat label="Employee Type" value={WORKER_TYPE_LABELS[workerType]} />
        <Stat label="Daily Target" value={hours(dailyTargetMinutes)} />
        <Stat label="Weekly Target" value={hours(weeklyTargetMinutes)} />
        <Stat
          label="This Week"
          value={hours(thisWeekMinutes)}
          tone={weekMet ? "good" : "plain"}
        />
        <Stat
          label="Hour Balance"
          value={signedHours(hourBalanceMinutes)}
          tone={
            hourBalanceMinutes > 0 ? "good" : hourBalanceMinutes < 0 ? "warn" : "plain"
          }
        />
      </div>

      <p className="mt-3 text-[11.5px] font-medium text-ink-subtle">
        Surplus hours carry across weeks inside this calendar month only — the
        balance resets to zero on the 1st.
      </p>
    </section>
  );
}
