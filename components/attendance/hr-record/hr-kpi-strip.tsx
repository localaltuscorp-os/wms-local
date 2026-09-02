import {
  CalendarDays,
  CalendarRange,
  CircleCheckBig,
  CircleSlash,
  CircleDot,
  Landmark,
  BadgeCheck,
} from "lucide-react";
import type { AttendanceSheetMonth } from "@/db/schema";
import { CardGrid } from "@/components/layout/card-grid";
import { hrNum } from "@/components/attendance/hr-record/hr-codes";

/**
 * Read-only KPI fold over one HR-sheet month summary — Present / Absent /
 * Half-day / Weekly-off / Holiday / Total worked / Days-in-month. Pure
 * presentation: every number is already on the row the server loaded.
 */
export function HrKpiStrip({ summary }: { summary: AttendanceSheetMonth }) {
  const days = Number(summary.daysInMonth) || 0;
  const present = Number(summary.present) || 0;
  const worked = Number(summary.totalDaysWorked) || 0;
  const pohFull = Number(summary.pohFull) || 0;
  const pohHalf = Number(summary.pohHalf) || 0;

  const pohCaption =
    pohFull > 0 || pohHalf > 0
      ? `+ POH ${hrNum(summary.pohFull)} full · ${hrNum(summary.pohHalf)} half`
      : "paid holidays";

  const cards: {
    label: string;
    value: string;
    caption: string;
    accent: string;
    icon: React.ReactNode;
    progress?: number | null;
  }[] = [
    {
      label: "Present",
      value: hrNum(summary.present),
      caption: "days present",
      accent: "#16a34a",
      icon: <CircleCheckBig size={17} strokeWidth={2.4} />,
      progress: days > 0 ? present / days : null,
    },
    {
      label: "Absent",
      value: hrNum(summary.absent),
      caption: "days absent",
      accent: "#dc2626",
      icon: <CircleSlash size={17} strokeWidth={2.4} />,
    },
    {
      label: "Half day",
      value: hrNum(summary.halfDay),
      caption: "half days",
      accent: "#d97706",
      icon: <CircleDot size={17} strokeWidth={2.4} />,
    },
    {
      label: "Weekly off",
      value: hrNum(summary.weeklyOff),
      caption: "weekly offs",
      accent: "#64748b",
      icon: <CalendarDays size={17} strokeWidth={2.4} />,
    },
    {
      label: "Holiday",
      value: hrNum(summary.holiday),
      caption: pohCaption,
      accent: "#2563eb",
      icon: <Landmark size={17} strokeWidth={2.4} />,
    },
    {
      label: "Total worked",
      value: hrNum(summary.totalDaysWorked),
      caption: "payable days",
      accent: "#15803d",
      icon: <BadgeCheck size={17} strokeWidth={2.4} />,
      progress: days > 0 ? worked / days : null,
    },
    {
      label: "Days in month",
      value: hrNum(summary.daysInMonth),
      caption: "calendar days",
      accent: "#334155",
      icon: <CalendarRange size={17} strokeWidth={2.4} />,
    },
  ];

  return (
    <section aria-label="Month summary">
      <CardGrid min={150} gap="0.75rem">
      {cards.map((c, i) => (
        <div
          key={c.label}
          className="wg-rise rounded-2xl bg-surface-card px-4 py-3.5"
          style={{
            boxShadow:
              "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)",
            animationDelay: `${i * 45}ms`,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-grid size-7 shrink-0 place-items-center rounded-[9px]"
              style={{
                background: `color-mix(in srgb, ${c.accent} 10%, transparent)`,
                color: c.accent,
              }}
            >
              {c.icon}
            </span>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
              {c.label}
            </span>
          </div>
          <div
            className="mt-2 tabular-nums text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: 25,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {c.value}
          </div>
          <div className="mt-1 truncate text-[11.5px] font-medium text-ink-subtle" title={c.caption}>
            {c.caption}
          </div>
          {c.progress != null && (
            <div
              className="mt-2 h-1 w-full overflow-hidden rounded-full"
              style={{ background: "var(--color-surface-soft)" }}
              role="presentation"
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round(Math.max(0, Math.min(c.progress, 1)) * 100)}%`,
                  background: `linear-gradient(90deg, color-mix(in srgb, ${c.accent} 70%, white), ${c.accent})`,
                }}
              />
            </div>
          )}
        </div>
      ))}
      </CardGrid>
    </section>
  );
}
