"use client";

import { categoryColors } from "@/lib/exec-calendar/taxonomy";
import { addMonths, monthWeeks, parseDay } from "@/lib/exec-calendar/grid";
import type { ExecEventRow } from "@/lib/queries/exec-calendar";

/**
 * DUAL-MONTH "SIGNATURE SHEET" VIEW (§2A view 1).
 *
 * The view the master sheet is actually shaped like: two months side by side,
 * each as whole Monday→Sunday rows carrying their ISO week number, with a hard
 * separator down the middle — the blank column the spreadsheet uses to keep the
 * two halves from reading as one 17-column table.
 *
 * Both months are laid out by `monthWeeks`, so their rows are whole weeks and
 * the week numbers line up down the page. That is the property that makes the
 * view worth having: you can read across a quarter without the rows drifting.
 *
 * Density over detail, on purpose (§6). A cell shows up to three dots-and-titles
 * and then "+n" — at this zoom the question is "what kind of week is that",
 * which colour answers, not "what exactly is at 14:30".
 */

const MAX_CHIPS = 3;
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function MonthBlock({
  anchor,
  events,
  today,
  onPickDay,
  onPickEvent,
}: {
  anchor: string;
  events: ExecEventRow[];
  today?: string;
  onPickDay?: (day: string) => void;
  onPickEvent?: (event: ExecEventRow) => void;
}) {
  const weeks = monthWeeks(anchor);
  const byDay = new Map<string, ExecEventRow[]>();
  for (const e of events) {
    const list = byDay.get(e.day) ?? [];
    list.push(e);
    byDay.set(e.day, list);
  }
  const monthLabel = parseDay(anchor).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="min-w-0 flex-1">
      <h3 className="mb-2 text-center text-[15px] font-bold text-ink-strong">{monthLabel}</h3>
      <div className="overflow-hidden rounded-xl border border-hairline">
        <div className="grid bg-surface-soft" style={{ gridTemplateColumns: "34px repeat(7, 1fr)" }}>
          <div className="px-1 py-1 text-center text-[9.5px] font-bold uppercase text-ink-subtle">Wk</div>
          {WEEKDAYS.map((d, i) => (
            <div
              key={i}
              className="border-l border-hairline px-1 py-1 text-center text-[9.5px] font-bold uppercase text-ink-subtle"
            >
              {d}
            </div>
          ))}
        </div>

        {weeks.map((w) => (
          <div
            key={w.week}
            className="grid border-t border-hairline"
            style={{ gridTemplateColumns: "34px repeat(7, 1fr)" }}
          >
            <div className="flex items-center justify-center bg-surface-soft px-1 py-1 text-[10px] font-bold text-ink-subtle">
              {w.week}
            </div>
            {w.days.map((d) => {
              const list = byDay.get(d.ymd) ?? [];
              const isToday = d.ymd === today;
              return (
                <div
                  key={d.ymd}
                  onClick={(ev) => {
                    if (!onPickDay) return;
                    if (ev.target !== ev.currentTarget) return;
                    onPickDay(d.ymd);
                  }}
                  className="min-h-[52px] border-l border-hairline p-[3px] align-top"
                  style={{
                    cursor: onPickDay ? "copy" : undefined,
                    background: !d.inMonth
                      ? "var(--color-surface-track)"
                      : isToday
                        ? "var(--color-altus-red-wash)"
                        : undefined,
                    opacity: d.inMonth ? 1 : 0.55,
                  }}
                >
                  <div
                    className={`text-[9.5px] font-bold leading-none ${isToday ? "text-[var(--color-altus-red)]" : "text-ink-subtle"}`}
                  >
                    {parseDay(d.ymd).getUTCDate()}
                  </div>
                  <div className="mt-[2px] space-y-[2px]">
                    {list.slice(0, MAX_CHIPS).map((e) => {
                      const col = categoryColors(e.categoryKey);
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => onPickEvent?.(e)}
                          className="block w-full truncate rounded-[3px] px-[3px] text-left text-[9px] font-semibold leading-[1.35]"
                          style={{ background: col.bg, color: col.deep }}
                          title={e.title}
                        >
                          {e.title}
                        </button>
                      );
                    })}
                    {list.length > MAX_CHIPS && (
                      <div className="px-[3px] text-[9px] font-bold text-ink-subtle">
                        +{list.length - MAX_CHIPS}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExecDualMonth({
  anchor,
  events,
  today,
  onPickDay,
  onPickEvent,
}: {
  /** Any day in the LEFT month; the right one is the month after. */
  anchor: string;
  events: ExecEventRow[];
  today?: string;
  onPickDay?: (day: string) => void;
  onPickEvent?: (event: ExecEventRow) => void;
}) {
  const right = addMonths(anchor, 1);
  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-4">
      <div className="flex gap-4 max-lg:flex-col">
        <MonthBlock anchor={anchor} events={events} today={today} onPickDay={onPickDay} onPickEvent={onPickEvent} />
        {/* The sheet's blank separator column, kept as a real divider. */}
        <div className="w-px shrink-0 bg-hairline-strong max-lg:h-px max-lg:w-full" aria-hidden />
        <MonthBlock anchor={right} events={events} today={today} onPickDay={onPickDay} onPickEvent={onPickEvent} />
      </div>
    </div>
  );
}
