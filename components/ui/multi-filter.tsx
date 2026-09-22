"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { MultiSelect } from "./multi-select";
import { cn } from "@/lib/utils";

/**
 * A FILTER YOU CAN TICK MORE THAN ONE THING IN.
 *
 * Manan, 2026-09-21: "in drop down give multiple select also as well in
 * filters, do this in whole website."
 *
 * Most filters in the app were a single `<select>` — one Type, one Function,
 * one person. But the question people actually ask a list is rarely singular:
 * "show me Sales and Operations", "everything except Cancelled". A single-value
 * filter answers that by making you look three times and hold the comparison in
 * your head.
 *
 * ── IT IS A TRIGGER, NOT A NEW DROPDOWN ───────────────────────────────────
 * The panel is `MultiSelect`'s — the same searchable, keyboard-driven list with
 * the same Select all / Clear bar that every WMS filter bar already uses. All
 * this adds is a PILL that looks like the `<select>` it replaces, so a toolbar
 * keeps its shape and nothing has to be restyled per screen.
 *
 * ── EMPTY MEANS "NO FILTER", NOT "NOTHING" ────────────────────────────────
 * Ticking nothing shows everything, which is what the old `<option value="">All
 * Types</option>` meant and what every caller's predicate already does
 * (`if (picked.length && !picked.includes(v)) return false`). That is also why
 * Clear is the way back rather than a separate "All" row: the two would be the
 * same state wearing two names.
 */
export function MultiFilter({
  /** What the pill reads while nothing is ticked — "All Types", "Anyone". */
  allLabel,
  values,
  onChange,
  options,
  className,
  /**
   * Styling for the pill while the filter is doing something. Defaults to a red
   * border and red text — a toolbar of identical grey pills gives no clue which
   * of them is the reason the list is suddenly short.
   */
  activeClassName,
  disabled = false,
  "aria-label": ariaLabel,
}: {
  allLabel: string;
  values: string[];
  onChange: (next: string[]) => void;
  /** Plain strings, or value/label pairs when the two differ. */
  options: readonly string[] | readonly { value: string; label: string }[];
  className?: string;
  activeClassName?: string;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const opts = React.useMemo(
    () =>
      options.map((o) =>
        typeof o === "string" ? { value: o, label: o } : { value: o.value, label: o.label },
      ),
    [options],
  );

  return (
    <MultiSelect
      options={opts}
      selected={values}
      onChange={onChange}
      placeholder={allLabel}
      renderTrigger={({ selectedLabels, open }) => (
        <button
          type="button"
          disabled={disabled}
          // The label names the FIELD and then says what it is set to. An
          // `aria-label` replaces the button's text for a screen reader, so
          // without the second half the selection — the thing that changes —
          // would simply not be announced.
          aria-label={
            selectedLabels.length > 0
              ? `${ariaLabel ?? allLabel}: ${selectedLabels.join(", ")}`
              : `${ariaLabel ?? allLabel}: all`
          }
          // The whole selection on hover, because the pill only has room to
          // summarise it once more than two things are ticked.
          title={selectedLabels.length > 0 ? selectedLabels.join(", ") : allLabel}
          className={cn(
            "inline-flex min-w-0 shrink-0 items-center gap-1 disabled:cursor-not-allowed disabled:opacity-60",
            className,
            selectedLabels.length > 0 &&
              (activeClassName ?? "border-altus-red text-altus-red-deep"),
          )}
        >
          <span className="min-w-0 flex-1 truncate">{summarise(selectedLabels, allLabel)}</span>
          <ChevronDown
            size={13}
            strokeWidth={2.4}
            aria-hidden
            className={cn("shrink-0 opacity-60 transition-transform", open && "rotate-180")}
          />
        </button>
      )}
    />
  );
}

/**
 * What the closed pill says.
 *
 * One or two ticked are NAMED — that is the common case and the names are the
 * useful information. Past two they stop fitting, so the pill counts instead
 * and the tooltip carries the list. The count uses the filter's own noun
 * ("3 Types") rather than a bare number, because a toolbar of pills reading
 * "3", "2", "5" tells you nothing about which is which.
 */
function summarise(labels: string[], allLabel: string): string {
  if (labels.length === 0) return allLabel;
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.length} ${allLabel.replace(/^all\s+/i, "")}`;
}
