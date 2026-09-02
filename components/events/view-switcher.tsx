"use client";

/**
 * The calendar toolbar: Prev / Today / Next, a month picker, the Month / Week /
 * Overview view toggle, and the "New event" button. View + focus date are held
 * in the URL by the workspace (nuqs); this is a controlled presentational bar.
 */
import { ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarView } from "./model";
import { CALENDAR_VIEWS } from "./model";

const VIEW_LABEL: Record<CalendarView, string> = {
  month: "Month",
  week: "Week",
  overview: "Overview",
};

interface ViewSwitcherProps {
  view: CalendarView;
  onView: (v: CalendarView) => void;
  title: string;
  monthValue: string;
  onMonth: (value: string) => void;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
  onNew: () => void;
  isFetching: boolean;
}

export function ViewSwitcher({
  view,
  onView,
  title,
  monthValue,
  onMonth,
  onPrev,
  onToday,
  onNext,
  onNew,
  isFetching,
}: ViewSwitcherProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous"
          onClick={onPrev}
          className="inline-flex h-9 w-9 items-center justify-center rounded-chip border border-hairline bg-surface-card text-ink-strong hover:bg-surface-soft"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="inline-flex h-9 items-center rounded-chip border border-hairline bg-surface-card px-3 text-[13px] font-semibold text-ink-strong hover:bg-surface-soft"
        >
          Today
        </button>
        <button
          type="button"
          aria-label="Next"
          onClick={onNext}
          className="inline-flex h-9 w-9 items-center justify-center rounded-chip border border-hairline bg-surface-card text-ink-strong hover:bg-surface-soft"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <h2
        className="min-w-[9ch] text-ink-strong"
        style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 800, fontSize: 20, letterSpacing: "-0.01em" }}
      >
        {title}
      </h2>

      <input
        type="month"
        value={monthValue}
        onChange={(e) => e.target.value && onMonth(e.target.value)}
        className="h-9 rounded-chip border border-hairline bg-surface-card px-2.5 text-[13px] text-ink-strong outline-none focus:border-hairline-strong"
        aria-label="Jump to month"
      />

      {isFetching && <Loader2 size={16} className="animate-spin text-ink-soft" aria-hidden />}

      <div className="ml-auto flex items-center gap-2">
        <div className="inline-flex rounded-chip border border-hairline bg-surface-card p-0.5">
          {CALENDAR_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onView(v)}
              aria-pressed={view === v}
              className={cn(
                "h-8 rounded-[calc(var(--radius-chip,10px)-2px)] px-3 text-[12.5px] font-semibold transition-colors",
                view === v ? "text-white" : "text-ink-muted hover:text-ink-strong",
              )}
              style={view === v ? { background: "var(--color-altus-red, #c8102e)" } : undefined}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onNew}
          className="inline-flex h-9 items-center gap-1.5 rounded-chip px-3.5 text-[13px] font-semibold text-white"
          style={{ background: "var(--color-altus-red, #c8102e)" }}
        >
          <Plus size={16} /> New Event
        </button>
      </div>
    </div>
  );
}
