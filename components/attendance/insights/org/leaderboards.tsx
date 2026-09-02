"use client";

import * as React from "react";
import { Timer, AlarmClock, UserX, Clock, Award } from "lucide-react";
import type { OrgLeaderboards, LeaderRow } from "@/lib/attendance/analytics/org";

/**
 * Leaderboards — a segmented switcher over the five org rankings. Each board is
 * a compact ranked list with a rank chip, name/department and a coloured value
 * pill. Rows link to the per-employee drill dashboard.
 */

type BoardKey = keyof OrgLeaderboards;

const BOARDS: { key: BoardKey; label: string; icon: React.ReactNode; tone: string; suffix?: string; caption: string }[] = [
  { key: "mostPunctual", label: "Most Punctual", icon: <Timer size={15} strokeWidth={2.3} />, tone: "var(--color-green-deep)", suffix: "%", caption: "On-time rate" },
  { key: "bestAttendance", label: "Best Attendance", icon: <Award size={15} strokeWidth={2.3} />, tone: "var(--color-teal-deep)", suffix: "%", caption: "Effective attendance" },
  { key: "highestHours", label: "Highest Hours", icon: <Clock size={15} strokeWidth={2.3} />, tone: "var(--color-indigo-deep, #4338ca)", suffix: "h", caption: "Total worked hours" },
  { key: "mostLate", label: "Most Late", icon: <AlarmClock size={15} strokeWidth={2.3} />, tone: "var(--color-amber-deep)", caption: "Un-waived late marks" },
  { key: "mostAbsent", label: "Most Absent", icon: <UserX size={15} strokeWidth={2.3} />, tone: "var(--color-altus-red-deep)", caption: "Absent days" },
];

export function Leaderboards({ boards }: { boards: OrgLeaderboards }) {
  const [active, setActive] = React.useState<BoardKey>("mostPunctual");
  const meta = BOARDS.find((b) => b.key === active)!;
  const rows = boards[active];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Leaderboards">
        {BOARDS.map((b) => {
          const on = b.key === active;
          return (
            <button
              key={b.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(b.key)}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/50"
              style={
                on
                  ? { color: "#fff", background: b.tone }
                  : { color: "var(--color-ink-soft)", background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }
              }
            >
              {b.icon}
              {b.label}
            </button>
          );
        })}
      </div>

      <p className="text-[12.5px] font-medium text-ink-muted">{meta.caption}</p>

      {rows.length === 0 ? (
        <div className="flex min-h-[120px] items-center justify-center rounded-chip border border-solid border-hairline-strong bg-surface-soft px-4 py-8 text-center">
          <p className="text-[13.5px] font-medium text-ink-muted">No one qualifies for this board yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {rows.map((r, i) => (
            <LeaderItem key={r.employeeId} row={r} rank={i + 1} tone={meta.tone} suffix={meta.suffix} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LeaderItem({ row, rank, tone, suffix }: { row: LeaderRow; rank: number; tone: string; suffix?: string }) {
  const medal = rank <= 3;
  return (
    <li>
      <a
        href={`/attendance/insights/employee/${row.employeeId}`}
        className="group flex items-center gap-3 py-2.5 transition-colors hover:bg-surface-soft rounded-lg px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/50"
      >
        <span
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full tabular-nums font-black"
          style={{
            fontSize: 12,
            color: medal ? "#fff" : "var(--color-ink-strong)",
            background: medal ? tone : "rgba(15,23,42,0.05)",
          }}
        >
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold text-ink-strong group-hover:text-[var(--color-altus-red-deep)]" style={{ fontSize: 14 }}>
            {row.name}
          </div>
          <div className="truncate text-[12px] font-medium text-ink-muted">
            {row.department ?? "Unassigned"} · {row.detail}
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 tabular-nums font-black"
          style={{ fontSize: 13, color: tone, background: `color-mix(in srgb, ${tone} 13%, transparent)` }}
        >
          {row.value.toLocaleString()}
          {suffix}
        </span>
      </a>
    </li>
  );
}
