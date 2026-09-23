"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * THE SELECT-ALL ROW — one bar, every multi-select in the app.
 *
 * Manan, 2026-09-21: "Create a Select All Options in all the WMS Drop Downs and
 * then I can deselect 1 or 2 unwanted options — do the same in all modules."
 *
 * The workflow it exists for is "everything except these two". Ticking twenty
 * clients one at a time was the only way to say that, because an EMPTY filter
 * means "no filter", not "everything selected" — the two are not
 * interchangeable, so the long way round was the only way round.
 *
 * It lives here rather than being re-typed per dropdown so the wording, the
 * counts and the keyboard behaviour are identical wherever you meet it: the
 * left half says what is ticked now, the right half offers the two bulk moves.
 *
 * `Select all` disappears once everything is ticked and `Clear` once nothing
 * is — a control that cannot change anything is noise, not an affordance.
 *
 * SELECT ALL TAKES THE WHOLE LIST, never what a search box has narrowed it to.
 * Several of these dropdowns filter inside a third-party list (cmdk) that never
 * reports what survived the query, so honouring the query would need a second
 * matcher guaranteed to disagree with the one drawing the rows. The count in
 * the label says exactly what the click will do.
 */
export function SelectAllBar({
  count,
  total,
  onSelectAll,
  onClear,
  /** Shown on the left when nothing is ticked. */
  emptyLabel = "None selected",
  /** Smaller type + tighter padding, for cell-level popovers and dense toolbars. */
  compact = false,
  className,
}: {
  count: number;
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
  emptyLabel?: string;
  compact?: boolean;
  className?: string;
}) {
  // Nothing to select and nothing to clear — an empty options list. Drawing the
  // bar there would promise two buttons that can never appear.
  if (total === 0 && count === 0) return null;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-hairline bg-black/[0.02]",
        compact ? "px-2 py-1.5" : "px-3 py-2",
        className,
      )}
    >
      <span
        className={cn(
          "font-bold uppercase tracking-[0.06em] text-ink-subtle",
          compact ? "text-[10.5px]" : "text-[11.5px]",
        )}
      >
        {count > 0 ? `${count} selected` : emptyLabel}
      </span>
      <span className="flex items-center gap-2.5">
        {count < total && (
          <button
            type="button"
            // Inside a Radix popover a mousedown can move focus and close the
            // panel before the click lands; the dropdowns that autofocus a
            // search box need the click to survive that.
            onMouseDown={(e) => e.preventDefault()}
            onClick={onSelectAll}
            className={cn(
              "font-bold text-ink-soft hover:text-ink-strong hover:underline cursor-pointer",
              compact ? "text-[11px]" : "text-[12px]",
            )}
          >
            Select all ({total})
          </button>
        )}
        {count > 0 && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClear}
            className={cn(
              "font-bold text-altus-red hover:underline cursor-pointer",
              compact ? "text-[11px]" : "text-[12px]",
            )}
          >
            Clear
          </button>
        )}
      </span>
    </div>
  );
}
