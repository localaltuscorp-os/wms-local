"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { CalendarDays } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function isoToDate(iso: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return new Date(y, m - 1, d);
}

function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

/** "09-Aug-2026" — kept in sync with fmtTargetDate (components/goals/cascade/util.ts). */
function fmtDisplay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const y = iso.slice(0, 4);
  const mo = Number(iso.slice(5, 7));
  const da = iso.slice(8, 10);
  return `${da}-${MONTHS[mo - 1] ?? ""}-${y}`;
}

export interface DateInputProps {
  /** ISO yyyy-mm-dd, or "" for empty. */
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  /** Styling for the trigger button — sizing/border/background live here. */
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  ariaLabel?: string;
}

/** A "09-Aug-2026"-formatted date field with a calendar popup — replaces
 *  native `<input type="date">`, whose displayed text is rendered by the
 *  browser/OS locale and can never show a month abbreviation or a fixed
 *  format. Themed via the same react-day-picker CSS vars as filter-bar.tsx. */
export function DateInput({ value, onChange, disabled, className, style, placeholder = "dd-mmm-yyyy", ariaLabel }: DateInputProps) {
  const [open, setOpen] = React.useState(false);
  const selected = isoToDate(value);

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel ?? "Pick a date"}
          className={cn(
            "inline-flex items-center gap-1.5 text-left disabled:cursor-not-allowed disabled:opacity-60",
            className,
          )}
          style={style}
        >
          <CalendarDays size={13} className="shrink-0 text-ink-subtle" aria-hidden />
          <span className={cn("truncate tabular-nums", !value && "font-normal text-ink-subtle")}>
            {value ? fmtDisplay(value) : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <DayPicker
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (!d) return;
            onChange(dateToIso(d));
            setOpen(false);
          }}
          showOutsideDays
          weekStartsOn={1}
        />
      </PopoverContent>
    </Popover>
  );
}
