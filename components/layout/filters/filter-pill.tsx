"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";

/**
 * Pill-card filter trigger: a tinted icon badge, a two-line value/sublabel, and
 * a chevron. Used as the `asChild` trigger for each filter's Popover/dropdown.
 * forwardRef so Radix can attach its trigger props.
 */
export const FilterPill = React.forwardRef<
  HTMLButtonElement,
  {
    icon: React.ReactNode;
    /** The filter's name — small sublabel under the value (e.g. "Status"). */
    name: string;
    /** The current value summary (e.g. "High & Medium", "All Clients"). */
    value: string;
    /** Accent for the badge + value when a selection is active. Defaults to Altus red. */
    tint?: string;
    /** True when this filter has a non-default selection. */
    active?: boolean;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function FilterPill(
  { icon, name, value, tint = "var(--color-altus-red)", active = false, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      data-active={active}
      // Single-line, compact: icon + value + chevron. The value (e.g. "All
      // Status") is already self-describing, so the old sublabel is dropped to
      // fit every filter on one line; it lives on as the hover title.
      title={name}
      className={`filter-pill ${className ?? ""}`}
      {...props}
    >
      <span
        className="inline-flex items-center justify-center rounded-[6px] shrink-0"
        style={{
          width: 20,
          height: 20,
          background: active
            ? `color-mix(in srgb, ${tint} 14%, transparent)`
            : "var(--color-hairline)",
          color: active ? tint : "var(--color-ink-subtle)",
        }}
      >
        {icon}
      </span>
      {/* Capped tighter than before so seven pills + the view toggle + the
          switcher + search all hold one line. The full value is in `title`. */}
      <span className="text-[11.5px] font-semibold truncate max-w-[86px] text-ink-strong">
        {value}
      </span>
      <ChevronDown size={12} className="text-ink-subtle shrink-0" />
    </button>
  );
});

/** Summarise a multi-select for the pill's value line: "All X" / "A & B" / "N selected". */
export function summarizeSelection(labels: string[], allWord: string): string {
  if (labels.length === 0) return allWord;
  if (labels.length <= 2) return labels.join(" & ");
  return `${labels.length} selected`;
}
