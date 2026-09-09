import { CalendarDays } from "lucide-react";
import type { HrSheetDayCell } from "@/lib/queries/attendance-log";
import {
  HR_CODE_STYLES,
  HR_LEGEND_ORDER,
  hrCodeStyle,
  hrDateLabel,
  hrMonthLabel,
} from "@/components/attendance/hr-record/hr-codes";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The month's raw sheet codes laid out as a true Monday-first calendar —
 * each cell is the day number + the verbatim status code, colour-mapped
 * semantically (see hr-codes.ts). Hover/focus reveals the full date +
 * meaning. Read-only by design: nothing here mutates anything.
 */
export function HrDayGrid({ month, days }: { month: string; days: HrSheetDayCell[] }) {
  // Only real calendar days (the sheet always carries 31 columns; day
  // columns past the month's length come back with date === null).
  const realDays = days.filter((d) => d.date != null);

  // Monday-first offset of day 1.
  const [y, m] = month.split("-").map(Number);
  const firstDow = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, 1, 12)).getUTCDay(); // 0=Sun
  const offset = (firstDow + 6) % 7;

  return (
    <section
      className="wg-rise rounded-[22px] bg-surface-card p-6 max-md:p-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)",
        animationDelay: "120ms",
      }}
      aria-label={`Daily record — ${hrMonthLabel(month)}`}
    >
      <div className="mb-5 flex items-center gap-2.5">
        <span
          className="inline-grid size-9 place-items-center rounded-xl"
          style={{ background: "color-mix(in srgb, #E10600 10%, transparent)", color: "#A80400" }}
        >
          <CalendarDays size={18} strokeWidth={2.3} />
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
            Daily Record
          </h2>
          <p className="text-[13px] font-medium text-ink-subtle">
            {hrMonthLabel(month)} · sheet codes, verbatim
          </p>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1.5 max-md:gap-1">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="pb-1.5 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle"
            aria-hidden
          >
            <span className="max-sm:hidden">{w}</span>
            <span className="sm:hidden">{w[0]}</span>
          </div>
        ))}

        {/* Leading blanks so day 1 lands on its true weekday */}
        {Array.from({ length: offset }, (_, i) => (
          <div key={`pad-${i}`} aria-hidden />
        ))}

        {realDays.map((d, i) => {
          const s = hrCodeStyle(d.statusCode);
          const title = `${d.date ? hrDateLabel(d.date) : `Day ${d.day}`} · ${s.label}`;
          return (
            <div
              key={d.day}
              tabIndex={0}
              role="img"
              aria-label={title}
              title={title}
              className="wg-rise group relative flex min-h-[62px] flex-col justify-between rounded-xl px-2 py-1.5 outline-none transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#E10600]/60 focus-visible:ring-offset-1 max-md:min-h-[52px] max-md:px-1.5"
              style={{
                animationDelay: `${Math.min(i, 20) * 12}ms`,
                background: s.faint
                  ? "var(--color-surface-soft)"
                  : `color-mix(in srgb, ${s.accent} 9%, white)`,
                boxShadow: s.faint
                  ? "inset 0 0 0 1px var(--color-hairline)"
                  : `inset 0 0 0 1px color-mix(in srgb, ${s.accent} 26%, transparent)`,
              }}
            >
              <span
                className="tabular-nums text-[12.5px] font-black leading-none"
                style={{ color: s.faint ? "var(--color-ink-subtle)" : "var(--color-ink-strong)" }}
              >
                {d.day}
              </span>
              <span
                className="self-end text-[11px] font-black leading-none tracking-tight max-md:text-[9.5px]"
                style={{ color: s.faint ? "#94a3b8" : s.accent }}
              >
                {s.code}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-4">
        {HR_LEGEND_ORDER.map((code) => {
          const s = HR_CODE_STYLES[code];
          if (!s) return null;
          return (
            <span key={code} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted">
              <span
                aria-hidden
                className="inline-block size-3 rounded-[4px]"
                style={{
                  background: s.faint
                    ? "var(--color-surface-soft)"
                    : `color-mix(in srgb, ${s.accent} 14%, white)`,
                  boxShadow: s.faint
                    ? "inset 0 0 0 1px var(--color-hairline)"
                    : `inset 0 0 0 1px color-mix(in srgb, ${s.accent} 45%, transparent)`,
                }}
              />
              <span className="font-black" style={{ color: s.faint ? "#94a3b8" : s.accent }}>
                {s.code}
              </span>
              {s.label}
            </span>
          );
        })}
      </div>
    </section>
  );
}
