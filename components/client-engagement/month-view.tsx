"use client";

import * as React from "react";
import { monthWeeks, weekStart as mondayOf } from "@/lib/exec-calendar/grid";
import { formatDuration, runsOn, slotMinutes } from "@/lib/client-engagement/schedule";
import { isInactiveAccount } from "@/lib/client-engagement/status";
import { callTypeLabel, callTypeTone } from "@/lib/client-engagement/constants";
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
    const byType = new Map<string, number>();
    for (const e of engagements) {
      if (!runsOn(e, ymd)) continue;
      const account = accountById.get(e.accountId);
      if (account && isInactiveAccount(account)) continue;
      minutes += slotMinutes(e);
      calls += 1;
      byType.set(e.callType, (byType.get(e.callType) ?? 0) + 1);
    }
    return { minutes, calls, byType };
  };

  return (
    <div className={`${CARD} scroll-x-only`} style={CARD_SHADOW}>
      <div className="min-w-[800px]">
        <div className="grid bg-surface-soft" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
          <div className="px-1 py-2 text-center text-[10px] font-bold uppercase text-ink-subtle">Wk</div>
          {WEEKDAYS.map((d) => (
            <div key={d} className="border-l border-hairline px-1 py-2 text-center text-[11px] font-bold uppercase text-ink-subtle">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((w) => (
          <div key={w.week} className="grid border-t border-hairline" style={{ gridTemplateColumns: "48px repeat(7, 1fr)" }}>
            <button
              type="button"
              onClick={() => onPickWeek(w.days[0]!.ymd)}
              className="flex items-center justify-center bg-surface-soft px-1 py-1 text-[10.5px] font-bold text-ink-subtle transition hover:bg-[var(--color-altus-red-wash)] hover:text-[var(--color-altus-red-deep)]"
              title={`Open week ${w.week}`}
            >
              {w.week}
            </button>
            {w.days.map((d) => {
              const { minutes, calls, byType } = dayLoad(d.ymd);
              const isToday = d.ymd === today;
              return (
                <button
                  key={d.ymd}
                  type="button"
                  onClick={() => onPickWeek(mondayOf(d.ymd))}
                  className="min-h-[112px] border-l border-hairline p-2 text-left align-top transition hover:bg-surface-soft"
                  style={{
                    background: !d.inMonth ? "var(--color-surface-track)" : isToday ? "var(--color-altus-red-wash)" : undefined,
                    opacity: d.inMonth ? 1 : 0.55,
                  }}
                  title={calls ? `${calls} call${calls === 1 ? "" : "s"} · ${formatDuration(minutes)} — open this week` : "Open this week"}
                >
                  <span className={`block text-[13px] font-bold leading-none ${isToday ? "text-[var(--color-altus-red)]" : "text-ink-subtle"}`}>
                    {Number(d.ymd.slice(8, 10))}
                  </span>
                  {calls ? (
                    <div className="mt-2 flex flex-col gap-1">
                      {[...byType.entries()].map(([type, count]) => {
                        const tone = callTypeTone(type);
                        return (
                          <span
                            key={type}
                            className="flex items-center gap-1 truncate whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold"
                            style={{ background: `var(--color-${tone}-pale)`, color: `var(--color-${tone}-deep)`, border: `1px solid var(--color-${tone}-edge)` }}
                          >
                            {callTypeLabel(type, true)} · {count}
                          </span>
                        );
                      })}
                      <span className="mt-0.5 block whitespace-nowrap text-[10px] font-bold tabular-nums text-ink-subtle">{formatDuration(minutes)} total</span>
                    </div>
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
