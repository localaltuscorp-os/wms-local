"use client";

import * as React from "react";
import { monthWeeks, weekStart as mondayOf } from "@/lib/exec-calendar/grid";
import { formatDuration, runsOn, slotMinutes } from "@/lib/client-engagement/schedule";
import { isInactiveAccount } from "@/lib/client-engagement/status";
import type { CeAccountRow, CeEngagementRow } from "@/lib/queries/client-engagement";
import { CARD, CARD_SHADOW } from "./ui";

/**
 * THE MONTH VIEW (added 2026-09-22) — an overview, not a second scheduler.
 *
 * The week grid answers "does this person have room this week"; this answers
 * "which weeks are busy this month". A day cell shows how much is already
 * booked and nothing else — no click-to-schedule, no Hand-holding overlay, no
 * capacity stat — because none of that is a month-grain question. Clicking a
 * day opens ITS WEEK in the real calendar, which is where scheduling belongs.
 *
 * Reuses the exec calendar's date grid math (`monthWeeks`, pure and
 * CE-agnostic — Monday→Sunday rows with ISO week numbers) rather than
 * re-deriving the same month-layout arithmetic a second time in this module.
 */

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export function CeMonthGrid({
  anchor,
  today,
  engagements,
  accountById,
  onPickWeek,
}: {
  /** Any day inside the month to show. */
  anchor: string;
  today: string;
  /** This member's engagements only — the caller already scopes them. */
  engagements: CeEngagementRow[];
  accountById: Map<string, CeAccountRow>;
  onPickWeek: (monday: string) => void;
}) {
  const weeks = monthWeeks(anchor);

  const dayLoad = (ymd: string) => {
    let minutes = 0;
    let calls = 0;
    for (const e of engagements) {
      if (!runsOn(e, ymd)) continue;
      const account = accountById.get(e.accountId);
      if (account && isInactiveAccount(account)) continue;
      minutes += slotMinutes(e);
      calls += 1;
    }
    return { minutes, calls };
  };

  return (
    <div className={`${CARD} scroll-x-only`} style={CARD_SHADOW}>
      <div className="min-w-[640px]">
        <div className="grid bg-surface-soft" style={{ gridTemplateColumns: "40px repeat(7, 1fr)" }}>
          <div className="px-1 py-1.5 text-center text-[9.5px] font-bold uppercase text-ink-subtle">Wk</div>
          {WEEKDAYS.map((d) => (
            <div key={d} className="border-l border-hairline px-1 py-1.5 text-center text-[9.5px] font-bold uppercase text-ink-subtle">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((w) => (
          <div key={w.week} className="grid border-t border-hairline" style={{ gridTemplateColumns: "40px repeat(7, 1fr)" }}>
            <button
              type="button"
              onClick={() => onPickWeek(w.days[0]!.ymd)}
              className="flex items-center justify-center bg-surface-soft px-1 py-1 text-[10px] font-bold text-ink-subtle transition hover:bg-[var(--color-altus-red-wash)] hover:text-[var(--color-altus-red-deep)]"
              title={`Open week ${w.week}`}
            >
              {w.week}
            </button>
            {w.days.map((d) => {
              const { minutes, calls } = dayLoad(d.ymd);
              const isToday = d.ymd === today;
              return (
                <button
                  key={d.ymd}
                  type="button"
                  onClick={() => onPickWeek(mondayOf(d.ymd))}
                  className="min-h-[64px] border-l border-hairline p-1.5 text-left align-top transition hover:bg-surface-soft"
                  style={{
                    background: !d.inMonth ? "var(--color-surface-track)" : isToday ? "var(--color-altus-red-wash)" : undefined,
                    opacity: d.inMonth ? 1 : 0.55,
                  }}
                  title={calls ? `${calls} call${calls === 1 ? "" : "s"} · ${formatDuration(minutes)} — open this week` : "Open this week"}
                >
                  <span className={`block text-[11px] font-bold leading-none ${isToday ? "text-[var(--color-altus-red)]" : "text-ink-subtle"}`}>
                    {Number(d.ymd.slice(8, 10))}
                  </span>
                  {calls ? (
                    <span
                      className="mt-1.5 block whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums text-ink-muted"
                      style={{ background: "var(--color-surface-soft)" }}
                    >
                      {calls} · {formatDuration(minutes)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
