"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import {
  ACTIVITY_PERIODS,
  type ActivityPeriod,
} from "@/lib/dashboard/manager-activity-contract";

/**
 * The window control for both delegation boards: presets and a custom range in
 * ONE popover, replacing the `<select>` that could only offer presets and then
 * had to spawn a second popover for dates.
 *
 * The applied range is committed on Apply, never on keystroke — binding the
 * board to the date inputs directly would refetch on every partial date the
 * reader types on the way to a real one.
 */

export function formatYmd(ymd: string): string {
  if (!ymd) return "";
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** What the trigger says it is showing. */
export function periodLabel(
  period: ActivityPeriod,
  custom: { from: string; to: string } | null,
): string {
  if (period === "custom") {
    return custom ? `${formatYmd(custom.from)} – ${formatYmd(custom.to)}` : "Custom range";
  }
  return ACTIVITY_PERIODS.find((p) => p.id === period)?.label ?? "Window";
}

export function PeriodRangePicker({
  period,
  custom,
  onChange,
  controlClassName,
}: {
  period: ActivityPeriod;
  custom: { from: string; to: string } | null;
  /** Fired only on a real selection: a preset, or Apply on a valid range. */
  onChange: (period: ActivityPeriod, custom: { from: string; to: string } | null) => void;
  /** The host toolbar's control recipe, so this button matches its siblings. */
  controlClassName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<{ from: string; to: string }>(
    custom ?? { from: "", to: "" },
  );
  const draftValid = draft.from !== "" && draft.to !== "" && draft.from <= draft.to;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        // Reopening starts from the APPLIED range, not from whatever half-typed
        // dates were abandoned last time.
        if (next) setDraft(custom ?? { from: "", to: "" });
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button type="button" title="Change the window" className={controlClassName}>
          <CalendarDays size={14} strokeWidth={2.4} />
          {periodLabel(period, custom)}
          <ChevronDown size={13} strokeWidth={2.8} className="opacity-60" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          className="z-50 w-[268px] rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          <p className="px-1.5 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
            Window
          </p>
          <div className="flex flex-col">
            {ACTIVITY_PERIODS.filter((p) => p.id !== "custom").map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id, null);
                  setOpen(false);
                }}
                className={`flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-semibold transition-colors hover:bg-slate-50 ${
                  period === p.id ? "text-[var(--color-altus-red)]" : "text-slate-700"
                }`}
              >
                {p.label}
                {period === p.id && <Check size={13} strokeWidth={3} />}
              </button>
            ))}
          </div>

          <div className="mt-2 border-t border-slate-100 pt-2">
            <p className="px-1.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
              Custom range
            </p>
            <div className="flex flex-col gap-2 px-1.5">
              <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
                Start date
                <input
                  type="date"
                  value={draft.from}
                  max={draft.to || undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                  className="h-9 rounded-lg border border-slate-200 px-2 text-[13px] font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
                End date
                <input
                  type="date"
                  value={draft.to}
                  min={draft.from || undefined}
                  onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                  className="h-9 rounded-lg border border-slate-200 px-2 text-[13px] font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]"
                />
              </label>
              {/* Disabled until both ends exist and the range runs forwards — an
                  inverted range silently falls back to the default window
                  server-side, which looks like the filter was ignored. */}
              <button
                type="button"
                disabled={!draftValid}
                onClick={() => {
                  onChange("custom", { ...draft });
                  setOpen(false);
                }}
                className="mb-1 w-full cursor-pointer rounded-lg bg-slate-900 px-3 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Apply range
              </button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
